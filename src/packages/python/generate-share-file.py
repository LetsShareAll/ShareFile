#!/usr/bin/env python3
"""
generate-share-file.py - 根据目录树中的 ._info.json 生成 share-file.json

完全复刻 TypeScript 版本的功能，支持：
- 递归读取 ._info.json
- 构建扁平化节点索引
- 生成路径映射
- 生成 CDN 版本索引
"""

import os
import sys
import json
import argparse
from typing import Dict, List, Optional
from urllib.parse import quote

# 添加 lib 目录到 Python 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))

from lib.types import (
    InfoFile,
    ShareFile,
    ShareNode,
    GenerateShareFileOptions,
)
from lib.logger import GenShareLogger
from lib.config_loader import load_generate_share_file_config
from lib.file_scanner import read_info_file


def build_share_file(
    root_dir: str,
    options: GenerateShareFileOptions,
    logger: GenShareLogger,
) -> ShareFile:
    """
    构建 ShareFile 数据结构

    Args:
        root_dir: 根目录路径
        options: 配置选项
        logger: 日志记录器

    Returns:
        ShareFile 对象
    """
    nodes: Dict[str, ShareNode] = {}
    path_index: Dict[str, str] = {}

    def process_directory(dir_path: str, parent_id: Optional[str], current_path: str):
        """递归处理目录"""
        logger.debug(f"处理目录: {dir_path}")
        logger.stats["processedFolders"] += 1

        # 读取 ._info.json
        info = read_info_file(dir_path)
        if not info:
            logger.warning(f"未找到 ._info.json: {dir_path}")
            return

        # 处理当前目录节点
        dir_name = os.path.basename(dir_path) if parent_id else "/"
        node_id = current_path.replace("\\", "/") if current_path else "root"

        # 创建目录节点
        dir_node: ShareNode = {
            "id": node_id,
            "name": dir_name,
            "type": "folder",
            "parent": parent_id,
            "children": [],
            "source": "local",
        }

        # 添加 self 信息
        if info["self"].get("description"):
            dir_node["description"] = info["self"]["description"]
        if info["self"].get("hidden"):
            dir_node["hidden"] = info["self"]["hidden"]
        if info["self"].get("created_at"):
            dir_node["created_at"] = info["self"]["created_at"]
        if info["self"].get("updated_at"):
            dir_node["updated_at"] = info["self"]["updated_at"]

        # 处理重定向
        if info["self"].get("redirect"):
            redirect = info["self"]["redirect"]
            dir_node["redirect_url"] = redirect["url"]
            dir_node["redirect_type"] = redirect["type"]
            if redirect.get("confirm_message"):
                dir_node["redirect_confirm_message"] = redirect["confirm_message"]

        nodes[node_id] = dir_node
        path_index[current_path if current_path else "/"] = node_id
        logger.stats["mappedNodes"] += 1

        # 处理子节点
        for child_name, child_info in info["children"].items():
            child_path = os.path.join(current_path, child_name) if current_path else child_name
            child_id = child_path.replace("\\", "/")
            child_full_path = os.path.join(dir_path, child_name)

            is_file = child_info.get("type") == "file"
            is_virtual = child_info.get("redirect") is not None

            # 创建子节点
            child_node: ShareNode = {
                "id": child_id,
                "name": child_name,
                "type": "file" if is_file else "folder",
                "parent": node_id,
                "children": [],
                "source": "local",
            }

            # 添加基础信息
            if child_info.get("description"):
                child_node["description"] = child_info["description"]
            if child_info.get("hidden"):
                child_node["hidden"] = child_info["hidden"]
            if child_info.get("created_at"):
                child_node["created_at"] = child_info["created_at"]
            if child_info.get("updated_at"):
                child_node["updated_at"] = child_info["updated_at"]

            # 文件特有字段
            if is_file:
                if child_info.get("version"):
                    child_node["version"] = child_info["version"]
                if child_info.get("size") is not None:
                    child_node["size"] = child_info["size"]
                if child_info.get("md5"):
                    child_node["md5"] = child_info["md5"]
                if child_info.get("sha256"):
                    child_node["sha256"] = child_info["sha256"]

                # 生成文件 URL（相对于根目录）
                if not is_virtual:
                    rel_path = os.path.relpath(child_full_path, root_dir).replace("\\", "/")
                    child_node["url"] = f"/{rel_path}"

            # 处理重定向
            if child_info.get("redirect"):
                redirect = child_info["redirect"]
                child_node["redirect_url"] = redirect["url"]
                child_node["redirect_type"] = redirect["type"]
                if redirect.get("confirm_message"):
                    child_node["redirect_confirm_message"] = redirect["confirm_message"]

            nodes[child_id] = child_node
            path_index[f"/{child_path.replace(os.sep, '/')}"] = child_id
            dir_node["children"].append(child_id)
            logger.stats["mappedNodes"] += 1

            # 递归处理子目录
            if not is_file and not is_virtual and os.path.isdir(child_full_path):
                process_directory(child_full_path, node_id, child_path)

    # 从根目录开始处理
    process_directory(root_dir, None, "")

    return {
        "rootId": "root",
        "pathIndex": path_index,
        "nodes": nodes,
    }


def generate_cdn_version(
    share_file: ShareFile, cdn_base_url: str, logger: GenShareLogger
) -> ShareFile:
    """
    生成 CDN 版本的 share-file.json

    Args:
        share_file: 原始 ShareFile
        cdn_base_url: CDN 基础 URL
        logger: 日志记录器

    Returns:
        CDN 版本的 ShareFile
    """
    cdn_share_file = {
        "rootId": share_file["rootId"],
        "pathIndex": share_file["pathIndex"].copy(),
        "nodes": {},
    }

    for node_id, node in share_file["nodes"].items():
        cdn_node = node.copy()

        # 重写文件 URL
        if node["type"] == "file" and node.get("url") and not node.get("redirect_url"):
            # 移除开头的 /
            rel_path = node["url"].lstrip("/")
            # URL 编码
            encoded_path = "/".join(quote(part, safe="") for part in rel_path.split("/"))
            cdn_node["url"] = f"{cdn_base_url}/{encoded_path}"

        cdn_share_file["nodes"][node_id] = cdn_node

    return cdn_share_file


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="根据目录树中的 ._info.json 生成 share-file.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument("root_dir", nargs="?", default=".", help="扫描的根目录（默认: .）")
    parser.add_argument("output_file", nargs="?", help="输出文件路径（默认: {root_dir}/share-file.json）")
    parser.add_argument("--config", help="配置文件路径")
    parser.add_argument("--cdn-url", help="CDN 基础 URL")
    parser.add_argument("--verbose", action="store_true", help="输出详细日志")

    args = parser.parse_args()

    # 加载配置
    options = load_generate_share_file_config(args.config)

    # 命令行参数覆盖配置文件
    if args.root_dir != ".":
        options.root_dir = args.root_dir
    if args.output_file:
        options.output_file = args.output_file
    if args.cdn_url:
        options.cdn_base_url = args.cdn_url
    if args.verbose:
        options.verbose = args.verbose

    # 从环境变量读取 CDN URL
    if not options.cdn_base_url:
        options.cdn_base_url = os.environ.get("SHARE_FILE_CDN_URL", "")

    # 初始化日志
    logger = GenShareLogger(options.verbose)

    # 解析根目录
    root_dir = os.path.abspath(options.root_dir)
    if not os.path.isdir(root_dir):
        logger.error(f"目录不存在: {root_dir}")
        sys.exit(1)

    logger.info(f"开始构建索引: {root_dir}")

    try:
        # 构建 ShareFile
        share_file = build_share_file(root_dir, options, logger)

        # 写入普通版本
        output_path = os.path.abspath(options.output_file)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(share_file, f, ensure_ascii=False, indent=2)
            f.write("\n")

        logger.success(f"已生成: {output_path}")

        # 生成 CDN 版本
        if options.cdn_base_url:
            cdn_output_path = output_path.replace(".json", ".cdn.json")
            cdn_share_file = generate_cdn_version(share_file, options.cdn_base_url, logger)

            with open(cdn_output_path, "w", encoding="utf-8") as f:
                json.dump(cdn_share_file, f, ensure_ascii=False, indent=2)
                f.write("\n")

            logger.success(f"已生成 CDN 版本: {cdn_output_path}")

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
