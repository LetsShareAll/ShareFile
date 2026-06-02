"""
哈希计算工具

提供 MD5 和 SHA256 哈希计算功能。
"""

import hashlib
from typing import Literal
from .logger import Logger


def compute_file_hash(
    hash_type: Literal["md5", "sha256"], file_path: str, logger: Logger
) -> str:
    """
    计算文件哈希值

    Args:
        hash_type: 哈希类型，'md5' 或 'sha256'
        file_path: 文件路径
        logger: 日志记录器

    Returns:
        哈希值的十六进制字符串
    """
    try:
        if hash_type == "md5":
            hasher = hashlib.md5()
        elif hash_type == "sha256":
            hasher = hashlib.sha256()
        else:
            raise ValueError(f"不支持的哈希类型: {hash_type}")

        with open(file_path, "rb") as f:
            # 分块读取，避免大文件占用过多内存
            while chunk := f.read(8192):
                hasher.update(chunk)

        return hasher.hexdigest()
    except Exception as e:
        logger.debug(f"计算 {hash_type.upper()} 失败 ({file_path}): {e}")
        return None
