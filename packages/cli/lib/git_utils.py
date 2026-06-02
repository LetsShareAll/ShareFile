"""
Git 工具

提供从 Git 历史提取文件时间戳的功能。
"""

import subprocess
from datetime import datetime, timezone
from typing import Optional, Dict
from .logger import Logger


def normalize_git_timestamp(value: str) -> str:
    """Normalize Git ISO timestamps to UTC with the public ._info.json shape."""
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def get_git_timestamps(
    file_path: str, repo_root: str, logger: Logger
) -> Optional[Dict[str, str]]:
    """
    从 Git 历史获取文件的创建和更新时间

    Args:
        file_path: 文件的绝对路径
        repo_root: Git 仓库根目录
        logger: 日志记录器

    Returns:
        包含 created_at 和 updated_at 的字典，如果失败则返回 None
    """
    try:
        # 获取相对于仓库根目录的路径
        import os

        rel_path = os.path.relpath(
            os.path.realpath(file_path),
            os.path.realpath(repo_root),
        )

        # 获取最早的提交时间（创建时间）
        result_created = subprocess.run(
            [
                "git",
                "-C",
                repo_root,
                "log",
                "--follow",
                "--format=%aI",
                "--reverse",
                "--",
                rel_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        # 获取最新的提交时间（更新时间）
        result_updated = subprocess.run(
            [
                "git",
                "-C",
                repo_root,
                "log",
                "--follow",
                "--format=%aI",
                "-1",
                "--",
                rel_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        created_at = None
        updated_at = None

        if result_created.returncode == 0 and result_created.stdout.strip():
            created_at = normalize_git_timestamp(
                result_created.stdout.strip().split("\n")[0]
            )

        if result_updated.returncode == 0 and result_updated.stdout.strip():
            updated_at = normalize_git_timestamp(
                result_updated.stdout.strip().split("\n")[0]
            )

        if created_at or updated_at:
            return {"created_at": created_at, "updated_at": updated_at}

        return None

    except Exception as e:
        logger.debug(f"获取 Git 时间戳失败 ({file_path}): {e}")
        return None


def is_git_repository(path: str) -> bool:
    """
    检查指定路径是否在 Git 仓库中

    Args:
        path: 要检查的路径

    Returns:
        如果在 Git 仓库中返回 True，否则返回 False
    """
    try:
        result = subprocess.run(
            ["git", "-C", path, "rev-parse", "--git-dir"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def get_git_root(path: str) -> Optional[str]:
    """
    获取 Git 仓库根目录

    Args:
        path: 仓库内的任意路径

    Returns:
        仓库根目录的绝对路径，如果不在仓库中则返回 None
    """
    try:
        result = subprocess.run(
            ["git", "-C", path, "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return None
    except Exception:
        return None
