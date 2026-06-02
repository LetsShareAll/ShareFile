"""
文件扫描器

提供目录扫描、节点处理、._info.json 读写等核心功能。
"""

import os
import json
import re
from typing import Dict, Optional, List, Any
from .types import (
    InfoFile,
    NodeInfo,
    BaseInfo,
    FileNodeInfo,
    DirectoryNodeInfo,
    HoldInfo,
    DEFAULT_IGNORE_PATTERNS,
    DEFAULT_DESCRIPTION_MAP,
    BASE_FIELD_ORDER,
    FILE_SPECIFIC_FIELD_ORDER,
    GenerateInfoOptions,
)
from .logger import GenInfoLogger
from .hash_utils import compute_file_hash
from .git_utils import get_git_timestamps, is_git_repository, get_git_root

MOUNT_SOURCE_FIELDS = [
    "provider",
    "repository",
    "branch",
    "sub_path",
    "access_cdn",
    "use_cdn_index",
]


def is_field_locked(hold: Optional[Any], field: str) -> bool:
    """
    检查字段是否被锁定

    Args:
        hold: hold 配置，可以是 bool 或 HoldInfo 字典
        field: 字段名

    Returns:
        如果字段被锁定返回 True
    """
    if hold is None:
        return False
    if isinstance(hold, bool):
        return hold
    if isinstance(hold, dict):
        return hold.get(field, False)
    return False


def should_ignore(name: str, patterns: List[str]) -> bool:
    """
    检查文件/目录名是否应该被忽略

    Args:
        name: 文件或目录名
        patterns: 正则表达式模式列表

    Returns:
        如果应该忽略返回 True
    """
    for pattern in patterns:
        if re.match(pattern, name):
            return True
    return False


def get_default_description(filename: str, node_type: str = "file") -> str:
    """
    根据文件扩展名获取默认描述

    Args:
        filename: 文件名

    Returns:
        Python CLI 使用的默认描述。
    """
    if node_type == "self":
        return "当前目录"
    if node_type == "folder":
        return "文件夹"

    lower_name = filename.lower()

    for ext in sorted(DEFAULT_DESCRIPTION_MAP.keys(), key=len, reverse=True):
        if lower_name.endswith(ext):
            return DEFAULT_DESCRIPTION_MAP[ext]

    # 普通扩展名
    _, ext = os.path.splitext(lower_name)
    if ext:
        return f"{ext[1:].upper()} 文件"

    return "文件"


def is_hidden_by_default(name: str) -> bool:
    """
    检查文件/目录是否应该默认隐藏

    Args:
        name: 文件或目录名

    Returns:
        如果应该默认隐藏返回 True
    """
    return (
        name.startswith(".")
        or name.endswith("~")
        or name == "Thumbs.db"
        or name == "desktop.ini"
    )


def normalize_mount_source(value: Optional[Any]) -> Optional[Dict[str, Any]]:
    """Keep only current mount_source keys."""
    if not isinstance(value, dict):
        return None

    return {key: value[key] for key in MOUNT_SOURCE_FIELDS if key in value}


def get_mount_source(node: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Read mount source from the current snake_case node field."""
    if not node:
        return None

    return normalize_mount_source(node.get("mount_source"))


def normalize_node_fields(node: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize node field names before writing ._info.json."""
    normalized = dict(node)
    mount_source = get_mount_source(normalized)

    if mount_source is not None:
        normalized["mount_source"] = mount_source

    return normalized


def read_info_file(dir_path: str, filename: str = "._info.json") -> Optional[InfoFile]:
    """
    读取目录的 ._info.json 文件

    Args:
        dir_path: 目录路径
        filename: 信息文件名

    Returns:
        InfoFile 对象，如果文件不存在或解析失败则返回 None
    """
    info_path = os.path.join(dir_path, filename)
    if not os.path.exists(info_path):
        return None

    try:
        with open(info_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except Exception:
        return None


def sort_node_fields(node: Dict[str, Any], is_file: bool) -> Dict[str, Any]:
    """
    按预定义顺序排序节点字段

    Args:
        node: 节点数据
        is_file: 是否为文件节点

    Returns:
        排序后的节点数据
    """
    node = normalize_node_fields(node)
    sorted_node = {}

    # 基础字段
    for field in BASE_FIELD_ORDER:
        if field in node:
            sorted_node[field] = node[field]

    # 文件特有字段
    if is_file:
        for field in FILE_SPECIFIC_FIELD_ORDER:
            if field in node:
                sorted_node[field] = node[field]

    # 其他字段
    for key, value in node.items():
        if key not in sorted_node:
            sorted_node[key] = value

    return sorted_node


def format_info_file(info: InfoFile, options: GenerateInfoOptions) -> InfoFile:
    """
    格式化 InfoFile，包括字段排序和精简

    Args:
        info: InfoFile 对象
        options: 配置选项

    Returns:
        格式化后的 InfoFile
    """
    if not options.format_output:
        return info

    formatted = {"self": {}, "children": {}}

    # 格式化 self
    formatted["self"] = sort_node_fields(info["self"], False)

    # 格式化 children
    for name, node in info["children"].items():
        is_file = node.get("type") == "file"

        # Purify: 移除目录节点的文件特有字段
        if options.purify_folders and not is_file:
            node = {k: v for k, v in node.items() if k not in ["size", "md5", "sha256", "version"]}

        formatted["children"][name] = sort_node_fields(node, is_file)

    return formatted


def write_info_file(
    dir_path: str, info: InfoFile, filename: str = "._info.json", dry_run: bool = False
):
    """
    写入 ._info.json 文件

    Args:
        dir_path: 目录路径
        info: InfoFile 对象
        filename: 输出文件名
        dry_run: 是否为预览模式
    """
    if dry_run:
        return

    info_path = os.path.join(dir_path, filename)
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(info, f, ensure_ascii=False, indent=2)
        f.write("\n")  # 添加末尾换行符
