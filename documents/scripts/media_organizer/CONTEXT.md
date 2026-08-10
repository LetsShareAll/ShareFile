# Media Organizer Context

Jellyfin 媒体库硬链接整理脚本（`media_organizer.sh`）。本上下文记录该工具的领域术语——重点是其入口层（CLI 参数 + 配置加载）的语言约定。

## Language

**入口层 (entry layer)**:
脚本的前门：命令行参数解析、位置参数校验、env/mo_env 配置加载的统称。讨论入口行为时用它，而不是具体指某个函数。
_Avoid_: 参数解析（只指其中一部分）

**模式 (mode)**:
互斥的入口动作，一次调用恰好选择其一：`list`（列出缓存）、`organize`（正常整理）。模式决定入口分发的分支；当 `update-cache` 修饰标志存在且只给了源目录时，退化为只刷缓存的形状（不整理，提前退出）。
_Avoid_: 选项、动作

**修饰标志 (modifier)**:
与模式正交的布尔开关，可自由附加到模式上：`dry-run`、`automated`、`refresh-cache`、`update-cache`。语义上属于"本次调用如何执行"，而非"执行什么"。`update-cache` = 强制重取对应缓存条目（不信任陈旧缓存），是唯一会改变流程形状的修饰标志。
_Avoid_: 选项、参数

**干运行 (dry-run)**:
修饰标志；本次调用不产生任何持久化副作用：不建链接、不写缓存、不写日志；网络请求（TMDB/AI）照常执行但不落盘。与 `cache-only` 形状冲突（报错），与 `update+organize` 兼容。
_Avoid_: 试运行、预览模式（语义含混）

**配置优先级链 (priority chain)**:
配置值的解析顺序：**CLI > 环境变量 > mo_env 文件 > 内置默认值**。同一键只取最高优先级来源；CLI 显式设置（含 `--no-*` 反选）覆盖一切。
_Avoid_: 覆盖顺序

**位置参数**:
模式之外的目录参数：源目录、目的目录。`organize` 需要两个；`update-cache` 只需源目录（只给一个时仅刷缓存，给两个时刷新并整理）；`list` 不接受任何目录参数。

**源目录 (source directory)**:
被整理的媒体文件所在目录。英文标识统一用 `source`（`SOURCE_DIR`、`--src-dir`）。
_Avoid_: src 的其他混用

**目的目录 (destination directory)**:
硬链接的目标目录。英文标识统一用 `destination`（`DESTINATION_DIR`、`--dest-dir`），不再使用 `target`。
_Avoid_: target, dst（作概念名时）

**过滤词 (filter keyword)**:
`list` 模式的可选关键词，按类型/路径/参数过滤缓存条目。仅 CLI 提供（`--list-cache` 的值或 `=` 形式），不从配置读取。

## Pipeline

**识别池 (worker pool)**:
`process_video` 与 `process_audio` 共用的并发 worker 池（`MEDIA_WORKERS`，默认 4）。子进程产出 `key\tvalue` 行，父进程合并——bash 子 shell 无法写父关联数组，这是唯一的并行契约。音频与视频走同一通用接口（识别函数 → 结果/结局）。
_Avoid_: 并行处理（泛指）

**登记 (register)**:
收拢一切条目写入的注册函数层（`register_identified` / `register_pending` / `register_fallback` / `register_skip` / `register_request_failed`）。一次调用原子完成"目的映射 + 结局账本 + 计数器"，结构上不可能出现只写一半的不一致。命名取自"声明这条记录存在并处于什么状态"，区别于赋值。
_Avoid_: 赋值、写入（语义含混）

**结局账本 (outcome map)**:
`MEDIA_OUTCOME_MAP`：每条目结局类别的唯一账本（identified / fallback / skip_type / skip_unidentified / request_failed / pending_ai）。运行级汇总报告的唯一数据源；跳过/失败条目不进入目的映射，仅登记于此。
_Avoid_: 状态字段

**回退命名 (fallback naming)**:
AI 尽力后仍无法识别时的降级出口（触发条件唯一，无 AI 密钥 → `skip_unidentified`，不回退）。命名不含年份占位（Jellyfin 年份可省略）；空集名不加 ` - ` 段；特典回退复用识别路径的 `S00{tag} - {fragment}` 约定。
_Avoid_: 兜底命名（与识别兜底混淆）

**降级成功 (degraded success)**:
回退命名的条目在汇总中的归类：链接确实建立了（文件可访问），但名字是文件名推断的。计入成功而非跳过，但单列一类显示。
_Avoid_: 成功（不区分）、警告

**伴随文件优先级**:
同名文件归属判定：**视频 > 音频**。音频文件先查是否存在同名视频（任一视频扩展名）——存在则该音频是视频的伴随音轨（由视频的伴随逻辑处理，从独立音频处理中排除）；不存在才是独立音频，再查它自己的伴随（歌词/封面）。当前脚本对 `Movie.zh.ac3` 类音轨会双重处理，需按此规则修复。
_Avoid_: 按扩展名并列判断

**艺术家归类链 (artist resolution chain)**:
音乐条目艺术家归属的逐级判定：专辑艺术家（元数据 ALBUMARTIST，唯一）→ 无则歌曲艺术家（ARTIST）单值视为专辑艺术家 → 多值交 AI（并入现有 AI 批处理，不新增请求类型）→ AI 判断不出用 ` & ` 拼接所有艺术家 → 元数据缺失回退目录名解析（`parse_cd_dir`）→ 仍无则 `Unknown` 文件夹。专辑名（ALBUM 标签 → 目录名）同构；封面等提取仅整理不增删文件，默认关闭。
_Avoid_: 目录名优先（现状，将被替换为末级兜底）

**目的目录规范 (destination structure)**:
按 Jellyfin 官方规范：`Movies/{title} ({year})/` 夹内同名文件；`Shows/{title} ({year})/Season NN/`（补零、不缩写，`Season` 为解析格式不可本地化）；`SxxExx - 集名`；特典 `Season 00` 描述性命名；`Music/{artist}/{album}/`（一夹一专辑）；`MusicVideos/{artist}/{title}`（根目录无空格，识别待样本驱动）。撞名按官方多版本格式去重（` - 2`）；同源旧链接（迁移场景）按 inode 清理。根目录名本地化（默认系统语言，`FOLDER_MOVIES` 等可配）。
_Avoid_: `S01`/`SE01` 季目录名

**已知缺口 (known gaps)**:
① ~~多集单文件（`S01E01-E02.mkv`）~~ ——**已实现**（parse 输出契约 7 段含 `episode_end`；识别/回退命名 `S01E01-E02 - 首集名 - 末集名`）；② Music Videos 识别信号——待真实样本驱动（多数文件规则补齐）；③ 纯音频 mkv/mp4 容器改名（mka/m4a）——文档提示，不自动改文件；④ 电影/电视判断链——存在已知问题（如共享目录下 `count_main_videos` 误判；`(YYYY) [1080p]` 年份不在末尾不识别），暂挂起；⑤ ~~后缀季（`Railgun T`/`II`/`2nd`）~~ ——**已定脚本方案**（剥后缀重搜 + base 剧 seasons 名匹配映射季号；AI 仅兜底 season_shift），待实现；⑥ ~~AI 使用~~ ——**已对齐**（AI 失败→可逆 skip、jq 构造输入、分批、判断/执行职责分离），待实现。

**多集区间 (multi-episode range)**:
单文件含多集（`S01E01-E02`）的区间解析与命名规则。目标文件名保留区间：`{标题} - S01E01-E02 - {首集名} - {末集名}.{ext}`（集名段取**首尾两集**的 TMDB 集名，` - ` 连接）；Jellyfin 据 `S01E01-E02` 识别为多集条目。解析支持 `E01-E02` 与扩展形式（`E01-E02E03`）。
_Avoid_: 吞掉区间（现状行为，静默降级为单集）

## Cache

**空哨兵 (empty sentinel)**:
搜索"查无此片"（`results:[]`）写入的 `empty:true` 包裹缓存，TTL 3 天（`CACHE_EMPTY_TTL_DAYS`）。TTL 内免重复请求，过期后自动重新搜索——新片出现后会被发现。与"请求失败"（不写缓存，下次运行重试）语义分离。
_Avoid_: 空结果缓存（30 天 TTL 锁死，旧行为）

**缓存语言段 (cache language segment)**:
id 类缓存路径（`tv/<id>.<lang>.json`、`tv/<id>/season/<n>.<lang>.json`、`movie/<id>.<lang>.json`）携带 `TMDB_LANG`——语言相关的详情/季数据按语言隔离，切换语言自动 miss 重新拉取。与搜索缓存的 `lang` 入 hash 同构。
_Avoid_: 无语言维度的 id 缓存（切语言后 30 天旧数据）

**并发去重 (flock double-checked locking)**:
识别池多 worker 同时 miss 同一查询时的互斥机制：`tmdb_api` 未命中后 `flock` 锁（锁文件在 `/tmp`，内核锁进程退出自动释放），锁内**双检**缓存——等待者直接命中先写者的结果，同一查询只发一次 TMDB 请求。
_Avoid_: 无锁并发（同一剧多集并发识别会重复请求击穿限流）

## AI

**判断引擎 / 执行引擎 (judgment vs execution)**:
AI 只做**判断**——输出 `{choice: <id> | "", season_shift: <N>, search_term: "重搜词"}`（选中候选 / 季映射 / 无匹配纠正词）；**命名格式化（subdir|filename、年份、Season 补零、SxxExx）始终由脚本构建**。AI 是判断引擎，脚本是执行引擎——格式化是确定性职责，不交给 AI。
_Avoid_: AI 直接输出目标文件名

**AI 批处理批次 (AI batch)**:
`AI_BATCH_SIZE`（默认 50）条/批；`AI_MAX_CALLS` 语义为**批次上限**，达标后剩余 pending 显式 `skip_unidentified`。输入构造用 jq 安全转义（文件名含引号/反斜杠不破坏 JSON）；`PENDING_AI_SEARCH` 分隔符用 `$'\t'`（文件名可含 `|`）。
_Avoid_: 全量单批（数百条 prompt 超上下文）、字符串拼接 JSON

**AI 失败语义**:
AI 请求失败（网络/非 JSON/上限达标）→ 剩余 pending 显式 `skip_unidentified`（**可逆**，下次运行自动重试）；只有"AI 成功返回且判断无解"才走回退命名（不可逆）。与"无 AI 密钥"语义统一——AI 没尽力 ≠ AI 尽力后失败。
_Avoid_: AI 失败 → 回退命名（伪命名被幂等锁死）

**AI 匹配输入契约**:
文件信息（`file` 完整路径 + **目录链**——源根相对路径，最多 3 层）+ TMDB **search 响应原样**（缓存中，零额外请求）+ detail 的 **seasons 四字段提炼**（season_number/name/episode_count/air_date）——体积-信息平衡点。
_Avoid_: 手工提炼候选集（字段选择错误风险）、detail 全量原样（单条 3-8KB，批量超上下文）

**后缀季剥离 (suffix-season stripping)**:
脚本侧方案：搜索无结果或季数存疑时，剥标题末尾季后缀（`T`/`S`/`II`/`III`/`2nd`/`Season 2` 等词表）重搜 base 剧 → 遍历其 seasons 找**名字含被剥后缀**的季 → 文件季号映射到该 season_number。AI 的 `season_shift` 仅兜底脚本剥离失败的情况。
_Avoid_: 把后缀季交给 AI（脚本可解，减少 AI 依赖）
