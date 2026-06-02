# ShareFile

[![检查代码](https://github.com/LetsShareAll/ShareFile/actions/workflows/check-code.yml/badge.svg?branch=main)](https://github.com/LetsShareAll/ShareFile/actions/workflows/check-code.yml)
[![准备 public 文件](https://github.com/LetsShareAll/ShareFile/actions/workflows/prepare-public-files.yml/badge.svg?branch=main)](https://github.com/LetsShareAll/ShareFile/actions/workflows/prepare-public-files.yml)
[![部署 GitHub Pages](https://github.com/LetsShareAll/ShareFile/actions/workflows/deploy-github-pages.yml/badge.svg?branch=main)](https://github.com/LetsShareAll/ShareFile/actions/workflows/deploy-github-pages.yml)
![Node](https://img.shields.io/badge/node-%3E%3D26.2.0-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-blue)
![License](https://img.shields.io/github/license/LetsShareAll/ShareFile)

ShareFile 是一个面向静态托管的文件分享站点。它用 GitHub Pages 承载前端，用 JSON 索引描述文件树，用自动化脚本维护元数据，并通过 `mount_source` 支持把 `file` 分支或外部仓库挂载到站点中。

线上站点：

```text
https://file.lssa.fun/
```

## 目录

- [核心特性](#核心特性)
- [架构概览](#架构概览)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [常用脚本](#常用脚本)
- [数据与元数据](#数据与元数据)
- [外部挂载](#外部挂载)
- [自动化流程](#自动化流程)
- [维护流程](#维护流程)
- [更多文档](#更多文档)
- [许可证](#许可证)

## 核心特性

- 静态站点部署：`public/` 可直接作为 GitHub Pages artifact 发布。
- 双分支职责：`main` 维护站点、UI 和工具，`file` 维护可分享文件和索引。
- 文件索引生成：扫描目录中的文件和 `._info.json`，生成前端使用的 `share-file.json`。
- CDN 索引生成：同步生成 `share-file.cdn.json`，生产构建默认加载 CDN 版本。
- 元数据维护：支持描述、隐藏状态、版本、大小、哈希、创建时间、更新时间。
- 字段锁定：`hold` 可保护手工维护的字段不被自动扫描覆盖。
- 虚拟节点：支持虚拟文件、虚拟目录、外部链接和确认跳转。
- 外部挂载：通过 `mount_source` 在运行时加载其他仓库或分支的索引。
- 前端预览：支持图片、Markdown、文本、代码、PDF、音频、视频等常见类型。
- 离线工具：Python CLI 是索引生成的权威实现，可打包成无需 Node.js 的可执行文件。

## 架构概览

ShareFile 的核心思路是把“站点壳”和“文件数据”拆开。

```text
main 分支
  ├─ UI 源码
  ├─ Python 生成工具源码
  ├─ GitHub Actions
  └─ public/ 站点壳、工具下载和本地索引

file 分支
  ├─ 实际分享文件
  ├─ 每个目录的 ._info.json
  └─ share-file.json / share-file.cdn.json
```

前端加载本地索引后，会继续读取索引中声明的 `mount_source`，把外部文件树合并到当前站点的目录树中。

```text
浏览器
  -> public/assets/data/share-file.cdn.json
  -> 发现 mount_source
  -> 加载 file 分支或外部仓库的 share-file.json
  -> 合并为最终文件树
```

更完整的架构说明见 [docs/architecture.md](docs/architecture.md)。

## 目录结构

```text
.
├── .github/workflows/
│   ├── check-code.yml
│   ├── prepare-public-files.yml
│   └── deploy-github-pages.yml
├── docs/
│   ├── architecture.md
│   ├── maintenance.md
│   ├── metadata.md
│   └── workflows.md
├── public/
│   ├── index.html
│   ├── 404.html
│   ├── ._info.json
│   ├── assets/
│   │   ├── data/
│   │   ├── scripts/
│   │   └── styles/
│   └── softwares/applications/tools/
├── packages/
│   ├── cli/
│   └── ui/
├── package.json
└── pnpm-workspace.yaml
```

核心包职责：

| 路径           | 职责                                                    |
| -------------- | ------------------------------------------------------- |
| `packages/cli` | Python CLI，维护 `._info.json` 并生成 `share-file.json` |
| `packages/ui`  | 浏览器端文件列表、搜索、预览、主题和外部挂载加载逻辑    |

## 快速开始

要求：

- Node.js `>=26.2.0`
- pnpm `>=11`
- Python `>=3.12`

根级生成脚本会自动查找 `python3`、`python` 或 Windows `py -3`。如果本机需要指定解释器，可设置 `PYTHON` 环境变量。

安装依赖：

```bash
pnpm install
```

启动开发服务器：

```bash
pnpm run dev
```

开发服务器默认地址：

```text
http://127.0.0.1:4173/
```

修改端口：

```powershell
$env:PORT = "5173"
pnpm run dev
```

生成索引：

```bash
pnpm run generate
```

构建站点：

```bash
pnpm run build
```

注意：`build` 现在只构建 UI，不再隐式运行 `generate`、`check`、`format` 或 `lint`。

## 常用脚本

| 命令                           | 说明                                                          |
| ------------------------------ | ------------------------------------------------------------- |
| `pnpm run dev`                 | 生成一次索引，启动本地静态服务器，并监听 UI 源码变更          |
| `pnpm run generate`            | 使用 Python CLI 运行 `generate-info` 和 `generate-share-file` |
| `pnpm run generate-info`       | 使用 Python CLI 扫描 `public/` 并维护目录级 `._info.json`     |
| `pnpm run generate-share-file` | 使用 Python CLI 根据 `._info.json` 生成前端索引               |
| `pnpm run check`               | 执行 UI TypeScript、Python 语法和脚本路径检查                 |
| `pnpm run lint`                | 执行 UI ESLint 和根级脚本 ESLint                              |
| `pnpm run format`              | 格式化 UI、workflow、根配置文件和根级脚本                     |
| `pnpm run format:check`        | 检查 workflow、根配置文件和根级脚本格式                       |
| `pnpm run verify`              | 执行 `check`、`lint`、`format:check` 和契约测试               |
| `pnpm run build`               | 构建站点 UI                                                   |
| `pnpm run build:site`          | 直接调用 UI 包构建脚本                                        |

## 数据与元数据

ShareFile 的数据生成分两步：

```text
generate-info
  -> 扫描目录
  -> 更新每个目录下的 ._info.json

generate-share-file
  -> 读取 ._info.json
  -> 生成 share-file.json
  -> 生成 share-file.cdn.json
```

每个目录可以包含一个 `._info.json`：

```json
{
  "self": {
    "description": "当前目录"
  },
  "children": {
    "example.pdf": {
      "type": "file",
      "description": "示例文档",
      "version": "1.0.0"
    },
    "documents": {
      "type": "folder",
      "description": "文档目录"
    }
  }
}
```

常用字段：

| 字段                        | 说明               |
| --------------------------- | ------------------ |
| `description`               | 前端展示的描述     |
| `hidden`                    | 是否以隐藏状态展示 |
| `type`                      | `file` 或 `folder` |
| `version`                   | 文件版本号         |
| `size`                      | 文件大小，单位字节 |
| `md5` / `sha256`            | 文件哈希           |
| `created_at` / `updated_at` | ISO 8601 时间      |
| `hold`                      | 锁定自动字段       |
| `redirect`                  | 虚拟节点或跳转配置 |
| `mount_source`              | 外部索引挂载源     |

详细规范见 [docs/metadata.md](docs/metadata.md)。

## 外部挂载

目录节点可以声明 `mount_source`：

```json
{
  "self": {
    "mount_source": {
      "provider": "github",
      "repository": "LetsShareAll/ShareFile",
      "branch": "file",
      "sub_path": "/",
      "access_cdn": "jsdelivr",
      "use_cdn_index": true
    }
  },
  "children": {}
}
```

前端会在运行时加载外部仓库的索引，重写节点路径和文件 URL，并将其合并进本地文件树。外部节点会带有 `source: "external"` 标记，UI 会对其做视觉区分。

## 自动化流程

GitHub Actions 已拆成三段：

```text
检查代码
  -> 准备 public 文件
  -> 部署 GitHub Pages
```

| Workflow          | 文件                                         | 职责                                                                                    |
| ----------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| 检查代码          | `.github/workflows/check-code.yml`           | PR、`main` push、手动触发；运行 `pnpm run verify`                                       |
| 准备 public 文件  | `.github/workflows/prepare-public-files.yml` | 在 `检查代码` 的 `main` push 成功后运行；编译 Linux Python CLI、生成索引、提交 `public` |
| 部署 GitHub Pages | `.github/workflows/deploy-github-pages.yml`  | 在 `准备 public 文件` 成功后构建站点并部署 Pages                                        |

详细说明见 [docs/workflows.md](docs/workflows.md)。

## 维护流程

更新分享文件：

```text
1. 切到 file 分支
2. 添加、删除或移动文件
3. 生成或更新 ._info.json 与 share-file.json
4. 提交 file 分支
5. main 站点通过 mount_source 加载新索引
```

更新站点或工具：

```text
1. 在 main 分支修改 UI 或 Python CLI
2. 运行 pnpm run verify
3. 需要时运行 pnpm run generate
4. 合并到 main
5. Actions 自动准备 public 并部署站点
```

更多维护场景见 [docs/maintenance.md](docs/maintenance.md)。

## 更多文档

| 文档                                                                         | 内容                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)                                 | 分支职责、数据流、外部挂载模型                    |
| [docs/metadata.md](docs/metadata.md)                                         | `._info.json`、`hold`、`redirect`、`mount_source` |
| [docs/workflows.md](docs/workflows.md)                                       | GitHub Actions 链路和权限边界                     |
| [docs/maintenance.md](docs/maintenance.md)                                   | 常见维护任务和排错                                |
| [packages/cli/README.md](packages/cli/README.md)                             | Python CLI 使用和打包                             |
| [packages/ui/src/share-file/schema.ts](packages/ui/src/share-file/schema.ts) | UI 内部数据结构类型定义                           |

## 许可证

本项目使用 [MIT License](LICENSE)。
