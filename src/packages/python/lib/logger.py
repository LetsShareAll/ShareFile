"""
日志系统

提供带颜色的终端输出和统计功能。
"""

import time
from typing import Dict


class Logger:
    """基础日志记录器"""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.start_time = time.time()

    def info(self, message: str):
        """输出信息日志"""
        try:
            print(f"\033[36mℹ\033[0m {message}")
        except UnicodeEncodeError:
            print(f"\033[36m[INFO]\033[0m {message}")

    def success(self, message: str):
        """输出成功日志"""
        try:
            print(f"\033[32m✓\033[0m {message}")
        except UnicodeEncodeError:
            print(f"\033[32m[OK]\033[0m {message}")

    def warning(self, message: str):
        """输出警告日志"""
        try:
            print(f"\033[33m⚠\033[0m {message}")
        except UnicodeEncodeError:
            print(f"\033[33m[WARN]\033[0m {message}")

    def error(self, message: str):
        """输出错误日志"""
        try:
            print(f"\033[31m✗\033[0m {message}")
        except UnicodeEncodeError:
            print(f"\033[31m[ERROR]\033[0m {message}")

    def debug(self, message: str):
        """输出调试日志（仅在 verbose 模式下）"""
        if self.verbose:
            print(f"\033[90m[DEBUG]\033[0m {message}")

    def get_elapsed_seconds(self) -> float:
        """获取从创建 Logger 到现在的耗时（秒）"""
        return round(time.time() - self.start_time, 2)


class GenInfoLogger(Logger):
    """generate-info 专用日志记录器"""

    def __init__(self, verbose: bool = False):
        super().__init__(verbose)
        self.stats: Dict[str, int] = {
            "processedFiles": 0,
            "processedFolders": 0,
            "virtualNodes": 0,
            "removed": 0,
            "skipped": 0,
        }

    def print_summary(self):
        """打印执行摘要"""
        try:
            print("\n\033[1m\033[36m=== 生成执行摘要 ===\033[0m")
            print(f"⏱️  总计耗时: \033[33m{self.get_elapsed_seconds()} s\033[0m")
            print(f"📄 处理文件: \033[32m{self.stats['processedFiles']}\033[0m")
            print(f"📁 处理目录: \033[32m{self.stats['processedFolders']}\033[0m")
            print(f"👻 虚拟节点: \033[36m{self.stats['virtualNodes']}\033[0m")
            print(f"🧹 清理节点: \033[31m{self.stats['removed']}\033[0m")
            print(f"⏭️  跳过扫描: \033[90m{self.stats['skipped']}\033[0m\n")
        except UnicodeEncodeError:
            print("\n\033[1m\033[36m=== Summary ===\033[0m")
            print(f"Time: \033[33m{self.get_elapsed_seconds()} s\033[0m")
            print(f"Files: \033[32m{self.stats['processedFiles']}\033[0m")
            print(f"Folders: \033[32m{self.stats['processedFolders']}\033[0m")
            print(f"Virtual: \033[36m{self.stats['virtualNodes']}\033[0m")
            print(f"Removed: \033[31m{self.stats['removed']}\033[0m")
            print(f"Skipped: \033[90m{self.stats['skipped']}\033[0m\n")


class GenShareLogger(Logger):
    """generate-share-file 专用日志记录器"""

    def __init__(self, verbose: bool = False):
        super().__init__(verbose)
        self.stats: Dict[str, int] = {
            "processedFolders": 0,
            "mappedNodes": 0,
        }

    def print_summary(self):
        """打印执行摘要"""
        try:
            print("\n\033[1m\033[36m=== 构建执行摘要 ===\033[0m")
            print(f"⏱️  总计耗时: \033[33m{self.get_elapsed_seconds()} s\033[0m")
            print(f"📁 遍历目录: \033[32m{self.stats['processedFolders']}\033[0m")
            print(f"🔗 映射节点: \033[36m{self.stats['mappedNodes']}\033[0m\n")
        except UnicodeEncodeError:
            print("\n\033[1m\033[36m=== Summary ===\033[0m")
            print(f"Time: \033[33m{self.get_elapsed_seconds()} s\033[0m")
            print(f"Folders: \033[32m{self.stats['processedFolders']}\033[0m")
            print(f"Nodes: \033[36m{self.stats['mappedNodes']}\033[0m\n")
