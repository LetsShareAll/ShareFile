如何编写插件

- 每个插件导出默认的 `register` 函数：
  `export default async function register(ctx: PluginContext): Promise<PluginHandle>`

- `PluginContext` 包含 `logger` 和可选 `options`，用于与宿主程序交互。

- `PluginHandle` 至少包含 `name`，并可提供 `hooks` 字段以实现特定的运行时钩子。

- 钩子名称和调用时机由宿主定义（例如 `init`, `beforeScan`, `afterMerge`, `finalize` 等）。

示例见 `simple-log.ts`。
