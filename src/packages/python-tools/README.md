# ShareFile Python 工具

`src/packages/python-tools` 提供 Python 版 ShareFile 索引生成工具。它复刻 TypeScript CLI 的核心能力，适合没有 Node.js 环境的机器使用，也可以通过 PyInstaller 打包成独立可执行文件。

包含两个入口：

| 工具                     | 职责                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| `generate-info.py`       | 扫描目录，生成或更新每个目录下的 `._info.json`                      |
| `generate-share-file.py` | 读取 `._info.json`，生成 `share-file.json` 和 `share-file.cdn.json` |

## 使用方式

### 使用预编译文件

GitHub Actions 会编译 Linux 版工具，并复制到：

```text
public/softwares/applications/tools/
```

当前自动化产物：

```text
generate-info-linux
generate-share-file-linux
config.example.yaml
```

示例：

```bash
./generate-info-linux ./public
./generate-share-file-linux ./public ./public/assets/data/share-file.json
```

### 从源码运行

要求：

- Python `>=3.12`
- pip

安装依赖：

```bash
cd src/packages/python-tools
pip install -r requirements.txt
```

运行：

```bash
python generate-info.py ../../../public
python generate-share-file.py ../../../public ../../../public/assets/data/share-file.json
```

## `generate-info.py`

基本用法：

```bash
python generate-info.py [目录] [选项]
```

常用示例：

```bash
# 扫描 public，并更新目录元数据
python generate-info.py ../../../public

# 预览变化，不写入文件
python generate-info.py ../../../public --dry-run --verbose

# 跳过哈希和 Git 历史，加快扫描
python generate-info.py ../../../public --no-hash --no-git

# 使用配置文件
python generate-info.py --config config.example.yaml
```

主要选项：

| 选项                 | 说明                          |
| -------------------- | ----------------------------- |
| `--config FILE`      | 从配置文件读取参数            |
| `--no-recursive`     | 只处理指定目录，不递归子目录  |
| `--force`            | 忽略 `hold`，强制更新自动字段 |
| `--dry-run`          | 预览结果，不写文件            |
| `--no-hash`          | 不计算 MD5 / SHA256           |
| `--no-git`           | 不读取 Git 历史时间           |
| `--no-size`          | 不更新文件大小                |
| `--no-clean`         | 不清理已不存在的物理节点      |
| `--no-clean-ignored` | 不清理被忽略规则匹配的节点    |
| `--no-purify`        | 不精简目录节点上的文件字段    |
| `--no-format`        | 不格式化输出 JSON             |
| `--ignore PATTERN`   | 添加忽略正则，可重复使用      |
| `--verbose`          | 输出详细日志                  |

## `generate-share-file.py`

基本用法：

```bash
python generate-share-file.py [目录] [输出文件] [选项]
```

常用示例：

```bash
# 生成基础索引，并同步生成 share-file.cdn.json
python generate-share-file.py ../../../public ../../../public/assets/data/share-file.json

# 指定 CDN 基础 URL
python generate-share-file.py ../../../public ../../../public/assets/data/share-file.json \
  --cdn-url "https://cdn.example.com/files"

# 使用配置文件
python generate-share-file.py --config config.example.yaml
```

主要选项：

| 选项            | 说明                      |
| --------------- | ------------------------- |
| `--config FILE` | 从配置文件读取参数        |
| `--cdn-url URL` | 设置 CDN 文件访问基础 URL |
| `--verbose`     | 输出详细日志              |

## 配置文件

复制示例配置：

```bash
cp config.example.yaml config.yaml
```

配置结构：

```yaml
generate_info:
  root_dir: '.'
  output_filename: '._info.json'
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

generate_share_file:
  root_dir: '.'
  output_file: './share-file.json'
  cdn_base_url: 'https://cdn.example.com/files'
  verbose: false
```

命令行参数会覆盖配置文件中的同名设置。

## 元数据能力

Python 工具支持：

- 自动补全 `size`
- 自动计算 `md5` / `sha256`
- 从 Git 历史推断 `created_at` / `updated_at`
- 清理不存在的物理节点
- 保留虚拟节点
- 识别 `hold` 字段锁定
- 保留 `redirect`
- 保留目录级 `mount_source`

根项目的数据结构说明见：

```text
docs/metadata.md
```

## 打包

安装依赖后运行：

```bash
pyinstaller build.spec
```

输出目录：

```text
dist/
```

预期产物：

```text
dist/generate-info
dist/generate-share-file
```

GitHub Actions 中的 `准备 public 文件` workflow 会执行相同打包流程，并复制产物：

```text
dist/generate-info
  -> public/softwares/applications/tools/generate-info-linux

dist/generate-share-file
  -> public/softwares/applications/tools/generate-share-file-linux
```

## 与 TypeScript CLI 的关系

TypeScript CLI 是仓库内开发和自动化的主实现：

```text
src/packages/cli
```

Python 工具是便携版本，适合：

- 没有 Node.js 的环境
- 只需要生成索引的文件维护机器
- 分发给非开发者使用

修改元数据协议时，需要同步检查：

```text
src/packages/types/src/schema.ts
src/packages/cli/src/generate-info.ts
src/packages/cli/src/generate-share-file.ts
src/packages/python-tools/*.py
```

## 常见问题

### 生成速度太慢

跳过哈希和 Git 历史：

```bash
python generate-info.py ../../../public --no-hash --no-git
```

### 手工字段被覆盖

在节点上使用 `hold`：

```json
{
  "children": {
    "release.zip": {
      "type": "file",
      "hold": {
        "hash": true,
        "created_at": true
      }
    }
  }
}
```

### 只想处理一个目录

```bash
python generate-info.py ./some-folder --no-recursive
```

### 需要 CDN URL

```bash
python generate-share-file.py ./public ./public/assets/data/share-file.json \
  --cdn-url "https://cdn.example.com/files"
```

该命令会同步生成：

```text
share-file.cdn.json
```
