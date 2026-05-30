#!/usr/bin/env python3
"""
generate-info.py - 递归生成或更新目录下的 ._info.json 文件

完全复刻 TypeScript 版本的功能，支持：
- 文件扫描和元数据提取
- MD5 和 SHA256 哈希计算
- Git 历史时间戳提取
- Hold 锁定机制
- 虚拟节点保留
- 忽略规则
- 字段排序和精简
"""

import os
import sys
import argparse
from typing import Dict, Optional, List

# 添加 lib 目录到 Python 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))

from lib.types import (
    InfoFile,
    NodeInfo,
    FileNodeInfo,
    DirectoryNodeInfo,
    GenerateInfoOptions,
    DEFAULT_IGNORE_PATTERNS,
)
from lib.logger import GenInfoLogger
from lib.config_loader import load_generate_info_config
from lib.file_scanner import (
    read_info_file,
    write_info_file,
    format_info_file,
    should_ignore,
    is_field_locked,
    get_default_description,
    is_hidden_by_default,
)
from lib.hash_utils import compute_file_hash
from lib.git_utils import get_git_timestamps, is_git_repository, get_git_root


def process_file_node(
    name: str,
    full_path: str,
    old_node: Optional[FileNodeInfo],
    options: GenerateInfoOptions,
    logger: GenInfoLogger,
    git_root: Optional[str],
) -> FileNodeInfo:
    """
    处理文件节点，生成或更新元数据

    Args:
        name: 文件名
        full_path: 文件完整路径
        old_node: 旧的节点数据（如果存在）
        options: 配置选项
        logger: 日志记录器
        git_root: Git 仓库根目录

    Returns:
        更新后的文件节点
    """
    force = options.force_update

    # 计算文件大小
    new_size = None
    if options.update_size and (force or not is_field_locked(old_node.get("hold") if old_node else None, "size")):
        try:
            new_size = os.path.getsize(full_path)
        except Exception as e:
            logger.debug(f"获取文件大小失败 ({full_path}): {e}")

    # 计算哈希
    new_md5 = None
    new_sha256 = None
    if options.calculate_hash and (force or not is_field_locked(old_node.get("hold") if old_node else None, "hash")):
        new_md5 = compute_file_hash("md5", full_path, logger)
        new_sha256 = compute_file_hash("sha256", full_path, logger)

    # 获取 Git 时间戳
    git_timestamps = None
    if options.use_git_history and git_root:
        git_timestamps = get_git_timestamps(full_path, git_root, logger)

    # 确定创建时间
    created_at = None
    if force and git_timestamps and git_timestamps.get("created_at"):
        created_at = git_timestamps["created_at"]
    elif old_node and is_field_locked(old_node.get("hold"), "created_at") and old_node.get("created_at"):
        created_at = old_node["created_at"]
    elif git_timestamps and git_timestamps.get("created_at"):
        if old_node and old_node.get("created_at"):
            # 取较早的时间
            created_at = min(git_timestamps["created_at"], old_node["created_at"])
        else:
            created_at = git_timestamps["created_at"]
    elif old_node and old_node.get("created_at"):
        created_at = old_node["created_at"]

    # 确定更新时间
    updated_at = None
    if git_timestamps and git_timestamps.get("updated_at"):
        if force or not is_field_locked(old_node.get("hold") if old_node else None, "updated_at"):
            updated_at = git_timestamps["updated_at"]
        elif old_node and old_node.get("updated_at"):
            updated_at = old_node["updated_at"]
    elif old_node and old_node.get("updated_at"):
        updated_at = old_node["updated_at"]

    # 构建新节点
    new_node: FileNodeInfo = {"type": "file"}

    # 保留旧的描述或生成默认描述
    if old_node and old_node.get("description"):
        new_node["description"] = old_node["description"]
    else:
        default_desc = get_default_description(name)
        if default_desc:
            new_node["description"] = default_desc

    # 保留其他字段
    if old_node:
        if old_node.get("hidden"):
            new_node["hidden"] = old_node["hidden"]
        if old_node.get("redirect"):
            new_node["redirect"] = old_node["redirect"]
        if old_node.get("hold"):
            new_node["hold"] = old_node["hold"]
        if old_node.get("version"):
            new_node["version"] = old_node["version"]
    elif is_hidden_by_default(name):
        new_node["hidden"] = True

    # 添加自动生成的字段
    if new_size is not None:
        new_node["size"] = new_size
    elif old_node and old_node.get("size") is not None:
        new_node["size"] = old_node["size"]

    if new_md5:
        new_node["md5"] = new_md5
    elif old_node and old_node.get("md5"):
        new_node["md5"] = old_node["md5"]

    if new_sha256:
        new_node["sha256"] = new_sha256
    elif old_node and old_node.get("sha256"):
        new_node["sha256"] = old_node["sha256"]

    if created_at:
        new_node["created_at"] = created_at

    if updated_at:
        new_node["updated_at"] = updated_at

    logger.stats["processedFiles"] += 1
    return new_node


def process_directory(
    dir_path: str,
    options: GenerateInfoOptions,
    logger: GenInfoLogger,
    git_root: Optional[str],
    ignore_patterns: List[str],
) -> InfoFile:
    """
    处理单个目录，生成或更新 ._info.json

    Args:
        dir_path: 目录路径
        options: 配置选项
        logger: 日志记录器
        git_root: Git 仓库根目录
        ignore_patterns: 忽略规则列表

    Returns:
        InfoFile 对象
    """
    logger.debug(f"处理目录: {dir_path}")

    # 读取现有的 ._info.json
    old_info = read_info_file(dir_path, options.output_filename)

    # 初始化新的 InfoFile
    new_info: InfoFile = {
        "self": old_info["self"] if old_info else {},
        "children": {},
    }

    # 扫描目录
    try:
        entries = os.listdir(dir_path)
    except Exception as e:
        logger.error(f"无法读取目录 {dir_path}: {e}")
        return new_info

    # 处理物理存在的文件和目录
    for entry in entries:
        # 跳过输出文件本身
        if entry == options.output_filename:
            continue

        # 检查忽略规则
        if should_ignore(entry, ignore_patterns):
            logger.debug(f"忽略: {entry}")
            logger.stats["skipped"] += 1
            continue

        full_path = os.path.join(dir_path, entry)
        old_node = old_info["children"].get(entry) if old_info else None

        if os.path.isfile(full_path):
            # 处理文件
            new_info["children"][entry] = process_file_node(
                entry, full_path, old_node, options, logger, git_root
            )
        elif os.path.isdir(full_path):
            # 处理目录
            new_node: DirectoryNodeInfo = {"type": "folder"}

            if old_node:
                # 保留旧的元数据
                if old_node.get("description"):
                    new_node["description"] = old_node["description"]
                if old_node.get("hidden"):
                    new_node["hidden"] = old_node["hidden"]
                if old_node.get("redirect"):
                    new_node["redirect"] = old_node["redirect"]
                if old_node.get("mountSource"):
                    new_node["mountSource"] = old_node["mountSource"]
                if old_node.get("hold"):
                    new_node["hold"] = old_node["hold"]
                if old_node.get("created_at"):
                    new_node["created_at"] = old_node["created_at"]
                if old_node.get("updated_at"):
                    new_node["updated_at"] = old_node["updated_at"]
            elif is_hidden_by_default(entry):
                new_node["hidden"] = True

            new_info["children"][entry] = new_node
            logger.stats["processedFolders"] += 1

            # 递归处理子目录
            if options.recursive:
                process_directory(full_path, options, logger, git_root, ignore_patterns)

    # 保留虚拟节点
    if old_info:
        for name, old_node in old_info["children"].items():
            if name not in new_info["children"]:
                # 检查是否为虚拟节点（有 redirect 或 mountSource 字段）
                if old_node.get("redirect") or old_node.get("mountSource"):
                    new_info["children"][name] = old_node
                    logger.stats["virtualNodes"] += 1
                    logger.debug(f"保留虚拟节点: {name}")
                elif options.clean_invalid:
                    logger.stats["removed"] += 1
                    logger.debug(f"移除失效节点: {name}")
                else:
                    # 不清理，保留节点
                    new_info["children"][name] = old_node

    # 格式化输出
    new_info = format_info_file(new_info, options)

    # 写入文件
    write_info_file(dir_path, new_info, options.output_filename, options.dry_run)

    if options.dry_run:
        logger.info(f"[预览] {dir_path}/{options.output_filename}")
    else:
        logger.success(f"已更新: {dir_path}/{options.output_filename}")

    return new_info


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="递归生成或更新目录下的 ._info.json 文件",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("root_dir", nargs="?", default=".", help="扫描的根目录（默认: .）")
    parser.add_argument("--config", help="配置文件路径")
    parser.add_argument("--output", help="输出文件名（默认: ._info.json）")
    parser.add_argument("--recursive", action="store_true", help="递归处理子目录")
    parser.add_argument("--no-recursive", dest="recursive", action="store_false", help="不递归处理子目录")
    parser.add_argument("--force", action="store_true", help="忽略 hold 锁定，强制更新")
    parser.add_argument("--dry-run", action="store_true", help="预览模式，不写入文件")
    parser.add_argument("--no-hash", dest="calculate_hash", action="store_false", help="不计算哈希")
    parser.add_argument("--no-git", dest="use_git_history", action="store_false", help="不使用 Git 历史")
    parser.add_argument("--no-size", dest="update_size", action="store_false", help="不更新文件大小")
    parser.add_argument("--no-clean", dest="clean_invalid", action="store_false", help="不清理失效节点")
    parser.add_argument("--no-clean-ignored", dest="clean_ignored", action="store_false", help="不清理被忽略的节点")
    parser.add_argument("--no-purify", dest="purify_folders", action="store_false", help="不精简目录节点")
    parser.add_argument("--no-format", dest="format_output", action="store_false", help="不格式化输出")
    parser.add_argument("--ignore", action="append", help="额外的忽略规则（正则表达式）")
    parser.add_argument("--verbose", action="store_true", help="输出详细日志")

    args = parser.parse_args()

    # 加载配置
    options = load_generate_info_config(args.config)

    # 命令行参数覆盖配置文件
    if args.root_dir != ".":
        options.root_dir = args.root_dir
    if args.output:
        options.output_filename = args.output
    if args.recursive is not None:
        options.recursive = args.recursive
    if args.force:
        options.force_update = args.force
    if args.dry_run:
        options.dry_run = args.dry_run
    if args.calculate_hash is not None:
        options.calculate_hash = args.calculate_hash
    if args.use_git_history is not None:
        options.use_git_history = args.use_git_history
    if args.update_size is not None:
        options.update_size = args.update_size
    if args.clean_invalid is not None:
        options.clean_invalid = args.clean_invalid
    if args.clean_ignored is not None:
        options.clean_ignored = args.clean_ignored
    if args.purify_folders is not None:
        options.purify_folders = args.purify_folders
    if args.format_output is not None:
        options.format_output = args.format_output
    if args.ignore:
        options.ignore_patterns.extend(args.ignore)
    if args.verbose:
        options.verbose = args.verbose

    # 初始化日志
    logger = GenInfoLogger(options.verbose)

    # 解析根目录
    root_dir = os.path.abspath(options.root_dir)
    if not os.path.isdir(root_dir):
        logger.error(f"目录不存在: {root_dir}")
        sys.exit(1)

    logger.info(f"开始扫描: {root_dir}")

    # 检查 Git 仓库
    git_root = None
    if options.use_git_history:
        if is_git_repository(root_dir):
            git_root = get_git_root(root_dir)
            logger.info(f"检测到 Git 仓库: {git_root}")
        else:
            logger.warning("未检测到 Git 仓库，将跳过 Git 时间戳提取")

    # 合并忽略规则
    ignore_patterns = DEFAULT_IGNORE_PATTERNS + options.ignore_patterns

    # 处理目录
    try:
        process_directory(root_dir, options, logger, git_root, ignore_patterns)
        logger.print_summary()
    except KeyboardInterrupt:
        logger.warning("\n操作已取消")
        sys.exit(1)
    except Exception as e:
        logger.error(f"发生错误: {e}")
        if options.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
