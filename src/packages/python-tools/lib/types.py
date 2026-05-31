"""
类型定义和常量

对应 TypeScript 版本的类型系统和默认配置。
"""

from typing import TypedDict, Literal, Optional, Union, Dict, List
from dataclasses import dataclass


# ────────────── 默认配置 ──────────────

DEFAULT_CDN_BASE_URL = (
    "https://cdn-file.lssa.fun/"
    "raw.githubusercontent.com/LetsShareAll/ShareFile/main/public"
)


# ────────────── 类型定义 ──────────────


class RedirectInfo(TypedDict, total=False):
    """重定向配置"""

    url: str
    type: Literal["direct", "confirm"]
    confirm_message: Optional[str]


class HoldInfo(TypedDict, total=False):
    """字段锁定配置"""

    size: bool
    hash: bool
    created_at: bool
    updated_at: bool


class MountSourceInfo(TypedDict, total=False):
    """外部存储挂载源配置"""

    provider: Literal["github"]
    repository: str
    branch: Optional[str]
    sub_path: Optional[str]
    access_cdn: Optional[str]
    use_cdn_index: Optional[bool]


class BaseInfo(TypedDict, total=False):
    """节点基础信息"""

    description: Optional[str]
    hidden: Optional[bool]
    redirect: Optional[RedirectInfo]
    hold: Optional[Union[bool, HoldInfo]]
    created_at: Optional[str]
    updated_at: Optional[str]


class FileNodeInfo(BaseInfo, total=False):
    """文件节点信息"""

    type: Literal["file"]
    version: Optional[str]
    size: Optional[int]
    md5: Optional[str]
    sha256: Optional[str]


class DirectoryNodeInfo(BaseInfo, total=False):
    """目录节点信息"""

    type: Literal["folder"]
    mount_source: Optional[MountSourceInfo]


NodeInfo = Union[FileNodeInfo, DirectoryNodeInfo]


class InfoFile(TypedDict):
    """._info.json 文件结构"""

    self: DirectoryNodeInfo
    children: Dict[str, NodeInfo]


class ShareNode(TypedDict, total=False):
    """前端 share-file.json 中的节点"""

    id: str
    name: str
    type: Literal["file", "folder"]
    parent: Optional[str]
    children: List[str]
    description: Optional[str]
    hidden: Optional[bool]
    size: Optional[int]
    version: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    md5: Optional[str]
    sha256: Optional[str]
    redirect_url: Optional[str]
    redirect_type: Optional[str]
    redirect_confirm_message: Optional[str]
    url: Optional[str]
    mount_point: Optional[str]
    mount_source: Optional[MountSourceInfo]


class ShareFile(TypedDict, total=False):
    """前端 share-file.json 文件结构"""

    root_id: str
    path_index: Dict[str, str]
    nodes: Dict[str, ShareNode]


# ────────────── 配置类 ──────────────


@dataclass
class GenerateInfoOptions:
    """generate-info 配置选项"""

    root_dir: str = "."
    output_filename: str = "._info.json"
    recursive: bool = True
    calculate_hash: bool = True
    use_git_history: bool = True
    update_size: bool = True
    clean_invalid: bool = True
    clean_ignored: bool = True
    purify_folders: bool = True
    format_output: bool = True
    force_update: bool = False
    dry_run: bool = False
    verbose: bool = False
    ignore_patterns: List[str] = None

    def __post_init__(self):
        if self.ignore_patterns is None:
            self.ignore_patterns = []


@dataclass
class GenerateShareFileOptions:
    """generate-share-file 配置选项"""

    root_dir: str = "."
    output_file: str = None
    cdn_base_url: str = DEFAULT_CDN_BASE_URL
    verbose: bool = False

    def __post_init__(self):
        if self.output_file is None:
            self.output_file = f"{self.root_dir}/share-file.json"


# ────────────── 常量定义 ──────────────

# 默认忽略规则
DEFAULT_IGNORE_PATTERNS = [
    r"^\.claude$",
    r"^\.DS_Store$",
    r"^\.eslintrc\.json$",
    r"^\.git$",
    r"^\.github$",
    r"^\.gitignore$",
    r"^\.prettierrc$",
    r"^\.tmp$",
    r"^.*\.html?$",
    r"^assets$",
    r"^dist$",
    r"^eslint\.config\.(js|cjs|mjs)$",
    r"^LICENSE$",
    r"^node_modules$",
    r"^package-lock\.json$",
    r"^package\.json$",
    r"^pnpm-lock\.yaml$",
    r"^pnpm-workspace\.yaml$",
    r"^prettier\.config\.mjs$",
    r"^tsconfig\.json$",
    r"^vite\.config\.ts$",
    r"~$",
]

# 文件扩展名默认描述映射
DEFAULT_DESCRIPTION_MAP = {
    ".txt": "纯文本文件",
    ".md": "Markdown 文档",
    ".rtf": "富文本格式文档",
    ".pdf": "PDF 文档",
    ".doc": "Microsoft Word 文档",
    ".docx": "Microsoft Word 文档",
    ".xls": "Microsoft Excel 工作表",
    ".xlsx": "Microsoft Excel 工作表",
    ".ppt": "Microsoft PowerPoint 演示文稿",
    ".pptx": "Microsoft PowerPoint 演示文稿",
    ".csv": "逗号分隔值文件",
    ".log": "日志文件",
    ".html": "HTML 网页文件",
    ".htm": "HTML 网页文件",
    ".css": "层叠样式表",
    ".js": "JavaScript 脚本",
    ".mjs": "JavaScript 模块",
    ".ts": "TypeScript 脚本",
    ".json": "JSON 数据文件",
    ".xml": "XML 数据文件",
    ".php": "PHP 脚本",
    ".jpg": "JPEG 图像",
    ".jpeg": "JPEG 图像",
    ".png": "PNG 图像",
    ".gif": "GIF 图像",
    ".bmp": "BMP 位图图像",
    ".svg": "SVG 矢量图形",
    ".ico": "图标文件",
    ".webp": "WebP 图像",
    ".tif": "TIFF 图像",
    ".tiff": "TIFF 图像",
    ".mp3": "MP3 音频",
    ".wav": "WAV 音频",
    ".flac": "FLAC 无损音频",
    ".aac": "AAC 音频",
    ".ogg": "OGG 音频",
    ".wma": "Windows Media 音频",
    ".mid": "MIDI 音乐",
    ".midi": "MIDI 音乐",
    ".mp4": "MP4 视频",
    ".avi": "AVI 视频",
    ".mkv": "MKV 视频",
    ".mov": "QuickTime 视频",
    ".wmv": "Windows Media 视频",
    ".flv": "Flash 视频",
    ".webm": "WebM 视频",
    ".zip": "ZIP 压缩包",
    ".rar": "RAR 压缩包",
    ".7z": "7-Zip 压缩包",
    ".gz": "GZip 压缩文件",
    ".bz2": "BZip2 压缩文件",
    ".xz": "XZ 压缩文件",
    ".tar": "TAR 归档文件",
    ".tar.gz": "源代码压缩包",
    ".tgz": "源代码压缩包",
    ".tar.bz2": "BZip2 压缩归档",
    ".tar.xz": "XZ 压缩归档",
    ".exe": "Windows 可执行程序",
    ".msi": "Windows 安装包",
    ".appx": "Windows 应用商店包",
    ".bat": "批处理脚本",
    ".sh": "Shell 脚本",
    ".ps1": "PowerShell 脚本",
    ".apk": "Android 安装包",
    ".jar": "Java 归档文件",
    ".py": "Python 脚本",
    ".java": "Java 源文件",
    ".c": "C 语言源文件",
    ".cpp": "C++ 源文件",
    ".h": "C/C++ 头文件",
    ".go": "Go 源文件",
    ".rs": "Rust 源文件",
    ".swift": "Swift 源文件",
    ".kt": "Kotlin 源文件",
    ".rb": "Ruby 脚本",
    ".lua": "Lua 脚本",
    ".sql": "SQL 脚本",
    ".yaml": "YAML 配置文件",
    ".yml": "YAML 配置文件",
    ".toml": "TOML 配置文件",
    ".ini": "INI 配置文件",
    ".env": "环境变量文件",
    ".dockerfile": "Docker 构建文件",
    ".ttf": "TrueType 字体",
    ".otf": "OpenType 字体",
    ".woff": "Web 开放字体",
    ".woff2": "Web 开放字体",
    ".iso": "光盘镜像文件",
    ".dmg": "macOS 磁盘映像",
    ".torrent": "BitTorrent 种子文件",
    ".db": "数据库文件",
    ".sqlite": "SQLite 数据库",
    ".epub": "电子书（EPUB 格式）",
    ".mobi": "电子书（Mobi 格式）",
}

# 字段排序顺序
BASE_FIELD_ORDER = [
    "type",
    "description",
    "hidden",
    "redirect",
    "mount_source",
    "hold",
    "created_at",
    "updated_at",
]

FILE_SPECIFIC_FIELD_ORDER = ["version", "size", "md5", "sha256"]
