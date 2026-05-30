# ShareFile

![GitHub Actions](https://github.com/LetsShareAll/ShareFile/actions/workflows/deploy-host.yml/badge.svg?branch=main)
![Pages](https://img.shields.io/badge/GitHub%20Pages-deploy-blue)
![Node](https://img.shields.io/badge/node-%3E%3D26.2.0-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-blue)
![License](https://img.shields.io/github/license/LetsShareAll/ShareFile)

ShareFile 是一个面向静态托管的文件分享站点。它采用**双分支架构**：`main` 分支负责网站部署（UI、构建工具），`file` 分支负责文件存储。前端通过运行时挂载机制从 `file` 分支动态加载文件索引，实现关注点分离和独立的文件更新流程。

## 架构概览

### 双分支设计

- **`main` 分支**：网站部署分支
  - 包含：UI 代码、构建工具、CLI 可执行文件、静态资源
  - 部署到 GitHub Pages
  - 通过 `mount_source` 配置挂载 `file` 分支的文件目录

- **`file` 分支**：文件存储分支
  - 包含：用户文件（documents/、softwares/ 等）、文件索引
  - 扁平化根目录结构，无代码依赖
  - 独立 CI 自动生成 `share-file.json` 索引

### 核心代码层

当前仓库（`main` 分支）采用 pnpm workspace 管理，核心代码分为三层：

- `@share-file/cli`：扫描目录，维护每个目录的 `._info.json`，生成前端使用的 `share-file.json` 与 `share-file.cdn.json`。
- `@share-file/ui`：浏览器端文件列表、搜索、主题、预览和下载逻辑，使用 esbuild 输出到 `public/assets/scripts/index.js`。
- `@share-file/types`：CLI 与 UI 共用的数据结构定义，包括文件节点、目录节点、虚拟节点、重定向和字段锁定。

## 功能概览

- 双分支架构，代码与文件分离，独立更新流程。
- 运行时挂载机制，前端动态加载 `file` 分支的文件索引。
- 递归扫描文件系统，为每个目录生成或同步 `._info.json`。
- 自动写入文件大小、MD5、SHA256，以及可从 Git 历史推断的创建和更新时间。
- 支持 `hold` 锁定机制，避免自动扫描覆盖手工维护的字段。
- 支持虚拟文件、虚拟目录和外部重定向链接。
- 生成扁平化索引 `share-file.json`，并同步生成 CDN 访问版本 `share-file.cdn.json`。
- 前端支持图标视图、详细视图、面包屑导航、全局搜索、亮色/暗色/自动主题。
- 内置文件类型插件，提供图片、PDF、Markdown、纯文本、代码、音频和视频预览。
- GitHub Actions 自动化：`main` 分支构建并部署网站，`file` 分支生成文件索引。

## 技术栈

- Node.js `>=26.2.0`
- pnpm workspace
- TypeScript
- esbuild
- ESLint 10
- Prettier 3
- marked、highlight.js、AmplitudeJS、Video.js、music-metadata

## 目录结构

```text
.
├── public/
│   ├── index.html
│   ├── 404.html
│   ├── ._info.json
│   ├── assets/
│   │   ├── data/
│   │   │   ├── share-file.json
│   │   │   ├── share-file.cdn.json
│   │   │   ├── ._info.example.json
│   │   │   └── generate-info.config.example.json
│   │   ├── scripts/index.js
│   │   └── styles/
│   ├── documents/
│   ├── music/
│   ├── others/
│   ├── pictures/
│   ├── softwares/
│   └── videos/
├── src/packages/
│   ├── cli/
│   ├── types/
│   └── ui/
├── .github/workflows/
│   ├── build-cli-tools.yml
│   └── deploy-host.yml
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

`public/` 是静态站点根目录。真实要分享的文件放在这里，生成后的索引和前端构建产物也会写回这里。

## 数据生成流程

ShareFile 的数据流分两步：

1. `generate-info` 扫描文件系统，生成或更新每个目录下的 `._info.json`。
2. `generate-share-file` 读取这些 `._info.json`，合并成前端加载的扁平化索引。

默认脚本已经把两步串好：

```bash
pnpm run generate
```

最终前端会加载：

- 开发模式：`/assets/data/share-file.json`
- 生产构建默认模式：`/assets/data/share-file.cdn.json`
- 生产构建加 `--no-cdn`：`/assets/data/share-file.json`

## 快速开始

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` 会在启动时先生成一次 `share-file.json`，然后监听 UI 源码并在重建后自动刷新页面。

开发服务器默认监听：

```text
http://127.0.0.1:4173/
```

可以通过环境变量改端口或主机：

```bash
$env:PORT = "5173"
pnpm run dev
```

构建生产产物：

```bash
pnpm run build
```

`build` 会先执行 `prebuild`，流程为：

```text
generate -> check -> format -> lint -> ui build
```

这意味着构建过程会更新 `public/assets/data/*.json`、`public/**/._info.json`，并可能格式化源码。

## 常用脚本

| 命令                           | 说明                                           |
| ------------------------------ | ---------------------------------------------- |
| `pnpm run dev`                 | 启动静态文件服务器，生成一次索引并监听 UI 重建 |
| `pnpm run generate`            | 生成 `._info.json` 与前端索引                  |
| `pnpm run generate-info`       | 只同步目录级元数据                             |
| `pnpm run generate-share-file` | 只生成扁平化前端索引和仓库 CDN 版本            |
| `pnpm run check`               | 对所有 workspace 包执行 TypeScript 检查        |
| `pnpm run lint`                | 对所有 workspace 包执行 ESLint                 |
| `pnpm run format`              | 对所有 workspace 包执行 Prettier 写入          |
| `pnpm run build`               | 完整生成、检查、格式化、lint 并构建 UI         |

## 元数据格式

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

字段说明：

| 字段          | 位置            | 说明                                     |
| ------------- | --------------- | ---------------------------------------- |
| `description` | `self` / 子节点 | 展示在前端的描述文本                     |
| `hidden`      | `self` / 子节点 | 标记隐藏项，前端会以隐藏样式展示         |
| `type`        | 子节点          | `file` 或 `folder`，虚拟节点必须显式声明 |
| `version`     | 文件节点        | 文件版本号                               |
| `size`        | 文件节点        | 文件大小，单位为字节                     |
| `md5`         | 文件节点        | MD5 校验值                               |
| `sha256`      | 文件节点        | SHA256 校验值                            |
| `created_at`  | `self` / 子节点 | ISO 8601 创建时间                        |
| `updated_at`  | `self` / 子节点 | ISO 8601 更新时间                        |
| `redirect`    | 子节点          | 外部链接或本地跳转配置                   |
| `hold`        | 子节点          | 控制自动扫描是否能覆盖字段               |

更完整的示例见 `public/assets/data/._info.example.json`。

## 字段锁定

`hold` 用于保护手动维护的元数据。

锁定全部自动字段：

```json
{
  "release.zip": {
    "description": "手动维护的发布包",
    "size": 1048576,
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "hold": true
  }
}
```

只锁定哈希：

```json
{
  "manual.pdf": {
    "description": "大小和时间允许自动更新，哈希保持手动值",
    "hold": {
      "hash": true
    }
  }
}
```

可锁定字段包括：

- `size`
- `hash`
- `created_at`
- `updated_at`

使用 `--force` 可以忽略 `hold` 并强制更新自动字段。

## 虚拟节点与重定向

物理不存在的条目可以通过 `._info.json` 定义。虚拟文件或虚拟目录必须包含 `type`；如果要跳到外部地址，添加 `redirect`。

```json
{
  "children": {
    "latest-release": {
      "type": "file",
      "description": "跳转到最新发布包",
      "redirect": {
        "url": "https://github.com/LetsShareAll/ShareFile/releases/latest",
        "type": "confirm",
        "confirm_message": "即将打开外部页面，是否继续？"
      }
    },
    "legacy-docs": {
      "type": "folder",
      "redirect": {
        "url": "https://example.com/docs",
        "type": "direct"
      }
    }
  }
}
```

`redirect.type` 支持：

- `direct`：直接打开目标地址。
- `confirm`：先弹出确认，再打开目标地址。

## CLI 用法

默认同步 `public/`：

```bash
pnpm run generate-info
```

给默认脚本追加选项：

```bash
pnpm run generate-info -- --dry-run
pnpm run generate-info -- --no-hash --no-git
```

如果要指定其他目录，直接调用 CLI 源文件，避免和 package script 中内置的 `../../../public --sync` 参数冲突：

```bash
pnpm --filter @share-file/cli exec tsx src/generate-info.ts [目录] [选项]
```

常用选项：

| 选项                 | 说明                             |
| -------------------- | -------------------------------- |
| `--sync`             | 显式启用默认同步模式             |
| `--force`            | 忽略 `hold`，强制更新自动字段    |
| `--dry-run`          | 只预览结果，不写入文件           |
| `--no-hash`          | 不计算 MD5/SHA256                |
| `--no-git`           | 不从 Git 历史获取时间            |
| `--no-size`          | 不更新文件大小                   |
| `--no-clean`         | 不移除失效物理节点               |
| `--no-clean-ignored` | 不移除被忽略规则匹配的节点       |
| `--no-purify`        | 不精简目录节点中的冗余字段       |
| `--no-format`        | 不排序字段顺序                   |
| `--ignore <re>`      | 添加额外忽略正则，可多次传入     |
| `--output <file>`    | 指定输出文件，默认 `._info.json` |
| `--recursive`        | 递归处理子目录，默认启用         |
| `--no-recursive`     | 只处理当前目录                   |
| `--config <file>`    | 从 JSON 配置加载选项             |
| `--verbose`          | 输出调试日志                     |

示例：

```bash
pnpm run generate-info -- --dry-run
pnpm --filter @share-file/cli exec tsx src/generate-info.ts ../../../public/music --no-recursive --no-hash
pnpm --filter @share-file/cli exec tsx src/generate-info.ts ../../../public --ignore "^temp$" --ignore "\\.bak$"
```

独立可执行工具使用分段 JSON 配置，示例见 `public/softwares/applications/tools/config.example.json`。

默认生成前端索引：

```bash
pnpm run generate-share-file
```

自定义目录、输出文件或 CDN 地址：

```bash
pnpm --filter @share-file/cli exec tsx src/generate-share-file.ts [目录] [输出文件] [选项]
```

常用选项：

| 选项              | 说明                                |
| ----------------- | ----------------------------------- |
| `--config <file>` | 从分段 JSON 配置加载选项            |
| `--cdn-url <url>` | 为 CDN 版本索引设置文件访问基础 URL |
| `--verbose`       | 输出调试日志                        |
| `--help`          | 查看帮助                            |

也可以使用环境变量：

```bash
$env:SHARE_FILE_CDN_URL = "https://cdn.example.com/share-file"
pnpm run generate-share-file
```

## 前端行为

前端入口是 `src/packages/ui/src/index.ts`，构建后输出到 `public/assets/scripts/index.js`。页面骨架在 `public/index.html`，样式在 `public/assets/styles/index.css`。

主要行为：

- 从 `/assets/data/${SHARE_FILE_NAME}` 获取索引。
- 使用 `?path=/some/folder` 表示当前目录。
- 文件夹优先排序，然后按名称排序。
- 搜索会在所有节点中按名称与描述进行匹配。
- `README.md` 会在当前目录列表下方自动渲染为说明区。
- 文件卡片提供预览、下载、哈希复制等操作。
- 主题和视图模式保存在 `localStorage`。

内置节点插件位于 `src/packages/ui/src/plugins/node/`。当前包含：

- Markdown、代码、纯文本
- 图片、PDF
- 音频、视频
- Office/OpenDocument/电子书等文档类型
- 压缩包、可执行文件、磁盘镜像、字体
- 文件夹和未知类型兜底插件

## 部署

仓库采用双分支 CI/CD 流程：

### `main` 分支部署（网站）

工作流：

- `.github/workflows/build-cli-tools.yml`：可复用的 CLI 工具构建与验证流程。
- `.github/workflows/deploy-host.yml`：网站索引生成、Pages artifact 上传与部署流程。

触发条件：
- push 到 `main` 分支
- pull request 到 `main` 分支
- 手动 `workflow_dispatch`

工作流步骤：

1. `deploy-host.yml` 的 `build-cli-tools` job 调用 `build-cli-tools.yml`。
2. `build-cli-tools.yml` 使用 TypeScript CLI 构建 Linux 单文件可执行工具（generate-info、generate-share-file）。
3. `build-cli-tools.yml` 执行可执行工具最小端到端验证，并上传 CLI 工具 artifact。
4. `deploy-host.yml` 的 `build` job 下载 CLI 工具 artifact 到 `public/softwares/applications/tools/`。
5. `build` job 执行 `pnpm run build`（生成索引、构建 UI）。
6. 如果有变更，`build` job 由 GitHub Actions bot 提交回仓库。
7. `build` job 上传 `public/` 作为 Pages artifact。
8. `deploy` job 部署到 GitHub Pages。

### `file` 分支索引生成

工作流：`.github/workflows/generate-index.yml`

触发条件：
- push 到 `file` 分支（文件更新）
- 手动 `workflow_dispatch`

工作流步骤：
1. 从 `main` 分支获取 CLI 可执行工具。
2. 运行 `generate-info` 生成目录元数据。
3. 运行 `generate-share-file` 生成文件索引（CDN URL: `https://cdn-file.lssa.fun`）。
4. 如果有变更，提交 `share-file.json` 和 `share-file.cdn.json`。

README 变更被 `paths-ignore` 排除，不会单独触发部署。

## 添加或更新分享文件

推荐流程：

1. 切换到 `file` 分支：
   ```bash
   git checkout file
   ```

2. 把文件放入对应的目录（如 `documents/`、`softwares/` 等）。

3. （可选）编辑对应目录的 `._info.json` 添加描述、版本等元数据。

4. 提交并推送：
   ```bash
   git add .
   git commit -m "feat: 添加新文件"
   git push origin file
   ```

5. CI 会自动生成索引，用户访问网站时会加载新文件（可能有 12 小时缓存延迟）。

## 修改网站 UI 或功能

推荐流程：

1. 在 `main` 分支修改 `src/packages/ui/` 代码。

2. 本地测试：
   ```bash
   pnpm run dev
   ```

3. 构建检查：
   ```bash
   pnpm run build
   ```

4. 提交并推送：
   ```bash
   git add .
   git commit -m "feat: 更新 UI"
   git push origin main
   ```

5. CI 会自动构建并部署到 GitHub Pages。

## 注意事项

- `build` 会运行 `format`，因此它可能改写源码格式。
- 默认 `generate-info` 会递归处理所有子目录。
- 默认会计算哈希；大文件较多时可以在调试阶段使用 `--no-hash`。
- Git 时间戳只对 Git 已追踪文件有效；未追踪文件可能没有 `created_at` / `updated_at`。
- `public/assets/data/share-file.cdn.json` 会根据 CDN 基础 URL 改写文件 URL。
- 生产 UI 默认读取 `share-file.cdn.json`；若不需要 CDN，请执行 UI 构建时传 `--no-cdn`。

## 外部挂载功能

ShareFile 支持从其他 GitHub 仓库动态加载文件索引，实现跨仓库的文件聚合展示。

### 配置外部挂载源

在 `._info.json` 中为目录节点添加 `mount_source` 字段：

```json
{
  "children": {
    "external-scripts": {
      "type": "folder",
      "description": "外部脚本仓库",
      "mount_source": {
        "provider": "github",
        "repository": "user/repo",
        "branch": "main",
        "sub_path": "/scripts",
        "access_cdn": "jsdelivr",
        "use_cdn_index": true
      }
    }
  }
}
```

### 字段说明

| 字段            | 必填 | 说明                                                                |
| --------------- | ---- | ------------------------------------------------------------------- |
| `provider`      | 是   | 存储提供商，当前仅支持 `"github"`                                   |
| `repository`    | 是   | 仓库标识，格式 `"owner/repo"`                                       |
| `branch`        | 否   | 分支名，默认尝试 `main` 后回退到 `master`                           |
| `sub_path`      | 否   | 挂载外部仓库的子目录，默认为根目录 `"/"`                            |
| `access_cdn`    | 否   | 访问索引文件的方式：`"jsdelivr"`（默认）、`"raw"`、或自定义 CDN URL |
| `use_cdn_index` | 否   | 是否优先加载 `share-file.cdn.json`，默认 `false`                    |

### 工作原理

1. 前端加载本地 `share-file.json`
2. 检测到 `mount_source` 配置后，异步加载外部仓库的 `share-file.json`
3. 根据 `sub_path` 过滤外部节点
4. 重写节点 ID 和路径，添加挂载点前缀
5. 合并到本地索引（本地节点优先）
6. 缓存到 localStorage（12 小时 TTL）

### 外部仓库准备

外部仓库需要在根目录（或 `sub_path` 指定的目录）包含 `share-file.json`。

#### 生成方式 1：使用独立 CLI 工具

```bash
# 下载工具
wget https://your-site.com/softwares/applications/tools/generate-info-linux
wget https://your-site.com/softwares/applications/tools/generate-share-file-linux
chmod +x generate-*

# 生成索引
./generate-info-linux ./public
./generate-share-file-linux ./public ./public/share-file.json
```

如果需要生成 CDN 版本，显式传入 CDN 基础 URL：

```bash
./generate-share-file-linux ./public ./public/share-file.json \
  --cdn-url "https://cdn.example.com/files"
```

也可以使用 `config.json`：

```bash
wget https://your-site.com/softwares/applications/tools/config.example.json -O config.json
./generate-info-linux --config ./config.json
./generate-share-file-linux --config ./config.json
```

#### 生成方式 2：使用 TypeScript CLI

```bash
pnpm install
pnpm run generate
```

### 视觉区分

外部节点在前端会有特殊标识：

- 蓝色左边框
- 图标右下角显示链接徽章 🔗
- 面包屑中显示链接图标
- 悬停时背景色变化

### 刷新外部源

点击页面顶部的刷新按钮 🔄 可以清除缓存并重新加载所有外部源。

## 许可证

本项目使用 GPL-3.0 license。详见 `LICENSE`。
