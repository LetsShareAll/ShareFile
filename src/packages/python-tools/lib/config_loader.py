"""
配置文件加载器

支持从 YAML 配置文件和命令行参数加载配置。
"""

import os
from typing import Optional
from .types import GenerateInfoOptions, GenerateShareFileOptions


def load_yaml_config(config_file: str):
    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError(
            "读取 YAML 配置文件需要安装 PyYAML: pip install -r requirements.txt"
        ) from exc

    with open(config_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_generate_info_config(
    config_file: Optional[str] = None,
) -> GenerateInfoOptions:
    """
    加载 generate-info 配置

    Args:
        config_file: 配置文件路径，如果为 None 则使用默认配置

    Returns:
        GenerateInfoOptions 配置对象
    """
    options = GenerateInfoOptions()

    if config_file and os.path.exists(config_file):
        config = load_yaml_config(config_file)

        if config and "generate_info" in config:
            cfg = config["generate_info"]
            options.root_dir = cfg.get("root_dir", options.root_dir)
            options.output_filename = cfg.get(
                "output_filename", options.output_filename
            )
            options.recursive = cfg.get("recursive", options.recursive)
            options.calculate_hash = cfg.get("calculate_hash", options.calculate_hash)
            options.use_git_history = cfg.get(
                "use_git_history", options.use_git_history
            )
            options.update_size = cfg.get("update_size", options.update_size)
            options.clean_invalid = cfg.get("clean_invalid", options.clean_invalid)
            options.clean_ignored = cfg.get("clean_ignored", options.clean_ignored)
            options.purify_folders = cfg.get("purify_folders", options.purify_folders)
            options.format_output = cfg.get("format_output", options.format_output)
            options.force_update = cfg.get("force_update", options.force_update)
            options.dry_run = cfg.get("dry_run", options.dry_run)
            options.verbose = cfg.get("verbose", options.verbose)
            options.ignore_patterns = cfg.get("ignore_patterns", [])

    return options


def load_generate_share_file_config(
    config_file: Optional[str] = None,
) -> GenerateShareFileOptions:
    """
    加载 generate-share-file 配置

    Args:
        config_file: 配置文件路径，如果为 None 则使用默认配置

    Returns:
        GenerateShareFileOptions 配置对象
    """
    options = GenerateShareFileOptions()

    if config_file and os.path.exists(config_file):
        config = load_yaml_config(config_file)

        if config and "generate_share_file" in config:
            cfg = config["generate_share_file"]
            options.root_dir = cfg.get("root_dir", options.root_dir)
            options.output_file = cfg.get("output_file", options.output_file)
            options.cdn_base_url = cfg.get("cdn_base_url", options.cdn_base_url)
            options.verbose = cfg.get("verbose", options.verbose)

    return options
