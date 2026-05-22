# ShareFile · 文件分享 网站 / Static File Share

![GitHub Actions](https://github.com/LetsShareAll/ShareFile/actions/workflows/deploy.yml/badge.svg?branch=file)
![Pages](https://img.shields.io/badge/GitHub%20Pages-deploy-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![pnpm](https://img.shields.io/badge/pnpm-%3E%3D11-blue)
![License](https://img.shields.io/github/license/LetsShareAll/ShareFile)

轻量、开箱即用的静态文件分享前端，适合部署到 GitHub Pages。通过离线脚本生成目录元数据并导出单一索引供前端使用，支持虚拟条目、重定向与锁定机制。

English — Lightweight static file sharing site for GitHub Pages. Scans folders, generates metadata, and builds a single index for the client.

## ✨ 特性 / Features

- 递归扫描并生成目录元数据（`._info.json`）
- 精细的 `hold` 锁定机制（可锁定 `size`、`hash`、时间等字段）
- 支持虚拟节点与外部重定向（config-only entries）
- 汇总生成单一索引 `share_file.json` 供前端使用
- 现代苹果风格 UI（毛玻璃、暗/亮模式、列表/图标视图）
- 内置文件预览（图片、音频、视频、Markdown、代码片段）
- 自动化 CI：Actions 可在 `file` 分支上运行构建与部署流程

## 📁 项目结构 / Layout

主要文件和目录（简要）：

- `index.html`, `404.html` — 前端页面
- `._info*.json` — 每目录元数据样例/产物
- `share_file.json` — 汇总索引，供前端加载（最终在 `assets/data/share_file.json`）
- `assets/scripts/` — 脚本与前端 TypeScript（`generate-info.ts`, `generate-share-file.ts`, `index.ts` 等）
- `assets/styles/` — 全局样式
- `.github/workflows/deploy.yml` — CI / 自动部署配置

## 🛠️ 最低依赖与本地开发 / Requirements & Quickstart

最低依赖：

- Node.js >= 18 (建议 18 LTS 或更高)
- pnpm >= 11

本地快速开始（示例）：

```bash
# 克隆仓库
git clone https://github.com/LetsShareAll/ShareFile.git
cd ShareFile

# 安装依赖
pnpm install

# 生成目录元数据（递归扫描当前工作目录，默认行为会生成 ._info.json）
pnpm run generate-info   # 或: pnpm exec ts-node ./assets/scripts/generate-info.ts

# 汇总索引为 share_file.json（会写入 assets/data/share_file.json）
pnpm run generate-share  # 或: pnpm exec ts-node ./assets/scripts/generate-share-file.ts
```

说明与示例参数：

- 若需忽略特定模式，可以编辑 `assets/scripts/shared.ts` 中的 `DEFAULT_IGNORE_PATTERNS`，或给 `generate-info` 脚本传 `--ignore` 参数。
- 若想只处理某个子目录：`pnpm run generate-info -- --root ./subfolder`

可用脚本（package.json 中的 npm script）说明：

- `pnpm run generate-info` — 递归扫描并为每个目录生成或更新 `._info.json`。
- `pnpm run generate-share` — 读取所有 `._info.json` 并合并为 `assets/data/share_file.json`。
- `pnpm run build` — 先运行 `generate-info` 再运行 `generate-share`（CI 使用）。

示例 CI 流程：在 `file` 分支上推送时，Actions 会运行 `pnpm install`、`pnpm run build`，并将变更推回仓库后触发 Pages 部署。

## ⚙️ 高级配置 / Advanced

忽略规则：编辑 `DEFAULT_IGNORE_PATTERNS`（`assets/scripts/shared.ts`）或传 `--ignore` 给 `generate-info`。

锁定（hold）：在 `._info.json` 节点添加 `hold`，可为 `true`（锁定所有字段）或 `{ size: true, hash: true }` 等对象精确控制。

虚拟节点与重定向：在 `._info.json` 为条目指定 `redirect` 与 `type`（`file|folder`）即可创建 config-only 条目或外部跳转。

自动部署：CI 配置见 `.github/workflows/deploy.yml`（工作流在 `file` 分支触发，执行 `pnpm run build` 并部署到 Pages）。

## 贡献与许可 / Contributing & License

- 欢迎提交 issue 与 pull request。请在 PR 中说明变更范围与测试步骤。
- 若用于公共或商业项目，请先检查并更新许可说明（当前仓库使用的许可请参见仓库根目录）。

## 鸣谢 / Credits

- Font Awesome — 图标
- marked — Markdown 解析
- Apple Design Guidelines — UI 灵感
