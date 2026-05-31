# 维护手册

本文档记录 ShareFile 的常见维护任务。

## 更新分享文件

分享文件应在 `file` 分支维护。

推荐流程：

```bash
git switch file
```

然后添加、删除或移动文件。完成后生成索引：

如果当前工作树包含 Node.js 工具链，可以运行：

```bash
pnpm run generate
```

如果 `file` 分支是纯文件分支，或维护机器没有 Node.js，使用预编译 Python 工具：

```bash
./generate-info-linux ./public
./generate-share-file-linux ./public ./public/assets/data/share-file.json
```

提交文件和索引：

```bash
git add public
git commit -m "content: update shared files"
git push
```

## 更新站点 UI

UI 源码位于：

```text
src/packages/ui
```

本地开发：

```bash
pnpm install
pnpm run dev
```

构建：

```bash
pnpm run build
```

校验：

```bash
pnpm run verify
```

## 更新生成逻辑

TypeScript 生成工具位于：

```text
src/packages/cli
```

常见修改点：

| 文件                       | 职责                                            |
| -------------------------- | ----------------------------------------------- |
| `generate-info.ts`         | 扫描目录、维护 `._info.json`                    |
| `generate-share-file.ts`   | 生成 `share-file.json` 和 `share-file.cdn.json` |
| `utils/plugin-registry.ts` | 文件类型描述和插件注册                          |

修改数据结构时，先更新：

```text
src/packages/types/src/schema.ts
```

再同步更新 CLI、UI 和 Python 工具。

## 更新 Python 工具

Python 工具位于：

```text
src/packages/python-tools
```

本地运行：

```bash
cd src/packages/python-tools
pip install -r requirements.txt
python generate-info.py ../../../public
python generate-share-file.py ../../../public ../../../public/assets/data/share-file.json
```

打包：

```bash
pyinstaller build.spec
```

GitHub Actions 会在 `准备 public 文件` workflow 中编译 Linux 可执行文件，并复制到：

```text
public/softwares/applications/tools/
```

## 重新生成 public

在 `main` 分支重新生成索引：

```bash
pnpm run generate
```

重新构建站点：

```bash
pnpm run build
```

手动触发完整自动化：

```text
Actions -> 准备 public 文件 -> Run workflow
```

准备成功后会自动触发 Pages 部署。

## 修改元数据

编辑对应目录下的：

```text
._info.json
```

常见场景：

| 场景         | 做法                                |
| ------------ | ----------------------------------- |
| 修改展示说明 | 改 `description`                    |
| 隐藏节点     | 设置 `hidden: true`                 |
| 保护手写哈希 | 设置 `hold.hash: true`              |
| 添加外部链接 | 添加带 `redirect` 的虚拟节点        |
| 挂载外部仓库 | 在目录 `self` 上添加 `mount_source` |

详细字段见 [metadata.md](metadata.md)。

## 常见问题

### `pnpm run dev` 启动后看不到新文件

先确认索引已生成：

```bash
pnpm run generate
```

然后刷新页面。开发服务器启动时会自动生成一次索引，但不会监听所有文件内容变更。

### 生产站点没有显示最新文件

检查顺序：

1. `file` 分支是否已经提交并推送。
2. `share-file.json` / `share-file.cdn.json` 是否更新。
3. `main` 中挂载点的 `mount_source` 是否指向正确分支。
4. 浏览器是否缓存了外部源，可点击刷新外部源按钮。

### Python 工具打包后没有进入站点

确认 `prepare-public-files.yml` 是否成功，并检查：

```text
public/softwares/applications/tools/
```

该 workflow 只提交 `public`，不会提交 `src/packages/python-tools/build` 或 `dist`。

### 自动提交没有触发部署

这是设计行为。`准备 public 文件` 的提交信息包含 `[skip ci]`，不会依赖 push 触发部署。部署由 `准备 public 文件` 完成后的 `workflow_run` 触发。

### 修改 README 后没有触发 CI

workflow 当前忽略根 `README.md` 变更。这是为了避免纯文档变更触发完整链路。
