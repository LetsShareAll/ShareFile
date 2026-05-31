# ShareFile Python 工具使用文档

本文档介绍如何使用 ShareFile Python 工具来生成文件索引。

## 目录

- [简介](#简介)
- [安装](#安装)
- [快速开始](#快速开始)
- [generate-info.py](#generate-infopy)
- [generate-share-file.py](#generate-share-filepy)
- [配置文件](#配置文件)
- [常见问题](#常见问题)

## 简介

ShareFile Python 工具提供两个命令行程序：

- **generate-info.py**：递归扫描目录，为每个目录生成 `._info.json` 元数据文件
- **generate-share-file.py**：根据 `._info.json` 文件构建扁平化的 `share-file.json` 索引

这些工具完全复刻了 TypeScript 版本的功能，适合没有 Node.js 环境的用户使用。

## 安装

### 方式 1：使用预编译的可执行文件（推荐）

从项目网站下载对应平台的可执行文件：

- **Linux**: `generate-info-linux`, `generate-share-file-linux`
- **Windows**: `generate-info.exe`, `generate-share-file.exe`
- **macOS**: `generate-info-macos`, `generate-share-file-macos`

下载后直接运行，无需安装 Python。

### 方式 2：从源码运行

**要求：**
- Python 3.12 或更高版本
- pip

**安装步骤：**

```bash
# 克隆仓库
git clone https://github.com/your-repo/ShareFile.git
cd ShareFile/src/packages/python-tools

# 安装依赖
pip install -r requirements.txt

# 运行脚本
python generate-info.py --help
python generate-share-file.py --help
```

## 快速开始

### 1. 生成元数据文件

在你的文件目录中运行：

```bash
# 使用可执行文件
./generate-info-linux /path/to/your/files

# 或使用 Python 脚本
python generate-info.py /path/to/your/files
```

这会递归扫描目录，为每个目录生成 `._info.json` 文件，包含：
- 文件大小
- MD5 和 SHA256 哈希值
- Git 历史时间戳（如果在 Git 仓库中）
- 文件类型描述

### 2. 生成索引文件

```bash
# 使用可执行文件
./generate-share-file-linux /path/to/your/files ./share-file.json

# 或使用 Python 脚本
python generate-share-file.py /path/to/your/files ./share-file.json
```

这会生成 `share-file.json`，包含所有文件的扁平化索引。

### 3. 生成 CDN 版本（可选）

如果你使用 CDN 托管文件：

```bash
./generate-share-file-linux /path/to/your/files ./share-file.json \
  --cdn-url "https://cdn.example.com/files"
```

这会额外生成 `share-file.cdn.json`，其中文件 URL 指向 CDN。

## generate-info.py

### 基本用法

```bash
generate-info.py [目录] [选项]
```

### 选项

**目录扫描：**
- `--recursive` / `--no-recursive`：是否递归处理子目录（默认：递归）
- `--ignore PATTERN`：添加忽略规则（正则表达式），可多次使用

**元数据生成：**
- `--no-hash`：不计算文件哈希值
- `--no-git`：不从 Git 历史提取时间戳
- `--no-size`：不更新文件大小

**清理选项：**
- `--no-clean`：不清理失效的节点
- `--no-clean-ignored`：不清理被忽略的节点
- `--no-purify`：不精简目录节点的冗余字段
- `--no-format`：不格式化 JSON 输出

**高级选项：**
- `--force`：忽略 hold 锁定，强制更新所有字段
- `--dry-run`：预览模式，不写入文件
- `--config FILE`：使用配置文件
- `--output FILE`：指定输出文件名（默认：`._info.json`）
- `--verbose`：输出详细日志

### 示例

**基础扫描：**
```bash
generate-info.py ./public
```

**跳过哈希计算（加快速度）：**
```bash
generate-info.py ./public --no-hash
```

**预览模式（不写入文件）：**
```bash
generate-info.py ./public --dry-run --verbose
```

**使用配置文件：**
```bash
generate-info.py --config config.yaml
```

**添加自定义忽略规则：**
```bash
generate-info.py ./public --ignore "^\.tmp$" --ignore "^test_.*\.py$"
```

## generate-share-file.py

### 基本用法

```bash
generate-share-file.py [目录] [输出文件] [选项]
```

### 选项

- `--config FILE`：使用配置文件
- `--cdn-url URL`：CDN 基础 URL（生成 CDN 版本）
- `--verbose`：输出详细日志

### 示例

**生成基础索引：**
```bash
generate-share-file.py ./public ./public/assets/data/share-file.json
```

**生成 CDN 版本：**
```bash
generate-share-file.py ./public ./public/assets/data/share-file.json \
  --cdn-url "https://cdn.jsdelivr.net/gh/user/repo@main/public"
```

**使用配置文件：**
```bash
generate-share-file.py --config config.yaml
```

## 配置文件

你可以使用 `config.yaml` 来避免每次都输入命令行参数。

### 创建配置文件

复制示例配置文件：

```bash
cp config.example.yaml config.yaml
```

### 配置文件结构

```yaml
# generate-info 配置
generate_info:
  root_dir: "."
  output_filename: "._info.json"
  recursive: true
  calculate_hash: true
  use_git_history: true
  update_size: true
  clean_invalid: true
  clean_ignored: true
  purify_folders: true
  format_output: true
  force_update: false
  dry_run: false
  verbose: false
  ignore_patterns:
    - "^\\.tmp$"
    - "^\\.cache$"

# generate-share-file 配置
generate_share_file:
  root_dir: "."
  output_file: "./share-file.json"
  cdn_base_url: "https://cdn.example.com/files"
  verbose: false
```

### 使用配置文件

```bash
# 使用配置文件
generate-info.py --config config.yaml

# 命令行参数会覆盖配置文件
generate-info.py --config config.yaml --verbose
```

## 常见问题

### Q: 如何加快扫描速度？

A: 跳过哈希计算和 Git 历史提取：

```bash
generate-info.py ./public --no-hash --no-git
```

### Q: 如何只扫描特定目录？

A: 直接指定目录路径，并使用 `--no-recursive` 选项：

```bash
generate-info.py ./public/documents --no-recursive
```

### Q: 如何保护某些字段不被自动更新？

A: 在 `._info.json` 中使用 `hold` 字段：

```json
{
  "self": {},
  "children": {
    "important.txt": {
      "type": "file",
      "description": "重要文件",
      "hold": {
        "hash": true,
        "size": true
      }
    }
  }
}
```

### Q: 如何添加虚拟节点（重定向）？

A: 在 `._info.json` 中添加带 `redirect` 字段的节点：

```json
{
  "self": {},
  "children": {
    "external-link": {
      "type": "file",
      "description": "外部链接",
      "redirect": {
        "url": "https://example.com/file.pdf",
        "type": "direct"
      }
    }
  }
}
```

### Q: 生成的文件太大怎么办？

A: 使用 `--no-hash` 跳过哈希计算，可以显著减小文件大小。

### Q: 如何在 Windows 上运行？

A: 下载 `.exe` 文件，或使用 PowerShell：

```powershell
python generate-info.py .\public
```

### Q: 支持哪些文件类型？

A: 支持所有文件类型。常见文件类型会自动添加描述（如 `.txt` → "纯文本文件"）。

## 更多信息

- [项目主页](https://github.com/your-repo/ShareFile)
- [问题反馈](https://github.com/your-repo/ShareFile/issues)
- [TypeScript CLI 文档](../cli/README.md)
