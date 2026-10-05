# Vue 3 重构决策记录

本文件记录 ShareFile 前端从 vanilla TypeScript + esbuild 迁移到 Vue 3 + Vite 的**已确认决策**、关键假设、验收标准与执行阶段，供后续回顾与回溯争议时对照。

## 背景与目标

- 现状：`packages/ui/src/index.ts` 单文件 1121 行，靠 52 处 `document.*` 查询与 17 处 `innerHTML` 手工拼 DOM；全局可变状态（`globalShareData`、`searchQuery`、`previewRequestId`）散落在模块顶层。
- 目标：① 单文件 + 全局变量的形态消失，功能拆成组件与组合式函数；② 现有功能与 URL 行为零回归；③ `pnpm verify` 全绿并新增 UI 测试。
- 交付形态：GitHub Pages 静态部署不变；纯客户端渲染；**不做运行时 SSR**（构建期注入 meta/OG，代码保持 SSR-safe 写法以便将来需要时不必重写）。

## 决策清单

| 决策域      | 结论                                                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 动机 · 范围 | 可维护性 + 新能力；只重写 `packages/ui` 与外壳 HTML；CLI 仅新增清单产物，`404.html` 与 `scripts/*.mjs` 不动                                                    |
| 部署 · 产物 | Pages 静态部署不变；UI 产物（`index.html`、样式、`assets/*.js`）全部不进 git；`public/` 只留数据、二进制、清单、`404.html`                                     |
| 兼容红线    | 深链 clean URL、JSON 契约、ES2022+ 浏览器不破；离线 = 本地起服务 + `--no-cdn`；`file://` 不作承诺（绝对路径 + module script 下它本来就打不开）                 |
| 外挂直跳    | `node.url`（自有 `cdn-file.lssa.fun` 构造 + 前缀校验）恢复直跳/直下；第三方索引自带的 `redirect_url` 一律走确认弹窗                                            |
| 命令行获取  | 文件双按钮（页面链接 / 直链 + `curl -L -O`）；构建期 `files.jsonl`（本地 + 外挂索引快照，抓取失败只告警并保留上游快照行）；文档说明深链返回 HTML、直链返回字节 |
| SSR 定位    | 不做运行时 SSR；构建期注入 meta/OG；代码保持 SSR-safe（工厂化 store、平台层封装浏览器 API）                                                                    |
| 迭代方式    | `feat/vue3` 分支大爆炸重写，阶段提交、单 PR 切换，合并前打 tag `pre-vue3` 作为回滚点                                                                           |
| 路由 · 状态 | vue-router 4 history + `404.html` sessionStorage 握手 + `?path=` 收敛为 clean URL；Pinia setup stores（library / ui / preview / notifications）                |
| CSS 策略    | 旧 35KB CSS 以机械搬迁为主（选择器与类名不变）+ 组件 `scoped`；零预处理器；只做两处局部重构（通知与弹窗补正式样式、图标视图行高换纯 CSS）                      |
| 工具链      | Vite：`root=packages/ui`、`build.outDir=public`、`emptyOutDir=false`、`publicDir` 仅 dev 生效；`--mode local` 替代 `--no-cdn`；dev 端口 4173 保留              |
| 插件体系    | 14 个插件不合并；`match`/`getInfo` 保持同步纯函数，`preview` 改为返回 `Promise<Component \| false>`；重库按需加载                                              |
| 安全        | 所有 `v-html` 经 `platform/sanitize.ts`（DOMPurify 白名单）；`redirect_url` 强制确认；路由输入白名单（拒绝 `..`、`//`、含 `:` 的段）                           |
| 通知 · 弹窗 | 通知 store + 宿主组件（保留 `#notification-container`）；`await confirmDialog()` 命令式 API；`ErrorState` / `EmptyState` 组件                                  |
| 历史包袱    | 5 处死代码删除；`?path=` 保留只读兼容；外挂 legacy 缓存前缀再保留一个大版本                                                                                    |
| 文案        | `messages.ts` 单一来源，不引 vue-i18n                                                                                                                          |
| 质量门禁    | `verify` = vue-tsc → eslint → prettier → Vitest → Python 契约 → build → 体积检查；Playwright 5 条冒烟进 CI；首屏主包 gzip ≤ 250 KB                             |
| 代码规范    | 强制 `script setup` + TS 类型式 props + 仅 Composition API + 禁 `any`；eslint-plugin-vue `flat/recommended`                                                    |
| 文档        | 更新 README 与 `docs/architecture.md`；新增本文件与 `docs/frontend.md`                                                                                         |

## 关键假设

1. **`file://` 不是回归目标**：绝对路径 + module script 下它今天就打不开；离线能力以本地静态服务为准。
2. **外部源只在浏览器侧合并**：任意 GitHub 仓库、main→master 回退、每用户 12h 缓存，服务端不代拉——这也是不做运行时 SSR 的根因。
3. **`public/` 的提交职责收缩**：数据 JSON、`files.jsonl` 与 Python 二进制仍由 CI bot 提交；UI 产物不再触发 `public` 变更。
4. **Pages 无自定义缓存头**：缓存策略靠 hash 文件名；若实测不佳退回 `?v=` 查询串，不改部署链路。
5. **旧偏好键继续沿用**：localStorage 的 `view` / `theme` 与外挂 v2 / legacy 缓存前缀保持不变，老用户无感。
6. **部署链形状**：check 增加 build 与体积检查；prepare 负责数据 / 二进制 / 清单的 bot 提交；deploy 负责 build UI 并上传 `public`。
7. **无主题闪烁**：`packages/ui/index.html` 模板内保留极小内联脚本（localStorage + `prefers-color-scheme` → `data-theme`），避免暗色用户首屏闪白。
8. **清单只服务命令行**：`files.jsonl` 不被 UI 读取（UI 用索引数据），因此运行时外挂刷新不影响清单内容。
9. **不设覆盖率阈值**：Vitest 覆盖 domain 层指定模块即可，门禁只看用例通过。
10. **E2E 跑生产产物**：Playwright 用 `pnpm build` + `vite preview` 起服务，而非 dev server。
11. **其余保持原样**：Node 26.2 / pnpm 11、workspace 结构、amplitudejs 类型垫片、`404.html`、Python 契约测试全不动。

## 行为变化（已确认接受）

1. 图标视图行高由 JS 测量（6 个 CSS 变量）改为纯 CSS，允许细小视觉差异。
2. clone 之后仓库里没有 `public/index.html`，必须先 `pnpm dev` 或 `pnpm build` 才有页面。
3. 文件操作区从单按钮变为双按钮（页面链接 / 直链），并把 curl 命令暴露出来。
4. 第三方 `redirect_url` 不再自动跳转，需要一次确认（自有直链不受影响）。

## 执行阶段

1. **工具链脚手架**：Vite + Vue + TS + eslint-plugin-vue + Vitest / Playwright 接线；旧 esbuild 脚本与 `check-ui-script-paths` 下线。
2. **domain 层 + 单测**：schema / normalize / 路径索引 / 搜索排序 / 外挂 URL·缓存·合并 / 插件注册表，全部纯函数可测。
3. **路由 · 状态 · 平台层**：平台层封装、vue-router、Pinia store。
4. **浏览视图**：列表（图标 / 详情）、搜索、面包屑、空态错误态、主题与视图偏好、`node.url` 直跳与下载。
5. **预览插件**：14 个插件改异步组件；重库按需加载；DOMPurify 接入；播放器桥接组件。
6. **通知 · 弹窗**：通知 store、`confirmDialog()`、`ErrorState` / `EmptyState`，清空全部 `cssText` 内联样式。
7. **CSS 搬迁 + 行高重构**：tokens / vendor / 组件 scoped 三分；图标视图行高换纯 CSS。
8. **命令行获取**：Python 生成 `files.jsonl`、双复制按钮与 curl 命令、文档「命令行获取」一节。
9. **CI · 文档 · 切换**：verify 与体积门禁、Playwright 进 CI、文档更新、新旧对照清单验收、删除旧代码并切换。

## 验收标准

- **功能对照**：root 列表 / 进子目录 / 面包屑跳转 / 深链直开 / 未知路径 / `?path=` 规范化 / `404.html` 握手 / 搜索（含 Esc）/ 视图切换 / 主题三态 / 复制链接与下载与哈希复制 / README 预览 / 每类插件预览各一例 / 外挂挂载与刷新 / 通知四态。
- **质量门**：`pnpm verify` 全绿（vue-tsc / eslint / prettier / Vitest / Python 契约 / build / gzip ≤ 250 KB）。
- **冒烟**：Playwright 5 条（首页、进目录、开预览、切主题、深链）通过。
- **产物纪律**：`public/` 的数据与二进制不被构建清空；UI 产物零入库。
- **对照验证**：用 dsh browser 逐项对照旧快照（`.tmp/old-ui`，端口 4174）并递归修正差异。

## 实现期验证项与兜底

- **Vite dev 对 `public` 静态文件的 Range 支持**：若缺失（视频/音频拖动条失效），在 `vite.config` 加仅 dev 生效的 Range 中间件，不动数据与产物。
- **GitHub Pages 对 hash 文件的缓存行为**：若实测不理想，退回「固定文件名 + `?v=<hash>`」，部署链路不变。
- **外挂索引抓取失败**：`files.jsonl` 保留该挂载点上一次的行并告警，避免 CI 抖动导致内容回退。

## 不做清单

不做运行时 SSR、不引 vue-i18n、不引组件库（Element / Naive / Ant）、不自研路由、不做像素级视觉回归、不搬已确认的 5 处死代码（`getBadgeLabel`、`createMountPointErrorCard`、`refreshMountPoint`、`normalizeInfoFile`、`dismissAllNotifications`）。

## 相关文档

- [docs/frontend.md](frontend.md) —— 组件结构、插件扩展指南、构建链路
- [docs/architecture.md](architecture.md) —— 整体架构
- [docs/workflows.md](workflows.md) —— CI 流水线
- [docs/metadata.md](metadata.md) —— `._info.json` 与外部挂载配置

## 验收记录（2026-10-05，feat/vue3）

命令：`pnpm verify`（check → lint → format:check → test:ui → test:contract → build → size）+ `pnpm --filter @share-file/ui run test:e2e`。

| 验收项                                        | 结果                         | 证据                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 源码零回归：root 列表 / 进子目录 / 面包屑跳转 | 通过                         | e2e `smoke-home`、`smoke-navigate`                                                                                                                                                                                                                                                                            |
| 深链直开 / 未知路径 / `?path=` 收敛           | 通过                         | e2e `smoke-deeplink`（3 例）                                                                                                                                                                                                                                                                                  |
| `404.html` 握手（pendingRoute 还原并清理）    | 通过                         | e2e `smoke-static-and-handshake`                                                                                                                                                                                                                                                                              |
| 主题三态（auto / light / dark）               | 通过                         | e2e `smoke-theme`（含刷新后保持）                                                                                                                                                                                                                                                                             |
| 搜索（含 Esc 清空、结果计数）                 | 通过                         | e2e `smoke-search`                                                                                                                                                                                                                                                                                            |
| 视图切换（图标 / 详情，持久化）               | 通过                         | e2e `smoke-view-switch`                                                                                                                                                                                                                                                                                       |
| 复制页面链接 / 直链 / curl 命令               | 通过                         | e2e `smoke-actions`（读剪贴板断言 `curl -L -O '<直链>'`）                                                                                                                                                                                                                                                     |
| 下载（跨域开新标签，不劫持 SPA）              | 通过                         | e2e `smoke-static-and-handshake` + 直链下载态渲染断言                                                                                                                                                                                                                                                         |
| 每类插件预览                                  | 通过（pdf/audio 无线上夹具） | e2e `smoke-preview`（code / markdown / image / text）；真实浏览器验证 video.js 播放器挂载（`.video-js` + 20 控件）；7 个带预览插件的契约单测 + 独立懒加载 chunk（video.es 204.78 kB、amplitude 15.18 kB、marked 11.70 kB、highlightLanguages 31.73 kB、music-metadata 各解析器、purify.es 11.08 kB，均 gzip） |
| 目录 README 预览                              | 已实现（数据休眠）           | `domain/readme` + `DirectoryReadme`，8 条单测覆盖查找与直链回退；当前线上索引无 `README.md` 节点                                                                                                                                                                                                              |
| 外挂挂载与刷新                                | 通过                         | e2e `smoke-external`（标记 + 刷新前后一致 + 本地 3 与外挂 3 合并渲染）                                                                                                                                                                                                                                        |
| 通知四态                                      | 通过                         | 单测 `notifications.spec.ts`（默认时长、同 id 覆盖、dismiss/dismissAll）+ 浏览器实测四态渲染与消毒                                                                                                                                                                                                            |
| 质量门                                        | 通过                         | 203 单测 / 15 Python 契约 / vue-tsc / eslint / prettier 全绿                                                                                                                                                                                                                                                  |
| 首屏体积                                      | 通过                         | gzip 47.85 kB（入口 41.78 + 样式 6.07），阈值 250 kB；入口 chunk 内无 videojs/hljs/amplitude/marked/DOMPurify                                                                                                                                                                                                 |
| 冒烟                                          | 通过                         | Playwright 16 例（要求 ≥5）                                                                                                                                                                                                                                                                                   |
| `public/` 数据与二进制不被清空                | 通过                         | 构建前后文件清单比对零丢失；`emptyOutDir=false` + 构建前只清理 UI 产物（stale chunk 66 → 39）                                                                                                                                                                                                                 |
| UI 产物不入 git                               | 通过                         | `public/index.html`、`public/assets/*.{js,css,map}` 均已忽略；`git show --stat` 无构建产物                                                                                                                                                                                                                    |
| 新旧对照                                      | 通过                         | 量化对照 47 项一致 / 9 项差异（7 项为纯 CSS 行高的预期布局后果、2 项为 headless 环境 Font Awesome 未加载导致图标字体度量差异）；逐项视觉对照见阶段⑦ 迁移报告                                                                                                                                                  |

已知限制：

- 线上数据当前没有 `README.md`、`.pdf`、音频文件节点，因此这三类预览只有契约与构建层证据，缺少端到端夹具；一旦数据出现即可用既有渲染器覆盖。
- 阶段⑦ 允许的视觉差异：图标视图行高由纯 CSS 网格决定（卡片高度 167 → 194 px），且旧实现的搜索态高度差本身是 `alignIconViewRows` 定时测量残影。

在 `docs/migration-vue3.md` 之外，`docs/frontend.md` 记录了分层与扩展方式，`docs/workflows.md` 记录了新的 CI 链路（含 Playwright 步骤与缓存）。
