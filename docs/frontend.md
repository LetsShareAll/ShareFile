# 前端工程说明

本文说明 `packages/ui` 的技术栈、分层约定、构建链路与扩展方式。

## 技术栈

| 关注点   | 选型                                                                  |
| -------- | --------------------------------------------------------------------- |
| 框架     | Vue 3（`<script setup lang="ts">` + Composition API）                 |
| 构建     | Vite 8（rolldown）+ `@vitejs/plugin-vue`                              |
| 路由     | vue-router（history 模式，单条 catch-all 承接路径状态）               |
| 状态     | Pinia（setup stores：`library` / `ui` / `preview` / `notifications`） |
| 类型检查 | `vue-tsc --noEmit`                                                    |
| 单元测试 | Vitest（happy-dom，`tests/*.spec.ts`）                                |
| 端到端   | Playwright（`tests/e2e/*.spec.ts`，生产产物 + `vite preview`）        |
| 消毒     | DOMPurify（动态加载，见「安全约定」）                                 |

## 构建链路与产物边界

- `vite.config.ts` 中 `root = packages/ui`、`build.outDir = public`、**`emptyOutDir: false`**（否则会清空 `public/` 里的数据与 Python 二进制）、`publicDir` 仅在 dev 生效（构建时关闭，避免把 `public/` 复制进它自己）。
- 因为 `emptyOutDir` 关闭，每次构建前由 `packages/ui/scripts/clean-build-output.mjs` 只清理上一轮的 UI 产物（`public/index.html` 与 `public/assets` 顶层的 js/css/map），**不动** `assets/data`、`assets/styles`、`404.html` 与二进制。
- 数据源开关：`vite build --mode local`（等价于旧的 `--no-cdn`）读取 `share-file.json`，默认构建读取 `share-file.cdn.json`；该值以 `__SHARE_FILE_NAME__` 注入。
- **进 git 的**：`public/` 的数据、`files.jsonl`、Python 二进制、`404.html`。**不进 git 的**：`public/index.html` 与 `public/assets/*.js|css|map`（Vite 产物，`.gitignore` 已覆盖）。因此 clone 之后必须 `pnpm dev` 或 `pnpm build` 才有页面。
- dev server 固定 `127.0.0.1:4173`（`strictPort`），启动前建议先 `pnpm generate`（根 `pnpm dev` 已自动串联）。

## 源码分层

```text
src/
├── main.ts            应用入口：pinia → router（含 404 握手）→ 挂载；DEV 下暴露 window.__shareFileDev
├── App.vue            router-view + 通知宿主 + 确认弹窗宿主
├── router/            路径解析与 URL 收敛（pendingRoute / ?path=）
├── stores/            Pinia：library（索引+外挂合并+搜索）、ui（主题/视图/查询）、preview、notifications
├── domain/            纯函数领域层（无 DOM、无 Vue）
│   ├── share-file/    schema / accessors / normalize
│   ├── external/      URL 构造、注入式缓存、子树过滤与合并
│   ├── plugins/       插件契约、声明式工厂、每实例注册表
│   ├── paths.ts       路由归一化与白名单、节点路径与面包屑
│   ├── search.ts      子串匹配 + 文件夹优先 + zh-CN 排序
│   ├── redirects.ts   重定向是否必须二次确认
│   └── format.ts / links.ts
├── platform/          浏览器能力封装（storage / clipboard / download / http / navigation / sanitize）
├── features/
│   ├── browse/        浏览视图（容器 + 图标/详情列表 + 节点操作 + 激活逻辑）
│   ├── preview/       预览弹窗、渲染器（markdown/code/text/image/pdf）、播放器（video/audio）
│   ├── search/        搜索框
│   └── settings/      主题与视图切换
├── components/        跨功能组件（面包屑、通知宿主、确认弹窗宿主）
├── plugins/node/      14 个文件类型插件定义
└── styles/            tokens / base / browse / preview / vendor
```

分层纪律：`domain` 与 `platform` 不依赖 Vue；展示组件通过 props/emit 通信，只有 feature 容器组件读 store；所有浏览器 API 走 `platform`，便于将来 SSR 或测试替换。

## 插件扩展指南

新增一种文件类型（5 步）：

1. 在 `src/plugins/node/` 新建 `xxxPlugin.ts`，用 `createNodePlugin()` 声明扩展名、`defaultInfo`（必须含 `iconClass` 与 `className`）、可选 `compoundExtensions`、`priority` 与 `preview`。
2. `preview` 一律写成懒加载：`preview: async () => (await import('../../features/preview/renderers/XxxPreview.vue')).default`；不需要预览就别给 `preview`（store 会回退 `window.open`）。
3. 在 `src/plugins/node/builtinPlugins.ts` 登记（顺序只影响同优先级插件，folder `-900` 与 unknown `-1000` 是兜底）。
4. 若新增 `className`，在 `src/styles/preview.css`（或 browse 样式）补对应色块，并在 `messages.ts`/展示映射中登记。
5. 补一条 Vitest 用例（匹配与 `getInfo`），需要动到重库时确保动态 `import()`。

预览组件契约：`props = { fileUrl: string; name: string; mime?: string }`；容器 `PreviewModal` 只负责展示（`visible` / `title` / `loading` + 默认插槽 + `close`）。

## 路由与状态

- 路径即状态：单条 `/:pathMatch(.*)*` 路由承载所有目录路径；`404.html` 把未知路径写入 `sessionStorage('share-file:pending-route')` 后跳回首页，`router/index.ts` 在启动时恢复并清理。
- `?path=` 链接一律 `replace` 收敛为 clean URL；路由输入经 `sanitizeRoutePath` 白名单（拒绝 `..`、`//`、协议串与含 `:` 的段）。
- 偏好沿用旧 localStorage 键（`theme` / `view`），外挂缓存键前缀为 `share-file-external:v2:`（legacy 前缀读取后清理）。
- 排序偏好存于 `sort`（`key:direction`），键为 `default / type / name / size / updated / created`；语义见下。
- SSR-safe 纪律：不在模块顶层读 `window`/`localStorage`，浏览器能力集中在 `platform`，store 用工厂函数获取依赖。

## 排序

目录列表与搜索结果共用一套排序（`domain/sort.ts` + `ui` store 的 `sortKey` / `sortDirection`）：

- 六个键：默认顺序（索引里声明的目录顺序）、文件类型、文件名称、文件大小、更新时间、创建时间；升降序可切换。
- 切换键时采用语义默认方向：名称/类型升序，大小/时间降序。
- 恒定规则：**文件夹永远在前**（不随方向翻转）；**缺失值（未知大小、没有时间）永远在最后**；同值按 zh-CN 路径稳定兜底。
- 「文件类型」用的是列表上展示的类型（`nodeDisplay` 解析，与图标一致）。
- 偏好持久化到 `localStorage.sort`，非法值回落到默认顺序。

## 安全约定

- **所有 `v-html` 必须经 `platform/sanitize`**：确认弹窗走 `sanitizeConfirmHtml`（严格白名单），Markdown 走 `loadDomPurify()` + 更宽的标题/表格标签集。DOMPurify 统一在 `platform/sanitize` 里**动态加载**，避免进入首屏。
- **重定向**：外挂节点的 `redirect_url` 与 `redirect_type: 'confirm'` 一律经 `confirmDialog` 二次确认（决策在 `domain/redirects.ts`）；只有自有 CDN 直链（`node.url`）会直接跳转/下载。
- **跨域下载**：外挂直链是跨域的，CDN 不返回 `Content-Disposition` 时 `download` 属性会被忽略，因此 `platform/download` 对跨域链接开新标签，避免把整个 SPA 导航走。

## 测试与门禁

- `pnpm run test:ui`：Vitest，覆盖 domain 层（normalize / paths / search / format / external URL·缓存·合并 / 插件注册表 / 重定向决策）。
- `pnpm run test:e2e`：Playwright 冒烟（首页、进目录、深链、未知路径、`?path=` 收敛、主题、搜索、代码/Markdown/图片预览）。
- `node scripts/check-bundle-size.mjs`（根 `pnpm run size`）：首屏（`index.html` 直接引用的 JS+CSS）gzip 门禁 250 KB。
- 根 `pnpm run verify` 串起：`vue-tsc` → eslint → prettier → Vitest → Python 契约 → build → 体积门禁。

## 已知取舍

- 图标视图的行高对齐由纯 CSS（grid + line-clamp）实现，取代旧的 JS 测量写 CSS 变量方案，允许细小视觉差异。
- 预览重库（video.js / highlight.js / music-metadata / amplitudejs / marked / DOMPurify）全部动态 `import()`，首屏只保留应用自身代码。
- 图标视图的操作区放在卡片内最后一行（4 个按钮一排），**不再用旧实现的右上角悬浮层**：旧 CSS 的悬浮层只承载 1 个按钮，而现在有页面链接 / 直链 / curl / 下载 4 个，悬浮会盖住标题与描述；哈希按钮遵循旧语义只在详情视图展示（图标视图 `display:none`）。
- `packages/ui/phase5-probe/` 是阶段⑤ 迁移时的临时探针（已 gitignore），保留用于复现当时的插件等价性验证。
