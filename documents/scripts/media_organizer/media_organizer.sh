#!/bin/bash

################################################################################
# Jellyfin 媒体库硬链接整理脚本
#
# 版本：9.3（入口层/流水线执行/识别匹配/缓存/AI/特典映射六轮需求对齐）
# 作者：LetsShareAll
# 许可：MIT
#
# 说明：
#   自动化整理媒体库，通过 TMDB API 识别电影和电视剧，并使用硬链接创建
#   标准化的目录结构。支持 AI 辅助识别、全量缓存、特典映射等功能。
#
# 功能特性：
#   - 自动识别和整理电影、电视剧
#   - TMDB API 集成，支持 Bearer token 和 API Key 认证
#   - AI 辅助识别（支持 OpenAI API 和兼容接口）
#   - 三阶段处理流程（识别、AI 纠正、硬链接）
#   - 全量持久化缓存（镜像 API 路径，一切请求数据皆缓存）
#   - 特典/番外篇自动识别（TMDB 匹配用 S00E，未匹配用 S00{类型}）
#   - 跨平台支持（Linux/macOS/BusyBox）
#
# 最低要求：
#   - Bash 4.0+
#   - curl、jq、ffprobe
#   - 源目录和目的目录在同一文件系统
#
# 用法：
#   ./media_organizer.sh [选项] <源目录> <目的目录>
#
# 选项：
#   -a, --automated        自动化模式（写入日志，跳过无法处理项目）
#   --dry-run              干运行模式（仅打印操作，不创建链接）
#   --refresh-cache        清空全部持久化缓存
#   --update-cache         基于源目录重新获取并更新缓存
#   --list-cache [关键词]  列出缓存条目（可选关键词过滤）
#   -h, --help             显示帮助信息
#
# 示例：
#   ./media_organizer.sh /downloads /media
#   ./media_organizer.sh -a /downloads /media
#   ./media_organizer.sh --dry-run /downloads /media
#   ./media_organizer.sh --list-cache 刀剑
#
# 配置：
#   - 参考 mo_env.example 创建 mo_env 文件
#   - 查看 CONFIG.md 了解所有配置项
#   - 查看 TROUBLESHOOTING.md 获取问题解决方案
#
# 缓存方案（v9）：
#   缓存目录镜像 TMDB API 路径，一切请求数据全量落盘：
#     search/movie/<hash>.json    /search/movie 搜索结果（键=query&year&lang）
#     search/tv/<hash>.json       /search/tv 搜索结果
#     tv/<id>.<lang>.json         /tv/{id} 剧集详情（原始响应；语言段随 TMDB_LANG）
#     tv/<id>/season/<n>.<lang>.json  /tv/{id}/season/{n} 季数据（含 n=0 特典季）
#     movie/<id>.<lang>.json      /movie/{id} 电影详情（原始响应）
#   搜索缓存为包裹格式（query/year/lang/fetched_at/empty/data），其余直接存原始 JSON。
#   TTL：CACHE_TTL_DAYS（默认 30，正常数据）/ CACHE_EMPTY_TTL_DAYS（默认 3，查无此片哨兵）。
#   并发：tmdb_api 对同一缓存路径用 flock 互斥 + 锁内双检（识别池多 worker 避免重复请求）。
#   搜索空结果写 empty 哨兵（3 天短 TTL），新片出现后自动重新搜索。
#
# 单文件分发说明：
#   本脚本为单文件分发，已内置以下模板与默认值，无需携带任何配套文件：
#     - mo_env 完整配置模板（未提供 API 密钥时自动生成）
#     - mo_special_keymap.json 特典关键词映射（缺失时在用户确认下用常量模板创建）
#     - season_offset.json 常见季偏移默认值（内置，外部 JSON 文件可覆盖）
#   所有配置均可通过环境变量或自动生成的配置文件调整。
#
# 代码结构：
#   1. 常量与全局变量声明
#   2. 日志与色彩函数（最先加载，保证全脚本日志输出一致）
#   3. 配置加载与认证
#   4. 特典映射与季偏移
#   5. 字符串工具
#   6. 缓存管理（cache_* 系列）
#   7. TMDB API（tmdb_api 统一缓存封装）
#   8. 媒体文件名解析
#   9. 媒体识别（电影/电视剧）
#   10. AI 批处理
#   11. 硬链接处理
#   12. 错误处理
#   13. main()（唯一入口，文件末尾调用）
#
################################################################################

set -euo pipefail

################################################################################
# 常量
################################################################################

readonly SCRIPT_VERSION="9.3"
readonly TMDB_API_BASE_URL="https://api.themoviedb.org/3"

# ----------------------------------------------------------------------------
# AI 提示词常量
#
# 作用：
#   AI 批量请求（ai_batch_request）使用的提示词模板。统一置于文件顶部常量区，
#   便于维护与测试。运行时会在提示词后追加 "Input: <JSON>" 输入数据。
#
# 预期返回格式（ai_batch_request 用 jq 解析 .search 与 .special 两个部分）：
#   {
#     "search":  { "<完整 file 路径>": { "search_term": "清洗后的标题", "year": "年份或空串" }, ... },
#     "special": { "<show_id>|<fragment>": { "english_keyword": "英文标准键", "chinese_keyword": "中文别称" }, ... }
#   }
#   - 某类无条目时，对应键为 {}。
#   - search 的键 = 输入 search_entries 中每项的 "file" 完整路径（逐字节复制）。
#   - special 的键 = 输入 special_entries 中每项的 "<show_id>|<fragment>"（fragment 保留原数字）。
#   - 缺失字段用空串 ""。
# ----------------------------------------------------------------------------

# AI 系统消息：强制模型仅输出 JSON，拒绝 Markdown 围栏/注释/尾逗号；
# 要求输出键逐字节复制输入键（否则 jq 查不到导致整批静默丢弃）。
readonly AI_SYSTEM_MESSAGE='You are a strict JSON-only assistant. Respond with exactly one valid JSON object and nothing else. Do NOT wrap it in Markdown code fences (no ```), do NOT add explanations, comments, or trailing commas. All strings must use double quotes. If a field is unknown or absent, use an empty string "". Every input entry MUST appear as an exact key in the output, with the key copied byte-for-byte from the input.'

# 批量 AI 提示词（合并搜索纠正 + 特典映射为一次请求）。
# 输入含 search_entries（file/filename/directory/type）与 special_entries（show_id/fragment/series）。
# 返回 {"search": {...}, "special": {...}}，键规则见上方注释。
readonly AI_BATCH_PROMPT='You are a media file organizer. You receive a JSON input with four arrays:
- "search_entries": media files that failed TMDB search. Each has "file" (full path), "directory" (path chain relative to source root, max 3 levels), "type" ("tv" or "movie").
- "special_entries": unidentifiable special features. Each has "show_id", "fragment" (the local key string from the filename, e.g. "Menu01", "CM01", "Preview02"), "series" (show title), and "season0" (that show'"'"'s TMDB special-season episode list in "episode_number:name; ..." format).
- "artist_entries": audio files with multiple artists. Each has "file" (full path), "artists" (pipe-separated artist list, e.g. "Artist1|Artist2"), "album" (album name or "").
- "match_entries": files whose TMDB search returned results but need disambiguation (year mismatch, season count suspicious, or suffix-season like "Railgun T"). Each has "file", "type", "year" (parsed year or ""), "season" (file season or ""), "search" (the raw TMDB search response JSON), "seasons" (seasons array of the first candidate: season_number/name/episode_count/air_date; may be [] if unavailable).

Return ONE top-level JSON object with exactly four keys:
- "search": an object mapping each entry'"'"'s exact "file" string (copied byte-for-byte; keep full path, brackets, spaces, ampersands) to {"search_term": "...", "year": "..."}. search_term = clean title for TMDB search: strip only media/release tags (S01E30, S1, E12, [Menu01], [1080p], leading [Group]); if type is "tv" remove episode/season numbers BUT keep ordinal words like "2nd Season"; year = 4-digit year if identifiable, else "". If the input "type" is "unknown", also infer and return "media_type": "movie" or "tv" based on the filename/directory (e.g. contains season/episode markers -> "tv", ends with a year or no episode markers -> "movie").
- "special": an object mapping each entry'"'"'s local "fragment" string (exact, keep digits, e.g. "Menu01", "Preview02", "CM01") to an ARRAY of MATCH KEYWORDS — entries from that entry'"'"'s "season0" candidate list that match it, in any language (e.g. "Menu01" -> ["Menu", "菜单"], "Preview02" -> ["Preview", "预告片"], "CM01" -> ["CM", "广告"]). Use the exact strings as written in season0; if no match, use [].
- "artist_choice": an object mapping each artist entry'"'"'s exact "file" string to a SINGLE artist string — pick the one most likely to be the album artist (the primary artist credited for the whole album). If truly undecidable, return "".
- "match": an object mapping each match entry'"'"'s exact "file" string to {"choice": <id> | "", "season_shift": <int> | "", "search_term": "..."}. choice = the result id from "search" that matches this file; if the correct show is a season-with-suffix of a candidate (e.g. file "Toaru Kagaku no Railgun T S01E01" matches candidate 某科学的超电磁炮 whose season 3 is named 某科学的超电磁炮T), pick the candidate id AND set season_shift so that file season + season_shift = the correct TMDB season number (e.g. file S01 -> season_shift 2 -> S03). If the file is a movie, season_shift must be "". If no candidate matches but a corrected search would help, set choice "" and search_term to the corrected title. If truly no match and no correction, return {"choice": "", "season_shift": "", "search_term": ""}.

If a type has no entries, use {} for that key. Process EVERY entry. Missing fields become "". Output ONLY the JSON object.'

################################################################################
# 配置文件模板
#
# 以下常量是脚本生成缺失配置文件时使用的默认模板：
#   MO_ENV_TEMPLATE          -> mo_env 主配置文件
#   SPECIAL_KEYMAP_TEMPLATE  -> mo_special_keymap.json 特典映射
#   SEASON_OFFSET_TEMPLATE   -> season_offset.json 季数偏移
#
# 说明：
#   - 这些常量仅在对应配置文件缺失时，由脚本（在用户确认下）生成默认文件。
#   - 生成后可自行编辑文件，脚本以文件内容为准，常量不影响运行时的配置。
################################################################################

# ----------------------------------------------------------------------------
# MO_ENV_TEMPLATE —— 主配置文件模板（mo_env）
#
# 作用：
#   生成脚本的主配置文件 mo_env，包含全部配置项（TMDB 认证、网络、
#   文件类型、缓存映射、输出调试、AI 辅助、自动化日志、高级选项）。
#
# 用法：
#   1. 复制为 mo_env：cp mo_env.example mo_env（或运行脚本交互生成）
#   2. 设置权限：chmod 600 mo_env
#   3. 编辑并填写必要的配置项（至少填写 TMDB_API_RA_TOKEN）
#   4. 测试：./media_organizer.sh --dry-run /downloads /media
#
# 配置方法：
#   直接编辑此文件，键值格式 KEY=VALUE。完整说明见模板内注释。
# ----------------------------------------------------------------------------
# 该字符串没有表达式需要展开，忽略 ShellCheck 警告 SC2016。
# shellcheck disable=SC2016
readonly MO_ENV_TEMPLATE='################################################################################
# 配置文件示例 (mo_env)
#
# 说明：
#   1. 复制此文件为 mo_env 并填写你的 API 密钥
#   2. 设置文件权限为 600：chmod 600 mo_env
#   3. 不要将此文件提交到版本控制系统
#
# 配置优先级：环境变量 > mo_env 文件 > 脚本默认值
#
################################################################################

# ====== 第一步：TMDB API 认证（必填）======
#
# 必须至少填写以下之一：
#   1. TMDB_API_RA_TOKEN（推荐）- Read Access Token
#   2. TMDB_API_KEY（可选）- v3 API Key
#
# 获取位置：https://www.themoviedb.org/settings/api
#

# TMDB v3 API Key（较旧的认证方式，如已有 RA_TOKEN 可留空）
# 默认值：（空，必须手动填写）
TMDB_API_KEY=

# TMDB Read Access Token（推荐使用，优先级更高）
# 默认值：（空，必须手动填写）
TMDB_API_RA_TOKEN=

# ====== 第二步：基础 TMDB 配置（可选，通常使用默认值）======

# TMDB API 查询语言
# 常见值：zh-CN (中文简体), zh-TW (中文繁体), en-US (英文), ja-JP (日语)
# 默认值：zh-CN
TMDB_LANG=zh-CN

# 两次 TMDB 请求间的延迟（秒）
# 避免 API 限流，TMDB 限制约 4 请求/秒
# 默认值：1
TMDB_DELAY=1

# TMDB 网络配置
# TMDB_CURL_RETRY：curl 重试次数，默认值：3
# TMDB_CURL_CONNECT_TIMEOUT：连接超时（秒），默认值：10
# TMDB_CURL_MAX_TIME：请求最大时长（秒），默认值：30
TMDB_CURL_RETRY=3
TMDB_CURL_CONNECT_TIMEOUT=10
TMDB_CURL_MAX_TIME=30

# ====== 第三步：文件类型配置（可选，通常使用默认值）======

# 需要处理的视频文件扩展名（逗号分隔，不含点号）
# 默认值：mp4,mkv,avi,mov,wmv,flv,m4v,ts,m2ts,webm
VIDEO_EXTS=mp4,mkv,avi,mov,wmv,flv,m4v,ts,m2ts,webm

# 需要处理的音频文件扩展名（含官方音频容器 mka）
# 注意：纯音频 mkv/mp4/webm 请改容器为 mka/m4a（Jellyfin 规范）
# 默认值：mp3,flac,aac,ogg,wma,m4a,mka,ac3,dts,wav,opus
AUDIO_EXTS=mp3,flac,aac,ogg,wma,m4a,mka,ac3,dts,wav,opus

# 字幕文件扩展名（作为配套文件跟随视频）
# 默认值：srt,ass,ssa,sub,idx,vtt,sup
SUB_EXTS=srt,ass,ssa,sub,idx,vtt,sup

# ====== 第四步：缓存与映射配置（可选）======

# 缓存目录路径
# 默认值：$PWD/mo_cache 或 $SCRIPT_DIR/mo_cache（优先级：环境变量 > 执行目录 > 脚本目录）
# 留空使用默认值（推荐）
CACHE_DIR=

# 特典/番外篇关键词映射文件路径
# 格式（仅支持 JSON）：{"Jellyfin/TMDB标准名": ["别称1", "别称2", ...]}
#   键为 Jellyfin/TMDB 能够识别的标准字符串，值为其它语言的别称（可配多个）
# 默认值：$PWD/mo_config/mo_special_keymap.json 或 $SCRIPT_DIR/mo_config/mo_special_keymap.json
# 留空使用默认值（推荐）
SPECIAL_MAP_FILE=

# 季数偏移配置文件路径（仅支持 JSON 对象格式）
# 用于处理 TMDB 季数与实际不符的情况
# 格式：{"剧名": 偏移值, "id:TMDB_ID": 偏移值}
# 默认值：$PWD/mo_config/season_offset.json 或 $SCRIPT_DIR/mo_config/season_offset.json
# 留空使用默认值（推荐）
SEASON_OFFSET_FILE=

# 特典识别词表文件路径（仅支持 JSON 数组格式）
# 语义 = 特典类别词（Menu/CM/PV 等），文件名方括号标记含这些词 → 判定为特典
# 匹配对空格不敏感（"ncop" 可匹配 "nc op"）；内容不当作正则
# 默认值：$PWD/mo_config/mo_special_words.json 或 $SCRIPT_DIR/mo_config/mo_special_words.json
# 留空使用默认值（推荐）
SPECIAL_WORDS_FILE=

# 跳过目录词表文件路径（仅支持 JSON 数组格式）
# 语义 = 不作为媒体名目录的目录词（特典/附带目录 + 分类目录，如 SPs/CDs/特典/视频/剧集/动画/电影）
# 匹配为目录名精确比较（忽略大小写）；内容不当作正则
# 默认值：$PWD/mo_config/mo_skip_dirs.json 或 $SCRIPT_DIR/mo_config/mo_skip_dirs.json
# 留空使用默认值（推荐）
SKIP_DIRS_FILE=

# ====== 第五步：输出与调试（可选）======

# 彩色输出开关
# 值：true (启用) / false (禁用)
# 默认值：true
COLOR_OUTPUT=true

# 调试级别
# 值：0 (禁用) / 1 (基础) / 2 (详细)
# 默认值：0
DEBUG_LEVEL=0

# ====== 第六步：AI 辅助识别配置（可选）======
#
# 配置此部分可使用 AI 辅助识别无法匹配的文件
# 支持 OpenAI API 和 Ollama 等兼容 API
#
# 如果不需要 AI 功能，将 AI_API_KEY 留空即可
#

# AI API 密钥
# OpenAI 获取：https://platform.openai.com/api-keys
# 默认值：（空，留空则禁用 AI 功能）
AI_API_KEY=

# AI API 基础 URL（OpenAI 兼容端点）
# 常见值：
#   - https://api.deepseek.com （DeepSeek 官方，默认）
#   - https://api.openai.com （OpenAI 官方）
#   - http://localhost:11434 （本地 Ollama）
# 默认值：https://api.deepseek.com
AI_BASE_URL=https://api.deepseek.com

# AI API 完整端点 URL（高级选项，留空使用默认）
# 默认值：{AI_BASE_URL}/v1/chat/completions
AI_FULL_URL=

# AI 模型名称
# 默认值：DeepSeek-V4-Flash
AI_MODEL=DeepSeek-V4-Flash

# 单次运行最多 AI 批次调用次数（成本控制；每批 AI_BATCH_SIZE 条）
# 范围：1-100
# 默认值：10
AI_MAX_CALLS=10

# AI 每批处理条目数（搜索/特典/艺术家/匹配四类各自的上限）
# 默认值：50
AI_BATCH_SIZE=50

# AI 干运行模式（测试 AI 功能而不产生费用）
# 默认值：false
AI_DRY_RUN=false

# AI 网络配置
# AI_CURL_RETRY：curl 重试次数，默认值：3
# AI_CURL_CONNECT_TIMEOUT：连接超时（秒），默认值：10
# AI_CURL_MAX_TIME：请求最大时长（秒），默认值：30
AI_CURL_RETRY=3
AI_CURL_CONNECT_TIMEOUT=10
AI_CURL_MAX_TIME=30

# ====== 第七步：自动化模式日志配置（可选）======
#
# 脚本运行在 --automated 模式下时写入日志
#

# 普通日志文件路径
# 默认值：/var/log/media_organizer.log
LOG_FILE=/var/log/media_organizer.log

# 跳过记录日志文件路径（无法处理的文件）
# 默认值：/var/log/media_organizer_skip.log
SKIP_LOG_FILE=/var/log/media_organizer_skip.log

# 日志轮转阈值（MB；0=禁用）
# 超阈值时滚动保留 5 份（.1 最新）
# 默认值：10
LOG_ROTATE_MB=10

# ====== 第八步：高级选项（通常不需要修改）======

# 跳过硬链接检查（不建议启用）
# 仅在确定源和目标在同一文件系统时使用
# 默认值：false
SKIP_HARDLINK_CHECK=false

# ====== 第九步：缓存配置（可选）======

# 正常缓存有效天数（搜索/详情/季数据）
# 超过后自动重新请求
# 默认值：30
CACHE_TTL_DAYS=30

# 无结果缓存有效天数（404/空结果的哨兵缓存）
# 较短，便于发现新增内容
# 默认值：3
CACHE_EMPTY_TTL_DAYS=3

# ====== 第十步：运行模式（可选，通常由命令行指定）======
#
# 也可在此设置（优先级：CLI > 环境变量 > mo_env > 默认值）：
#   AUTOMATED=true  等同命令行 --automated
#   DRY_RUN=true    等同命令行 --dry-run
# 命令行可用 --no-automated / --no-dry-run 反向覆盖此处设置
#
# 注意：--list-cache / --update-cache / --refresh-cache 仅限命令行指定
#
# 自动化模式（写入日志文件，跳过无法处理的项目）
# 默认值：false
AUTOMATED=false

# 干运行模式（不创建链接、不写缓存与日志；网络请求照常但不落盘）
# 默认值：false
DRY_RUN=false

# ====== 第十一步：目的目录命名与识别池（可选）======
#
# 目的目录根名默认跟随系统语言（locale 含 zh → 中文名），
# 也可在此显式覆盖。Season NN / SxxExx 为 Jellyfin 解析格式，不可本地化。
# 留空使用默认值（推荐）
FOLDER_MOVIES=
FOLDER_SHOWS=
FOLDER_MUSIC=
FOLDER_MUSICVIDEOS=
FOLDER_UNKNOWN=

# 识别池并发数（视频/音频共用；范围 1-8）
# TMDB 限流约 4 请求/秒，并发提高时建议同步增大 TMDB_DELAY
# 默认值：4
MEDIA_WORKERS=4

################################################################################
# 使用说明
################################################################################

# 1. 保存此文件为 mo_env
#    cp mo_env.example mo_env

# 2. 设置文件权限为 600（重要！）
#    chmod 600 mo_env

# 3. 编辑 mo_env 并填写必要的配置项
#    vim mo_env

# 4. 测试配置（干运行模式）
#    ./media_organizer.sh --dry-run /downloads /media

# 5. 正式运行
#    ./media_organizer.sh /downloads /media

# 6. 自动化模式（如需定时运行）
#    ./media_organizer.sh --automated /downloads /media

################################################################################
# 配置优先级示例
################################################################################

# 假设配置如下：
# mo_env 中：TMDB_DELAY=2
# 环境变量：export TMDB_DELAY=3

# 脚本实际使用的值：3（环境变量优先）

# 如果都没有设置，使用脚本默认值：1

################################################################################
# 常见配置场景
################################################################################

# 【场景 1】基础用户 - 仅使用默认设置
# 只需填写：TMDB_API_RA_TOKEN
# 其余保持默认值

# 【场景 2】日本动画专用 - 针对日语字幕和特典
# TMDB_LANG=ja-JP
# SPECIAL_MAP_FILE=/path/to/anime_special_map.json
# SEASON_OFFSET_FILE=/path/to/anime_offset.json

# 【场景 3】大规模处理 - 优化性能和成本
# TMDB_DELAY=2
# AI_MAX_CALLS=50
# CACHE_DIR=/var/cache/media_organizer
# DEBUG_LEVEL=1

# 【场景 4】测试模式 - 不产生成本
# AI_DRY_RUN=true
# DEBUG_LEVEL=2

# 【场景 5】网络不稳定环境
# TMDB_CURL_RETRY=5
# TMDB_CURL_MAX_TIME=60
# AI_CURL_MAX_TIME=60
# TMDB_DELAY=2

################################################################################
# 故障排除快速参考
################################################################################

# 问题：Permission denied mo_env
# 解决：chmod 600 mo_env

# 问题：TMDB API 请求超时
# 解决：增大 TMDB_CURL_MAX_TIME=60, TMDB_DELAY=2

# 问题：识别准确度低
# 解决：配置 AI_API_KEY，启用 AI 辅助

# 问题：AI 成本过高
# 解决：减小 AI_MAX_CALLS=5，或改用免费 Ollama

# 问题：无法读取配置文件
# 解决：检查文件权限和所有者
#      stat -l mo_env
#      chown $(whoami) mo_env

################################################################################'

# ----------------------------------------------------------------------------
# SPECIAL_KEYMAP_TEMPLATE —— 特典映射模板（mo_special_keymap.json）
#
# 作用：
#   定义特典/番外篇的识别映射：本地关键字符串（文件中的特典标记）→ TMDB 可匹配关键字数组。
#   脚本用数组内任一值去匹配文件名与 TMDB 季 0 的特典名称。
#
# 用法：
#   1. 文件缺失时，脚本在用户确认下用此模板生成 mo_special_keymap.json
#   2. 可编辑该文件增删映射（键=本地关键字符串，值=TMDB 可匹配关键字）
#
# 多键→多值：
#   值为 JSON 数组（多语言，如 ["Menu","菜单","メニュー"]）；
#   值为字符串时表示引用另一键的数组（多键共享一组值，如不同压制组的
#   Menu01/Menu 01/MENU01 都指向 "menu"）。
#   示例：{"menu": ["Menu", "菜单"], "menu01": "menu", "menu_1": "menu"}
#   识别时先用本地字符串精确查表，再按去数字后的核心词查表；数组内任一值命中 TMDB 特典名即匹配。
#
# 注意：仅用于创建默认文件，不作为运行时默认映射（匹配完全依赖文件内容）。
# ----------------------------------------------------------------------------
readonly SPECIAL_KEYMAP_TEMPLATE='{
  "menu": ["Menu", "菜单", "メニュー"],
  "cm": ["CM", "广告", "コマーシャル"],
  "pv": ["PV", "宣传片", "プロモーションビデオ"],
  "ncop": ["NCOP", "无字幕片头", "ノンクレジットオープニング"],
  "nced": ["NCED", "无字幕片尾", "ノンクレジットエンディング"],
  "trailer": ["Trailer", "预告片", "トレーラー"],
  "teaser": ["Teaser", "先行预告", "ティザー"],
  "preview": ["Preview", "预告片", "予告"],
  "webpreview": "preview",
  "event": ["Event", "活动", "イベント"],
  "sp": ["Special", "特别篇", "スペシャル"],
  "special": ["Special", "特别篇", "スペシャル"],
  "opening": ["Opening", "片头曲", "オープニング"],
  "ending": ["Ending", "片尾曲", "エンディング"],
  "mv": ["Music Video", "音乐视频", "ミュージックビデオ"],
  "musicvideo": "mv",
  "interview": ["Interview", "访谈", "インタビュー"]
}'

# ----------------------------------------------------------------------------
# SPECIAL_WORDS_TEMPLATE —— 特典识别词表模板（mo_special_words.json）
#
# 作用：
#   特典识别的判定词（文件名方括号标记含这些词 → 判定为特典）。
#   语义 = 特典类别词（Menu/CM/PV/NCOP/NCED 等），匹配对空格不敏感
#   （词表 "ncop" 可匹配文件名里的 "nc op"）。
#   词表内容不当作正则（纯字符串子串匹配）。
# ----------------------------------------------------------------------------
readonly SPECIAL_WORDS_TEMPLATE='["menu","ncop","nced","mini anime","pv","cm","sp","teaser","program","promo","trailer","special","music video","mv","opening","ending","特典","特番","花絮"]'

# ----------------------------------------------------------------------------
# SKIP_DIRS_TEMPLATE —— 跳过目录词表模板（mo_skip_dirs.json）
#
# 作用：
#   不作为"媒体名目录"的目录词（特典/附带目录 + 分类目录）：
#   - find_show_path_from_file / find_show_dir_from_path：目录名精确匹配（忽略大小写）
#   - count_main_videos：路径段精确匹配
#   内容不当作正则（纯字符串比较）。
# ----------------------------------------------------------------------------
readonly SKIP_DIRS_TEMPLATE='["sp","sps","special","specials","cd","cds","bonus","bonuses","extra","extras","scans","fonts","特典","特番","花絮","视频","剧集","动画","合集","电影","音乐","movies","series","shows","anime","collections"]'

# ----------------------------------------------------------------------------
# SEASON_OFFSET_TEMPLATE —— 季数偏移模板（season_offset.json）
#
# 作用：
#   定义常见剧集的季数偏移值，用于处理 TMDB 季数与实际集数不符的情况
#   （如 TMDB 只有一季，但资源实际有 S01-S03）。
#
# 用法：
#   1. 文件缺失时，脚本用此模板生成 season_offset.json
#   2. 可编辑该文件覆盖/新增偏移值
#
# 配置方法：
#   键为剧名（小写）或 "id:TMDB_ID"，值为第一季的集数（偏移基准）。
#   示例：{"jujutsu kaisen": 23} 表示第一季有 23 集，后续季自动 +23 偏移。
# ----------------------------------------------------------------------------
readonly SEASON_OFFSET_TEMPLATE='{
  "jujutsu kaisen": 23,
  "id:109620": 23,
  "demon slayer": 26,
  "demon slayer: kimetsu no yaiba": 26,
  "attack on titan": 25,
  "shingeki no kyojin": 25,
  "bleach": 26,
  "naruto": 220,
  "one piece": 130,
  "game of thrones": 10,
  "breaking bad": 7,
  "the big bang theory": 17,
  "ling cage": 24,
  "heaven official'"'"'s blessing": 11
}'

################################################################################
# 全局变量
################################################################################

SCRIPT_DIR=""

# 运行模式标志。
# 可用 ${VAR:-} 保形初始化：AUTOMATED/DRY_RUN 允许从环境变量读取（优先级链第一层），
# 直接赋 "" 的其余标志为 CLI 专用（--list-cache / --update-cache / --refresh-cache），忽略环境变量。
AUTOMATED="${AUTOMATED:-}"
DRY_RUN="${DRY_RUN:-}"
REFRESH_CACHE=""
UPDATE_CACHE=""
LIST_CACHE=""
LIST_CACHE_FILTER=""

# 目录和文件路径（SOURCE_DIR/DESTINATION_DIR 仅来自 CLI；保形初始化便于测试环境注入）
SOURCE_DIR="${SOURCE_DIR:-}"
DESTINATION_DIR="${DESTINATION_DIR:-}"
CACHE_DIR="${CACHE_DIR:-}"
CONFIG_FILE=""

# 目的目录根名（本地化，默认跟随系统语言；load_config 中按 FOLDER_* 配置链赋值；
# 保形初始化避免吞掉环境变量）
FOLDER_MOVIES="${FOLDER_MOVIES:-}"
FOLDER_SHOWS="${FOLDER_SHOWS:-}"
FOLDER_MUSIC="${FOLDER_MUSIC:-}"
FOLDER_MUSICVIDEOS="${FOLDER_MUSICVIDEOS:-}"
FOLDER_UNKNOWN="${FOLDER_UNKNOWN:-}"

# TMDB 认证信息
TMDB_AUTH_TOKEN=""
TMDB_USE_BEARER=false

# 配置变量
# 默认值由 load_config() 统一设置（${VAR:-mo_env:-default}），支持环境变量和 mo_env 覆盖；
# 此处用 ${VAR:-} 保形初始化，避免顶层赋空串吞掉环境变量
TMDB_LANG="${TMDB_LANG:-}"
TMDB_DELAY="${TMDB_DELAY:-}"
COLOR_OUTPUT="${COLOR_OUTPUT:-}"
DEBUG_LEVEL="${DEBUG_LEVEL:-}"

# 扩展名（字符串保形，load_config 中 read -ra 转为数组）
VIDEO_EXTS="${VIDEO_EXTS:-}"
AUDIO_EXTS="${AUDIO_EXTS:-}"
SUB_EXTS="${SUB_EXTS:-}"

# AI 调用统计
AI_CALL_COUNT=0

# curl 网络配置
TMDB_CURL_RETRY="${TMDB_CURL_RETRY:-}"
TMDB_CURL_CONNECT_TIMEOUT="${TMDB_CURL_CONNECT_TIMEOUT:-}"
TMDB_CURL_MAX_TIME="${TMDB_CURL_MAX_TIME:-}"
AI_CURL_RETRY="${AI_CURL_RETRY:-}"
AI_CURL_CONNECT_TIMEOUT="${AI_CURL_CONNECT_TIMEOUT:-}"
AI_CURL_MAX_TIME="${AI_CURL_MAX_TIME:-}"

# AI 配置
AI_API_KEY="${AI_API_KEY:-}"
AI_BASE_URL="${AI_BASE_URL:-}"
AI_FULL_URL="${AI_FULL_URL:-}"
AI_MODEL="${AI_MODEL:-}"
AI_MAX_CALLS="${AI_MAX_CALLS:-}"
AI_DRY_RUN="${AI_DRY_RUN:-}"

# 日志文件
LOG_FILE="${LOG_FILE:-}"
SKIP_LOG_FILE="${SKIP_LOG_FILE:-}"
# 日志轮转阈值（MB；0=禁用，超阈值时滚动保留 5 份）
LOG_ROTATE_MB="${LOG_ROTATE_MB:-}"

# 映射配置文件（init_special_map/init_season_offset/init_special_words 中解析默认路径）
SPECIAL_MAP_FILE="${SPECIAL_MAP_FILE:-}"
SEASON_OFFSET_FILE="${SEASON_OFFSET_FILE:-}"
SPECIAL_WORDS_FILE="${SPECIAL_WORDS_FILE:-}"
SKIP_DIRS_FILE="${SKIP_DIRS_FILE:-}"
# 特典识别词表（init_special_words 加载；worker 经 fork 复制可见）
declare -a SPECIAL_WORDS=()
# 跳过目录词表（init_skip_dirs 加载；SKIP_DIRS_LOWER 为小写化版本供精确匹配）
declare -a SKIP_DIRS=()
declare -a SKIP_DIRS_LOWER=()

# 关联数组
# 特典映射（本地关键字符串 -> TMDB 字符串，一对一）
declare -A SPECIAL_MAP=()
# 剧名/剧ID -> 季数偏移
declare -A SEASON_OFFSET_MAP=()
# 源文件路径 -> 目的信息（子目录|文件名，两段式；key=源文件）
declare -A MEDIA_DESTINATION_MAP=()
# 结局账本：源文件路径 -> 结局类别（identified/fallback/skip_type/skip_unidentified/request_failed/pending_ai）
# 汇总报告唯一数据源；跳过/失败条目不进入目的映射
declare -A MEDIA_OUTCOME_MAP=()
# 待 AI 纠正的搜索项
declare -A PENDING_AI_SEARCH=()
# 待 AI 判定的多艺术家音频项（key=音频文件，value=候选艺术家|专辑）
declare -A PENDING_AI_ARTIST=()
# AI 对多艺术家的判定结果（key=音频文件，value=选定的专辑艺术家或空）
declare -A AI_ARTIST_CHOICE=()
# 待 AI 匹配甄别的条目（key=文件，value=type\tyear\tseason\tendpoint\tkey——搜索响应在缓存中）
declare -A PENDING_AI_MATCH=()
# AI 匹配结果（key=文件，value=选定 id / 季偏移 / 重搜词）
declare -A AI_MATCH_CHOICE=()
declare -A AI_MATCH_SHIFT=()
declare -A AI_MATCH_TERM=()
# 本批 AI 请求覆盖的 key 集合（消费端只处理响应覆盖的条目，批外留待下一批）
declare -a AI_BATCH_KEYS_SEARCH=()
declare -a AI_BATCH_KEYS_SPECIAL=()
declare -a AI_BATCH_KEYS_ARTIST=()
declare -a AI_BATCH_KEYS_MATCH=()
# AI 响应中实际出现的 key（AI 漏了的条目留待下一批）
declare -A AI_RESPONDED_SEARCH=()
declare -A AI_RESPONDED_ARTIST=()
declare -A AI_RESPONDED_MATCH=()
# 待 AI 学习的特典项
declare -A PENDING_AI_SPECIAL=()

# 数组
declare -a VIDEO_FILES=()
# 音频文件（CD 音乐，归入 Music 分类）
declare -a AUDIO_FILES=()
# 媒体目录正片数量缓存（避免重复扫描，键=show 目录完整路径）
declare -A MAIN_COUNT_CACHE=()
# 特典映射原始值缓存（值可为 JSON 数组或字符串引用，供 resolve_special_value 展开）
declare -A RAW_SPECIAL_MAP=()

# 计数器
PENDING_SEARCH_COUNT=0
PENDING_SPECIAL_COUNT=0
PENDING_ARTIST_COUNT=0
PENDING_MATCH_COUNT=0
INDENT_LEVEL=0

# 链接阶段计数（供运行级汇总与退出码分级）
LINK_SUCCESS_COUNT=0
LINK_FAIL_COUNT=0

# 协议行合并统计（merge_emit_lines 输出，供 pool_run 阈值检查）
MERGE_PROCESSED=0
MERGE_FAILED=0
MERGE_STREAK=0

# 高级选项
SKIP_HARDLINK_CHECK="${SKIP_HARDLINK_CHECK:-}"

# 色彩代码（init_colors() 中按 COLOR_OUTPUT 赋值）
C_RESET=''
C_RED=''
C_GREEN=''
C_YELLOW=''
C_BLUE=''
C_MAGENTA=''
C_GRAY=''
C_WHITE=''
C_DIM=''
C_LIGHT_CYAN=''

################################################################################
# 日志与色彩（最先加载，保证全脚本日志输出一致）
################################################################################

# 初始化 ANSI 色彩代码。COLOR_OUTPUT=true 时启用，否则保持空字符串。
init_colors() {
  if [[ "${COLOR_OUTPUT,,}" == "true" ]]; then
    readonly C_RESET='\033[0m'
    readonly C_RED='\033[0;31m'
    readonly C_GREEN='\033[0;32m'
    readonly C_YELLOW='\033[1;33m'
    readonly C_BLUE='\033[0;34m'
    readonly C_MAGENTA='\033[0;35m'
    readonly C_GRAY='\033[0;90m'
    readonly C_WHITE='\033[1;37m'
    readonly C_DIM='\033[2m'
    readonly C_LIGHT_CYAN='\033[1;36m'
  fi
}

# 返回当前缩进字符串（每级 2 空格）。
get_indent() {
  local count=$((INDENT_LEVEL * 2))
  printf '%*s' "$count" ''
}

# 增加缩进级别。
push_indent() {
  # 用赋值而非 ((var++))：((0++)) 表达式值为 0 会返回非零退出状态，
  # 在 set -e 下会导致脚本意外退出。
  INDENT_LEVEL=$((INDENT_LEVEL + 1))
}

# 减少缩进级别。
pop_indent() {
  INDENT_LEVEL=$((INDENT_LEVEL - 1))
}

# 统一日志输出。级别：信息/警告/错误/成功/匹配/搜索/跳过/调试/智能。
# 自动化模式下同时写入日志文件；干运行模式下不写日志文件（零持久化副作用）。
_log() {
  local level="$1"
  shift
  local color="" tag=""
  case "$level" in
    信息)
      color="$C_WHITE"
      tag="信息"
      ;;
    警告)
      color="$C_YELLOW"
      tag="警告"
      ;;
    错误)
      color="$C_RED"
      tag="错误"
      ;;
    成功)
      color="$C_GREEN"
      tag="成功"
      ;;
    匹配)
      color="$C_MAGENTA"
      tag="匹配"
      ;;
    搜索)
      color="$C_BLUE"
      tag="搜索"
      ;;
    跳过)
      color="$C_GRAY"
      tag="跳过"
      ;;
    调试)
      color="$C_DIM"
      tag="调试"
      ;;
    智能)
      color="$C_LIGHT_CYAN"
      tag="智能"
      ;;
    *)
      color="$C_RESET"
      tag="未知"
      ;;
  esac

  local timestamp
  timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  printf "${color}[%s] [%s]%s%s${C_RESET}\n" \
    "$timestamp" "$tag" "$(get_indent)" "$*" >&2

  if [[ "${AUTOMATED:-false}" == "true" ]] && [[ -n "${LOG_FILE:-}" ]] &&
    [[ "${DRY_RUN:-false}" != "true" ]]; then
    printf "[%s] [%s]%s%s\n" \
      "$timestamp" "$tag" "$(get_indent)" "$*" >>"$LOG_FILE"
  fi
}

################################################################################
# 配置加载与认证
################################################################################

# 查找配置文件。优先级：执行目录 mo_config > 脚本目录 mo_config。
find_config_file() {
  if [[ -f "$PWD/mo_config/mo_env" ]]; then
    echo "$PWD/mo_config/mo_env"
    return 0
  elif [[ -f "$SCRIPT_DIR/mo_config/mo_env" ]]; then
    echo "$SCRIPT_DIR/mo_config/mo_env"
    return 0
  fi
  return 1
}

# 获取文件所有者（兼容 GNU/BSD/BusyBox stat）。
# 依次尝试：GNU stat -c '%U' -> BSD stat -f '%Su' -> 数字 UID + /etc/passwd -> ls -ld -> find -printf。
get_file_owner() {
  local filepath="$1"
  local owner uid
  owner=$(stat -c '%U' "$filepath" 2>/dev/null)
  [[ -n "$owner" ]] && {
    echo "$owner"
    return 0
  }
  owner=$(stat -f '%Su' "$filepath" 2>/dev/null)
  [[ -n "$owner" ]] && {
    echo "$owner"
    return 0
  }
  # BusyBox 回退：数字 UID，再从 /etc/passwd 解析用户名
  uid=$(stat -c '%u' "$filepath" 2>/dev/null)
  if [[ -n "$uid" ]]; then
    owner=$(awk -F: -v u="$uid" '$3==u {print $1; exit}' /etc/passwd 2>/dev/null)
    echo "${owner:-$uid}"
    return 0
  fi
  # ls -ld 解析所有者（BusyBox 可靠，stat/find -printf 可能不可用）
  # shellcheck disable=SC2012
  owner=$(ls -ld "$filepath" 2>/dev/null | awk '{print $3}')
  [[ -n "$owner" ]] && {
    echo "$owner"
    return 0
  }
  # GNU find 兜底：-printf 解析所有者
  find "$filepath" -maxdepth 0 -printf '%u' 2>/dev/null
}

# 获取文件权限字符串（兼容 GNU/BSD/BusyBox stat）。
# 依次尝试：GNU stat -c '%A' -> BSD stat -f '%Sp' -> stat -c '%a' -> ls -ld -> find -printf。
get_file_permission() {
  local filepath="$1"
  local perm
  perm=$(stat -c '%A' "$filepath" 2>/dev/null)
  [[ -n "$perm" ]] && {
    echo "$perm"
    return 0
  }
  perm=$(stat -f '%Sp' "$filepath" 2>/dev/null)
  [[ -n "$perm" ]] && {
    echo "$perm"
    return 0
  }
  # BusyBox 回退：数字权限（如 600）
  perm=$(stat -c '%a' "$filepath" 2>/dev/null)
  [[ -n "$perm" ]] && {
    echo "$perm"
    return 0
  }
  # ls -ld 解析权限字段（BusyBox 可靠，stat/find -printf 可能不可用）
  # shellcheck disable=SC2012
  perm=$(ls -ld "$filepath" 2>/dev/null | awk '{print $1}')
  [[ -n "$perm" ]] && {
    echo "$perm"
    return 0
  }
  # GNU find 兜底：-printf 解析数字权限
  find "$filepath" -maxdepth 0 -printf '%m' 2>/dev/null
}

# 检查密钥文件安全性：必须为当前用户所有，权限为 600。
# 严格校验，不允许跳过（防止 mo_env 被篡改）。
# 读取所有者/权限时依赖 get_file_* 的完整降级链（stat -> ls -> find），
# 确保在 stat/find -printf 不可用的系统上仍能取得正确值完成校验。
check_secure_file() {
  local filepath="$1"

  if [[ ! -f "$filepath" ]]; then
    _log 错误 "密钥文件不存在：$filepath"
    return 1
  fi

  local current_user file_owner
  current_user=$(id -un 2>/dev/null || true)

  file_owner=$(get_file_owner "$filepath")
  if [[ -z "$file_owner" ]]; then
    _log 错误 "无法读取文件所有者（系统 stat 命令不兼容）"
    return 1
  fi

  # 仅当能获取当前用户名时才校验所有者（嵌入式系统可能无法解析）
  if [[ -n "$current_user" ]] && [[ "$file_owner" != "$current_user" ]]; then
    _log 错误 "文件所有者应为当前用户"
    return 1
  fi

  local file_perm
  file_perm=$(get_file_permission "$filepath")
  if [[ -z "$file_perm" ]]; then
    _log 错误 "无法读取文件权限"
    return 1
  fi

  # 接受符号格式（-rw-------）或数字格式（600）
  if [[ "$file_perm" != "-rw-------" ]] && [[ "$file_perm" != "600" ]]; then
    _log 错误 "文件权限应为 600，当前为 $file_perm"
    return 1
  fi

  return 0
}

# 从配置文件解析指定键的值（KEY=VALUE 格式）。
parse_config_key() {
  local config_file="$1"
  local key="$2"

  grep -E "^[[:space:]]*${key}=" "$config_file" 2>/dev/null |
    head -1 |
    sed -E 's/^[[:space:]]*'"${key}"'=//; s/[[:space:]]*$//' || true
}

# 加载 mo_env 配置并应用环境变量默认值。
# 配置优先级链：CLI > 环境变量 > mo_env 文件 > 默认值。
# mo_env 采用白名单键加载：键名集合取自 MO_ENV_TEMPLATE，逐键 grep 提取，
# 文件内容永不执行（配置即数据）；白名单外的自定义键不生效。
load_config() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # 读取 mo_env 白名单键值（配置文件存在且通过安全检查时）
  local -A moenv=()
  if CONFIG_FILE=$(find_config_file); then
    if ! check_secure_file "$CONFIG_FILE"; then
      exit 1
    fi
    local key
    while IFS= read -r key; do
      [[ -z "$key" ]] && continue
      moenv["$key"]=$(parse_config_key "$CONFIG_FILE" "$key")
    done < <(
      grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' <<<"$MO_ENV_TEMPLATE" |
        sed 's/=$//' | sort -u
    )
  fi

  # 模式标志（CLI 显式设置后不再覆盖；env/mo_env 可设，默认 false）
  AUTOMATED="${AUTOMATED:-${moenv[AUTOMATED]:-false}}"
  DRY_RUN="${DRY_RUN:-${moenv[DRY_RUN]:-false}}"

  # 目的目录根名（默认跟随系统语言：locale 含 zh → 中文名；FOLDER_* 显式设置覆盖）
  local _lang="${LANG:-${LC_ALL:-}}"
  if [[ "$_lang" == zh* ]]; then
    FOLDER_MOVIES="${FOLDER_MOVIES:-${moenv[FOLDER_MOVIES]:-电影}}"
    FOLDER_SHOWS="${FOLDER_SHOWS:-${moenv[FOLDER_SHOWS]:-剧集}}"
    FOLDER_MUSIC="${FOLDER_MUSIC:-${moenv[FOLDER_MUSIC]:-音乐}}"
    FOLDER_MUSICVIDEOS="${FOLDER_MUSICVIDEOS:-${moenv[FOLDER_MUSICVIDEOS]:-音乐视频}}"
    FOLDER_UNKNOWN="${FOLDER_UNKNOWN:-${moenv[FOLDER_UNKNOWN]:-未知}}"
  else
    FOLDER_MOVIES="${FOLDER_MOVIES:-${moenv[FOLDER_MOVIES]:-Movies}}"
    FOLDER_SHOWS="${FOLDER_SHOWS:-${moenv[FOLDER_SHOWS]:-Shows}}"
    FOLDER_MUSIC="${FOLDER_MUSIC:-${moenv[FOLDER_MUSIC]:-Music}}"
    FOLDER_MUSICVIDEOS="${FOLDER_MUSICVIDEOS:-${moenv[FOLDER_MUSICVIDEOS]:-MusicVideos}}"
    FOLDER_UNKNOWN="${FOLDER_UNKNOWN:-${moenv[FOLDER_UNKNOWN]:-Unknown}}"
  fi

  # 识别池并发数（1-8）
  MEDIA_WORKERS="${MEDIA_WORKERS:-${moenv[MEDIA_WORKERS]:-4}}"
  [[ "$MEDIA_WORKERS" =~ ^[1-8]$ ]] || MEDIA_WORKERS=4

  # TMDB 认证
  TMDB_API_KEY="${TMDB_API_KEY:-${moenv[TMDB_API_KEY]:-}}"
  TMDB_API_RA_TOKEN="${TMDB_API_RA_TOKEN:-${moenv[TMDB_API_RA_TOKEN]:-}}"

  # 基础配置
  TMDB_LANG="${TMDB_LANG:-${moenv[TMDB_LANG]:-zh-CN}}"
  TMDB_DELAY="${TMDB_DELAY:-${moenv[TMDB_DELAY]:-1}}"
  COLOR_OUTPUT="${COLOR_OUTPUT:-${moenv[COLOR_OUTPUT]:-true}}"
  DEBUG_LEVEL="${DEBUG_LEVEL:-${moenv[DEBUG_LEVEL]:-0}}"

  # 自动化模式日志初始化
  if [[ "$AUTOMATED" == "true" ]]; then
    LOG_FILE="${LOG_FILE:-${moenv[LOG_FILE]:-/var/log/media_organizer.log}}"
    SKIP_LOG_FILE="${SKIP_LOG_FILE:-${moenv[SKIP_LOG_FILE]:-/var/log/media_organizer_skip.log}}"
    LOG_ROTATE_MB="${LOG_ROTATE_MB:-${moenv[LOG_ROTATE_MB]:-10}}"
    [[ "$LOG_ROTATE_MB" =~ ^[0-9]+$ ]] || LOG_ROTATE_MB=10
    # 干运行不创建日志目录（零持久化副作用）
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
      mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$SKIP_LOG_FILE")" \
        2>/dev/null || true
      # 日志轮转：超阈值时滚动保留 5 份（.1 最新）
      if ((LOG_ROTATE_MB > 0)); then
        local _limit=$((LOG_ROTATE_MB * 1024 * 1024)) _lf _size
        for _lf in "$LOG_FILE" "$SKIP_LOG_FILE"; do
          [[ -f "$_lf" ]] || continue
          _size=$(stat -c '%s' "$_lf" 2>/dev/null) || _size=0
          if ((_size > _limit)); then
            rm -f "${_lf}.5"
            mv -f "${_lf}.4" "${_lf}.5" 2>/dev/null || true
            mv -f "${_lf}.3" "${_lf}.4" 2>/dev/null || true
            mv -f "${_lf}.2" "${_lf}.3" 2>/dev/null || true
            mv -f "${_lf}.1" "${_lf}.2" 2>/dev/null || true
            mv -f "$_lf" "${_lf}.1"
            _log 信息 "日志已轮转: $_lf -> ${_lf}.1"
          fi
        done
      fi
    fi
  fi

  # 解析扩展名配置（mka 为官方音频容器；纯音频 mkv/mp4/webm 需用户自行改容器为 mka/m4a）
  IFS=',' read -ra VIDEO_EXTS <<<"${VIDEO_EXTS:-${moenv[VIDEO_EXTS]:-mp4,mkv,avi,mov,wmv,flv,m4v,ts,m2ts,webm}}"
  IFS=',' read -ra AUDIO_EXTS <<<"${AUDIO_EXTS:-${moenv[AUDIO_EXTS]:-mp3,flac,aac,ogg,wma,m4a,mka,ac3,dts,wav,opus}}"
  IFS=',' read -ra SUB_EXTS <<<"${SUB_EXTS:-${moenv[SUB_EXTS]:-srt,ass,ssa,sub,idx,vtt,sup}}"

  # curl 网络配置
  TMDB_CURL_RETRY="${TMDB_CURL_RETRY:-${moenv[TMDB_CURL_RETRY]:-3}}"
  TMDB_CURL_CONNECT_TIMEOUT="${TMDB_CURL_CONNECT_TIMEOUT:-${moenv[TMDB_CURL_CONNECT_TIMEOUT]:-10}}"
  TMDB_CURL_MAX_TIME="${TMDB_CURL_MAX_TIME:-${moenv[TMDB_CURL_MAX_TIME]:-30}}"
  AI_CURL_RETRY="${AI_CURL_RETRY:-${moenv[AI_CURL_RETRY]:-3}}"
  AI_CURL_CONNECT_TIMEOUT="${AI_CURL_CONNECT_TIMEOUT:-${moenv[AI_CURL_CONNECT_TIMEOUT]:-10}}"
  AI_CURL_MAX_TIME="${AI_CURL_MAX_TIME:-${moenv[AI_CURL_MAX_TIME]:-30}}"
  AI_MAX_CALLS="${AI_MAX_CALLS:-${moenv[AI_MAX_CALLS]:-10}}"
  AI_DRY_RUN="${AI_DRY_RUN:-${moenv[AI_DRY_RUN]:-false}}"
  # AI 批处理：模型/端点/批大小默认（DeepSeek-V4-Flash，OpenAI 兼容端点）
  AI_MODEL="${AI_MODEL:-${moenv[AI_MODEL]:-DeepSeek-V4-Flash}}"
  AI_BASE_URL="${AI_BASE_URL:-${moenv[AI_BASE_URL]:-https://api.deepseek.com}}"
  AI_BATCH_SIZE="${AI_BATCH_SIZE:-${moenv[AI_BATCH_SIZE]:-50}}"
  [[ "$AI_BATCH_SIZE" =~ ^[0-9]+$ ]] && [[ "$AI_BATCH_SIZE" -ge 1 ]] || AI_BATCH_SIZE=50
  AI_FULL_URL="${AI_FULL_URL:-${moenv[AI_FULL_URL]:-}}"
  SKIP_HARDLINK_CHECK="${SKIP_HARDLINK_CHECK:-${moenv[SKIP_HARDLINK_CHECK]:-false}}"

  # 缓存 TTL 配置（天）
  CACHE_TTL_DAYS="${CACHE_TTL_DAYS:-${moenv[CACHE_TTL_DAYS]:-30}}"
  CACHE_EMPTY_TTL_DAYS="${CACHE_EMPTY_TTL_DAYS:-${moenv[CACHE_EMPTY_TTL_DAYS]:-3}}"

  # 路径配置（空值时由 init_cache_dir / init_special_map / init_season_offset / init_special_words 解析默认路径）
  CACHE_DIR="${CACHE_DIR:-${moenv[CACHE_DIR]:-}}"
  SPECIAL_MAP_FILE="${SPECIAL_MAP_FILE:-${moenv[SPECIAL_MAP_FILE]:-}}"
  SEASON_OFFSET_FILE="${SEASON_OFFSET_FILE:-${moenv[SEASON_OFFSET_FILE]:-}}"
  SPECIAL_WORDS_FILE="${SPECIAL_WORDS_FILE:-${moenv[SPECIAL_WORDS_FILE]:-}}"
  SKIP_DIRS_FILE="${SKIP_DIRS_FILE:-${moenv[SKIP_DIRS_FILE]:-}}"
}

# 选择 TMDB 认证方式并校验。无密钥时交互生成 mo_env 模板。
select_auth() {
  TMDB_API_KEY="${TMDB_API_KEY:-}"
  TMDB_API_RA_TOKEN="${TMDB_API_RA_TOKEN:-}"

  if [[ -n "$TMDB_API_RA_TOKEN" ]]; then
    TMDB_AUTH_TOKEN="$TMDB_API_RA_TOKEN"
    TMDB_USE_BEARER=true
  elif [[ -n "$TMDB_API_KEY" ]]; then
    TMDB_AUTH_TOKEN="$TMDB_API_KEY"
  else
    if [[ "$AUTOMATED" != "true" ]]; then
      _log 信息 "未检测到 TMDB API 密钥。是否生成 mo_env 模板？(y/N)"
      read -r answer
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        generate_mo_env_template
        exit 0
      fi
    fi
    _log 错误 "未提供 TMDB 认证信息。"
    exit 1
  fi
}

# 生成 mo_env 配置模板（仅交互式调用）。
generate_mo_env_template() {
  mkdir -p "$PWD/mo_config" 2>/dev/null || {
    _log 错误 "无法创建配置目录 $PWD/mo_config"
    return 1
  }
  # 子 shell 设置 umask 077，确保创建的文件权限即 600
  (umask 077 && printf '%s\n' "$MO_ENV_TEMPLATE" >"$PWD/mo_config/mo_env") || {
    _log 错误 "无法写入配置文件 $PWD/mo_config/mo_env"
    return 1
  }
  # 兜底：确保权限为 600（不静默失败）
  chmod 600 "$PWD/mo_config/mo_env" || {
    _log 错误 "无法设置文件权限为 600：$PWD/mo_config/mo_env"
    return 1
  }
  _log 信息 "模板已创建: $PWD/mo_config/mo_env"
}

# 检查依赖命令是否可用。
check_dependencies() {
  for cmd in curl jq ffprobe; do
    if ! command -v "$cmd" &>/dev/null; then
      _log 错误 "缺少命令 $cmd"
      exit 1
    fi
  done
}

################################################################################
# 特典映射与季偏移
################################################################################

# 初始化特典映射：解析默认路径，若文件不存在则交互创建。
init_special_map() {
  local file="$1"
  # 解析默认路径（优先级：环境变量 > 执行目录 mo_config > 脚本目录 mo_config）
  if [[ -z "$file" ]]; then
    if [[ -f "$PWD/mo_config/mo_special_keymap.json" ]]; then
      file="$PWD/mo_config/mo_special_keymap.json"
    else
      file="$SCRIPT_DIR/mo_config/mo_special_keymap.json"
    fi
    SPECIAL_MAP_FILE="$file"
  fi
  if [[ ! -f "$file" ]]; then
    if [[ "$AUTOMATED" == "true" ]]; then
      _log 警告 "未找到特典映射文件，自动化模式跳过创建: $file"
    else
      _log 信息 "未找到特典映射文件: $file"
      _log 信息 "是否创建默认配置文件？(y/N)"
      read -r answer || true # EOF（非交互）时跳过创建
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        # 子 shell 设置 umask 077，确保创建的文件权限即 600
        (umask 077 && printf '%s\n' "$SPECIAL_KEYMAP_TEMPLATE" | jq . >"$file" 2>/dev/null) || true
        if [[ ! -s "$file" ]]; then
          echo '{}' >"$file"
        fi
        # 兜底：确保权限为 600（不静默失败）
        chmod 600 "$file" 2>/dev/null || _log 警告 "无法设置文件权限为 600: $file"
        _log 信息 "已创建特典映射文件: $file"
      fi
    fi
  fi
  load_special_map "$file"
}

# 初始化跳过目录词表（mo_skip_dirs.json）：解析默认路径，缺失时交互创建或使用内置默认。
# 语义 = 不作为媒体名目录的目录词（特典/附带 + 分类目录）；内容不当作正则（精确匹配）。
init_skip_dirs() {
  local file="$1"
  if [[ -z "$file" ]]; then
    if [[ -f "$PWD/mo_config/mo_skip_dirs.json" ]]; then
      file="$PWD/mo_config/mo_skip_dirs.json"
    else
      file="$SCRIPT_DIR/mo_config/mo_skip_dirs.json"
    fi
    SKIP_DIRS_FILE="$file"
  fi
  if [[ ! -f "$file" ]]; then
    if [[ "$AUTOMATED" == "true" ]]; then
      _log 警告 "未找到跳过目录词表文件，自动化模式使用内置默认: $file"
    else
      _log 信息 "未找到跳过目录词表文件: $file"
      _log 信息 "是否创建默认配置文件？(y/N)"
      read -r answer || true # EOF（非交互）时跳过创建
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        (umask 077 && printf '%s\n' "$SKIP_DIRS_TEMPLATE" | jq . >"$file" 2>/dev/null) || true
        if [[ ! -s "$file" ]]; then
          echo '[]' >"$file"
        fi
        chmod 600 "$file" 2>/dev/null || _log 警告 "无法设置文件权限为 600: $file"
        _log 信息 "已创建跳过目录词表文件: $file"
      fi
    fi
  fi
  SKIP_DIRS=()
  SKIP_DIRS_LOWER=()
  if [[ -f "$file" ]] && jq -e 'type == "array"' "$file" >/dev/null 2>&1; then
    mapfile -t SKIP_DIRS < <(jq -r '.[] | select(. != "")' "$file" 2>/dev/null)
  fi
  if [[ ${#SKIP_DIRS[@]} -eq 0 ]]; then
    mapfile -t SKIP_DIRS < <(echo "$SKIP_DIRS_TEMPLATE" | jq -r '.[]')
  fi
  local d
  for d in "${SKIP_DIRS[@]}"; do
    SKIP_DIRS_LOWER+=("${d,,}")
  done
  _log 调试 "跳过目录词表 ${#SKIP_DIRS[@]} 个"
}

# 初始化特典识别词表（mo_special_words.json）：解析默认路径，缺失时交互创建或使用内置默认。
# 词表语义 = 特典类别词（Menu/CM/PV 等）；匹配对空格不敏感；内容不当作正则。
init_special_words() {
  local file="$1"
  if [[ -z "$file" ]]; then
    if [[ -f "$PWD/mo_config/mo_special_words.json" ]]; then
      file="$PWD/mo_config/mo_special_words.json"
    else
      file="$SCRIPT_DIR/mo_config/mo_special_words.json"
    fi
    SPECIAL_WORDS_FILE="$file"
  fi
  if [[ ! -f "$file" ]]; then
    if [[ "$AUTOMATED" == "true" ]]; then
      _log 警告 "未找到特典词表文件，自动化模式使用内置默认: $file"
    else
      _log 信息 "未找到特典词表文件: $file"
      _log 信息 "是否创建默认配置文件？(y/N)"
      read -r answer || true # EOF（非交互）时跳过创建
      if [[ "$answer" =~ ^[Yy]$ ]]; then
        (umask 077 && printf '%s\n' "$SPECIAL_WORDS_TEMPLATE" | jq . >"$file" 2>/dev/null) || true
        if [[ ! -s "$file" ]]; then
          echo '[]' >"$file"
        fi
        chmod 600 "$file" 2>/dev/null || _log 警告 "无法设置文件权限为 600: $file"
        _log 信息 "已创建特典词表文件: $file"
      fi
    fi
  fi
  # 加载词表（JSON 数组）；缺失/非法/空 → 内置默认
  SPECIAL_WORDS=()
  if [[ -f "$file" ]] && jq -e 'type == "array"' "$file" >/dev/null 2>&1; then
    mapfile -t SPECIAL_WORDS < <(jq -r '.[] | select(. != "")' "$file" 2>/dev/null)
  fi
  if [[ ${#SPECIAL_WORDS[@]} -eq 0 ]]; then
    mapfile -t SPECIAL_WORDS < <(echo "$SPECIAL_WORDS_TEMPLATE" | jq -r '.[]')
  fi
  _log 调试 "特典识别词表 ${#SPECIAL_WORDS[@]} 个"
}

# 加载特典映射（JSON 对象：{"本地关键字符串": 值}）。
# 构建 SPECIAL_MAP（本地字符串 → TMDB 可匹配关键字 JSON 数组，多键→多值）。
# 值可为：① JSON 数组（直接多值，如 ["Menu","菜单","メニュー"]）；
#         ② 字符串（引用另一键的数组，如 "menu01": "menu" 复用 menu 的数组）。
# —— 不同压制组特典命名不同（Menu01/Menu 01/MENU01），多键共享同一组 TMDB 关键字，避免重复定义。
load_special_map() {
  local map_file="$1"
  [[ ! -f "$map_file" ]] && return

  if ! jq -e 'type == "object"' "$map_file" >/dev/null 2>&1; then
    _log 错误 "特典映射文件必须为 JSON 对象格式: $map_file"
    return
  fi

  # 第一遍：读取全部原始值（数组或字符串引用）
  local local_str raw
  RAW_SPECIAL_MAP=()
  while IFS=$'\t' read -r local_str raw; do
    [[ -z "$local_str" ]] && continue
    RAW_SPECIAL_MAP["${local_str,,}"]="$raw"
  done < <(jq -r 'to_entries[] | "\(.key)\t\(.value | @json)"' "$map_file")

  # 第二遍：展开引用（多键→多值），SPECIAL_MAP 值统一为 JSON 数组
  local key
  for key in "${!RAW_SPECIAL_MAP[@]}"; do
    SPECIAL_MAP["$key"]="$(resolve_special_value "$key")"
  done
}

# 解析特典键的最终数组值：值为数组直接返回；值为字符串视为引用另一键（递归展开引用链，防循环）。
# 引用键不存在时把引用串本身当单元素数组。
resolve_special_value() {
  local key="$1" depth="${2:-0}" v ref
  [[ $depth -gt 20 ]] && {
    echo "[]"
    return
  }
  v="${RAW_SPECIAL_MAP[$key]:-}"
  if [[ -n "$v" ]] && echo "$v" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "$v"
  elif [[ -z "$v" ]]; then
    # 键不存在：视为单元素数组
    jq -n --arg v "$key" '[$v]'
  else
    ref="${v#\"}"
    ref="${ref%\"}"
    if [[ -n "${RAW_SPECIAL_MAP[$ref]:-}" ]]; then
      resolve_special_value "$ref" $((depth + 1))
    else
      jq -n --arg v "$ref" '[$v]'
    fi
  fi
}

# 初始化季偏移配置：加载外部 JSON，缺失时用内置默认值生成。
init_season_offset() {
  SEASON_OFFSET_FILE="${SEASON_OFFSET_FILE:-}"
  # 解析默认路径（优先级：环境变量 > 执行目录 mo_config > 脚本目录 mo_config）
  if [[ -z "$SEASON_OFFSET_FILE" ]]; then
    if [[ -f "$PWD/mo_config/season_offset.json" ]]; then
      SEASON_OFFSET_FILE="$PWD/mo_config/season_offset.json"
    else
      SEASON_OFFSET_FILE="$SCRIPT_DIR/mo_config/season_offset.json"
    fi
  fi

  # 内置季偏移默认值（来自 SEASON_OFFSET_TEMPLATE 常量）
  if [[ -n "$SEASON_OFFSET_TEMPLATE" ]]; then
    while IFS=$'\t' read -r k v; do
      [[ -z "$k" ]] && continue
      SEASON_OFFSET_MAP["${k,,}"]="$v"
    done < <(printf '%s\n' "$SEASON_OFFSET_TEMPLATE" | jq -r 'to_entries[] | "\(.key)\t\(.value)"')
  fi

  # 加载外部 JSON 配置覆盖默认值
  if [[ -f "$SEASON_OFFSET_FILE" ]]; then
    if jq -e 'type == "object"' "$SEASON_OFFSET_FILE" >/dev/null 2>&1; then
      while IFS=$'\t' read -r key value; do
        [[ -z "$key" ]] && continue
        SEASON_OFFSET_MAP["${key,,}"]="$value"
      done < <(jq -r 'to_entries[] | "\(.key)\t\(.value)"' "$SEASON_OFFSET_FILE")
    else
      _log 错误 "季偏移配置文件必须为 JSON 对象格式: $SEASON_OFFSET_FILE"
    fi
  fi

  # 生成默认季偏移配置文件（JSON 对象格式）
  if [[ ! -f "$SEASON_OFFSET_FILE" ]]; then
    offset_json="{}"
    for key in "${!SEASON_OFFSET_MAP[@]}"; do
      offset_json=$(printf '%s' "$offset_json" | jq --arg k "$key" --argjson v "${SEASON_OFFSET_MAP[$key]}" '.[$k] = $v')
    done
    printf '%s\n' "$offset_json" | jq . >"$SEASON_OFFSET_FILE" 2>/dev/null || true
  fi
}

################################################################################
# 字符串工具
################################################################################

# 移除文件名非法字符（保留安全的跨平台字符）。
sanitize() {
  echo "${1:-}" | sed 's/[\\/:*?"<>|]/-/g'
}

# 判断文件是否为视频的配套文件（同名、含语言标签等）。
is_companion() {
  local companion="$1" vbase="$2"
  local name_noext="${companion%.*}"
  [[ "$name_noext" == "$vbase" ]] && return 0
  local inner_ext="${name_noext##*.}"
  if [[ "$inner_ext" != "$name_noext" ]]; then
    [[ "$inner_ext" =~ ^[a-zA-Z]{2,3}(-[a-zA-Z]{2,})?$ ]] || return 1
    local possible_base="${name_noext%.*}"
    [[ "$possible_base" == "$vbase" ]] && return 0
  fi
  return 1
}

# 清理文件名中的方括号标记及首尾空白。
clean_name() {
  echo "$1" | sed -E 's/\[[^]]*\]//g' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g'
}

# 移除标题中的季数后缀（如 "S01"、"Season 2"）。
strip_season_suffix() {
  echo "$1" | sed -E 's/[[:space:]]*[0-9]+(st|nd|rd|th)?[[:space:]]*[Ss]eason[[:space:]]*[0-9]*//I; s/[[:space:]]*[Ss][0-9]+//I; s/[[:space:]]+$//; s/^[[:space:]]+//'
}

# 安全格式化整数（两位补零），非数字时返回默认值。
safe_printf_int() {
  local val="$1" default="${2:-00}"
  if [[ "$val" =~ ^[0-9]+$ ]]; then
    printf "%02d" "$((10#$val))"
  else
    printf "%s" "$default"
  fi
}

# 将特典片段（文件中的关键字符串，如 "Menu01"）翻译为 TMDB 字符串（查 keymap，键已归一化为小写）。
# 先精确匹配片段（转小写），再匹配去数字后的核心（如 Menu01 -> menu）；无映射时返回原片段。
translate_fragment() {
  local fragment="$1"
  # 查表键规范化（仅影响查找，不改存储/输出）：
  # 去空白与连字符（"Menu 01"/"PV-01" → "menu01"/"pv01"）+ ASCII 全角转半角
  # （sed y/ 按字符翻译；tr 对多字节 UTF-8 失效）
  local norm
  norm=$(printf '%s' "$fragment" |
    sed -e 'y/０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/' \
      -e 's/[[:space:]-]//g')
  norm="${norm,,}"
  local val core
  val="${SPECIAL_MAP[$norm]:-}"
  if [[ -z "$val" ]]; then
    core=$(printf '%s' "$norm" | sed -E 's/[0-9]+$//')
    val="${SPECIAL_MAP[$core]:-}"
  fi
  if [[ -n "$val" ]]; then
    # 值为 JSON 数组（多语言），取第一个作为翻译结果
    printf '%s' "$(echo "$val" | jq -r 'if type == "array" then .[0] else . end // empty' 2>/dev/null)"
    return
  fi
  printf '%s' "$fragment"
}

################################################################################
# 缓存管理
################################################################################

# 计算缓存文件路径（镜像 TMDB API 路径结构）。
# 参数：endpoint（如 /search/tv、/tv/{id}/season/{n}）与 key（查询参数串）。
# 搜索类用 key 的 md5 哈希作文件名；id 类直接用 id 作文件名。
cache_path() {
  local endpoint="$1" key="$2"
  local hash
  case "$endpoint" in
    /search/*)
      hash=$(cache_key_hash "$key")
      echo "$CACHE_DIR${endpoint}/${hash}.json"
      ;;
    # 注意：id 类路径含语言段（.${TMDB_LANG}）——详情/季数据语言相关，切语言自动 miss 重新拉取
    /tv/*/season/*)
      local rest id season
      rest="${endpoint#/tv/}"
      id="${rest%%/*}"
      season="${rest##*/}"
      echo "$CACHE_DIR/tv/${id}/season/${season}.${TMDB_LANG}.json"
      ;;
    /tv/*)
      echo "$CACHE_DIR/tv/${endpoint#/tv/}.${TMDB_LANG}.json"
      ;;
    /movie/*)
      echo "$CACHE_DIR/movie/${endpoint#/movie/}.${TMDB_LANG}.json"
      ;;
    *)
      echo "$CACHE_DIR/${endpoint#/}.json"
      ;;
  esac
}

# 将调用参数拼为规范 key 串（形如 query=xxx&year=2020&lang=zh-CN）。
cache_key() {
  local key=""
  local a
  for a in "$@"; do
    key="${key}${a}"
  done
  key="${key}&lang=${TMDB_LANG}"
  echo "$key"
}

# 计算 key 的 md5 哈希（搜索缓存文件名用）。
cache_key_hash() {
  printf '%s' "$1" | md5sum | awk '{print $1}'
}

# 判断缓存文件是否过期（按文件 mtime 与 TTL 天数）。
cache_expired() {
  local path="$1" ttl_days="$2"
  local mtime now ttl_sec
  mtime=$(stat -c '%Y' "$path" 2>/dev/null) ||
    mtime=$(date -r "$path" +%s 2>/dev/null) ||
    mtime=$(date +%s)
  now=$(date +%s)
  ttl_sec=$((ttl_days * 86400))
  ((now - mtime > ttl_sec))
}

# 读取缓存。命中且未过期则输出数据到 stdout 并返回 0；否则返回 1。
# 参数：path 缓存文件路径；is_search 是否搜索缓存（1=是，0=否）。
# 搜索缓存为包裹格式（含 empty/data 字段），其余为原始响应或空文件哨兵。
cache_get() {
  local path="$1" is_search="$2"
  local ttl="${CACHE_TTL_DAYS:-30}"
  [[ -f "$path" ]] || return 1
  if cache_expired "$path" "$ttl"; then
    return 1
  fi
  if [[ "$is_search" == "1" ]]; then
    local empty
    empty=$(jq -r '.empty // false' "$path" 2>/dev/null || echo true)
    [[ "$empty" == "true" ]] && return 1
    jq -r '.data // empty' "$path" 2>/dev/null
  else
    [[ -s "$path" ]] || return 1
    cat "$path"
  fi
}

# 判断缓存文件是否为"新鲜空哨兵"（在 CACHE_EMPTY_TTL_DAYS 内）。
# 用于让 tmdb_api 知道上次查询已确认为空结果，TTL 内不再重复请求。
# 返回 0=新鲜空哨兵（免重试）；1=非空哨兵/已过期（允许重试）。
cache_empty_fresh() {
  local path="$1" is_search="$2"
  [[ -f "$path" ]] || return 1
  if cache_expired "$path" "${CACHE_EMPTY_TTL_DAYS:-3}"; then
    return 1
  fi
  if [[ "$is_search" == "1" ]]; then
    [[ "$(jq -r '.empty // false' "$path" 2>/dev/null || echo false)" == "true" ]]
  else
    [[ ! -s "$path" ]]
  fi
}

# 写入缓存（原子写：临时文件 + rename）。
# 搜索缓存写包裹格式，其余直接写原始响应。
# 干运行模式下跳过写入（零持久化副作用）。
cache_put() {
  local path="$1" data="$2" is_search="$3"
  local key="$4"
  [[ "${DRY_RUN:-false}" == "true" ]] && return 0
  local tmp="${path}.tmp.$$"
  mkdir -p "$(dirname "$path")"
  if [[ "$is_search" == "1" ]]; then
    local q y
    q=$(echo "$key" | sed -n 's/.*query=\([^&]*\).*/\1/p')
    y=$(echo "$key" | sed -n 's/.*year=\([^&]*\).*/\1/p')
    jq -n --arg q "$q" --arg y "$y" --arg l "$TMDB_LANG" \
      --argjson t "$(date +%s)" --argjson d "$data" \
      '{query: $q, year: $y, lang: $l, fetched_at: $t,
			  empty: false, data: $d}' >"$tmp" 2>/dev/null || return 1
  else
    printf '%s\n' "$data" >"$tmp" 2>/dev/null || return 1
  fi
  mv "$tmp" "$path" 2>/dev/null || return 1
}

# 写入空结果哨兵（404/无结果），避免重复请求。
# 搜索缓存写 empty 包裹；其余写 0 字节文件。
# 干运行模式下跳过写入（零持久化副作用）。
cache_put_empty() {
  local path="$1" is_search="$2"
  local key="$3"
  [[ "${DRY_RUN:-false}" == "true" ]] && return 0
  local tmp="${path}.tmp.$$"
  mkdir -p "$(dirname "$path")"
  if [[ "$is_search" == "1" ]]; then
    local q y
    q=$(echo "$key" | sed -n 's/.*query=\([^&]*\).*/\1/p')
    y=$(echo "$key" | sed -n 's/.*year=\([^&]*\).*/\1/p')
    jq -n --arg q "$q" --arg y "$y" --arg l "$TMDB_LANG" \
      --argjson t "$(date +%s)" \
      '{query: $q, year: $y, lang: $l, fetched_at: $t,
			  empty: true, data: null}' >"$tmp" 2>/dev/null || return 1
  else
    : >"$tmp" 2>/dev/null || return 1
  fi
  mv "$tmp" "$path" 2>/dev/null || return 1
}

# 清空缓存（--refresh-cache）：无参数清全部，有参数清指定子目录。
# 干运行模式下跳过清理（零持久化副作用），并提示其不生效。
cache_clear() {
  if [[ "${DRY_RUN:-false}" == "true" ]]; then
    _log 警告 "干运行模式下跳过缓存清理"
    return 0
  fi
  if [[ -n "${1:-}" ]]; then
    rm -rf "$CACHE_DIR/$1" 2>/dev/null || true
  else
    rm -rf "$CACHE_DIR" 2>/dev/null || true
  fi
}

# 列出缓存条目（--list-cache 一键反查）。可选 filter 过滤参数串。
# 输出首行标题：哈希 / 类型 / 路径 / 参数 / 获取时间。
cache_list() {
  local filter="$1"
  printf '哈希\t类型\t路径\t参数\t获取时间\n'
  local f path type params ts hash
  while IFS= read -r -d '' f; do
    path="${f#"$CACHE_DIR"/}"
    hash=$(basename "$f" .json)
    case "$path" in
      search/*)
        type="Search"
        params=$(jq -r '"query=" + (.query // "") + "&lang=" + (.lang // "")' \
          "$f" 2>/dev/null || echo "?")
        ts=$(jq -r '.fetched_at // 0' "$f" 2>/dev/null || echo "?")
        ;;
      tv/*/season/*)
        type="TV"
        params="season=$(basename "$f" .json)"
        params="season=${params%%.*}" # 去语言后缀（0.zh-CN → 0）
        ts=$(date -r "$f" +%s 2>/dev/null || echo "?")
        ;;
      tv/*)
        type="TV"
        params="id=$(basename "$f" .json)"
        params="id=${params%%.*}" # 去语言后缀
        ts=$(date -r "$f" +%s 2>/dev/null || echo "?")
        ;;
      movie/*)
        type="Movie"
        params="id=$(basename "$f" .json)"
        params="id=${params%%.*}" # 去语言后缀
        ts=$(date -r "$f" +%s 2>/dev/null || echo "?")
        ;;
      *)
        continue
        ;;
    esac
    [[ -n "$filter" && "$params" != *"$filter"* ]] && continue
    printf '%s\t%s\t%s\t%s\t%s\n' "$hash" "$type" "$path" "$params" "$ts"
  done < <(find "$CACHE_DIR" -type f -name '*.json' -print0 2>/dev/null)
}

# 基于源目录重新获取并更新缓存（--update-cache）。
# 扫描源目录解析出唯一查询，删除对应旧缓存后强制重新请求并覆盖写；
# 源目录中不存在的查询缓存保留不动。
update_cache() {
  _log 信息 "开始更新缓存（基于源目录）..."
  local -A queries=()
  local file ext ext_lower type title year info
  # 扫描源目录，收集唯一查询
  while IFS= read -r -d '' file; do
    ext="${file##*.}"
    ext_lower="${ext,,}"
    [[ " ${VIDEO_EXTS[*]} " =~ [[:space:]]${ext_lower}[[:space:]] ]] || continue
    info=$(parse_media_filename "$file")
    IFS='|' read -r type title year _ _ _ <<<"$info"
    [[ "$type" == "movie" || "$type" == "tv" ]] || continue
    queries["${title}||${type}||${year}"]=1
  done < <(find "$SOURCE_DIR" -type f -print0)

  _log 信息 "共 ${#queries[@]} 个唯一查询待更新"
  local q t ty y endpoint key path result id
  for q in "${!queries[@]}"; do
    t="${q%%||*}"
    ty="${q#*||}"
    y="${ty##*||}"
    ty="${ty%%||*}"
    endpoint="/search/movie"
    [[ "$ty" == "tv" ]] && endpoint="/search/tv"
    key=$(cache_key "query=${t}" ${y:+"year=${y}"})
    path=$(cache_path "$endpoint" "$key")
    rm -f "$path"
    _log 信息 "更新搜索: $t ($y)"
    if result=$(tmdb_api "$endpoint" "query=${t}" ${y:+"year=${y}"}); then
      id=$(echo "$result" | jq -r '.results[0].id // empty')
      if [[ -n "$id" ]]; then
        # 更新详情
        rm -f "$(cache_path "/${ty}/${id}" "$key")"
        _log 信息 "更新详情: ${ty}/${id}"
        tmdb_api "/${ty}/${id}" >/dev/null 2>&1 || true
        # 更新剧集季数据
        if [[ "$ty" == "tv" ]]; then
          local details n s
          details=$(tmdb_api "/tv/${id}" 2>/dev/null || echo "")
          n=$(echo "$details" | jq -r '.number_of_seasons // 0' 2>/dev/null || echo 0)
          for ((s = 0; s <= n; s++)); do
            rm -f "$(cache_path "/tv/${id}/season/${s}" "$key")"
            tmdb_api "/tv/${id}/season/${s}" >/dev/null 2>&1 || true
          done
        fi
      fi
    fi
  done
  _log 成功 "缓存更新完成"
}
################################################################################
# TMDB API
################################################################################

# 调用 TMDB API 并缓存结果。端点形如 "/search/movie"，额外参数以 key=value 传入。
# 先查缓存（命中且未过期直接返回），未命中才请求并写缓存。
# 返回码约定：0=成功（含空结果的有效响应）；1=新鲜空哨兵跳过请求；
# 2=请求失败（curl 错误/HTTP 非 2xx，递增重试耗尽）——不写空哨兵（失败≠无结果）。
# 返回原始 JSON 响应到 stdout。
tmdb_api() {
  local endpoint="$1"
  shift
  local key path is_search
  key=$(cache_key "$@")
  path=$(cache_path "$endpoint" "$key")
  is_search=0
  [[ "$endpoint" == /search/* ]] && is_search=1

  # --update-cache 修饰（整理时强制重取）：跳过缓存读与空哨兵，直接请求并覆盖缓存
  local cached
  if [[ "${UPDATE_CACHE:-false}" != "true" ]] && cached=$(cache_get "$path" "$is_search"); then
    echo "$cached"
    return 0
  fi
  # 新鲜空哨兵：上次已确认空结果，CACHE_EMPTY_TTL_DAYS 内跳过请求（避免重复请求无效数据）
  if [[ "${UPDATE_CACHE:-false}" != "true" ]] && cache_empty_fresh "$path" "$is_search"; then
    [[ "$DEBUG_LEVEL" -ge 2 ]] && _log 调试 "缓存为空哨兵（新鲜），跳过请求: ${endpoint}"
    return 1
  fi

  # 并发去重（识别池多 worker 可能同时 miss 同一查询）：
  # flock 跨进程互斥（内核锁，进程退出自动释放，无残留）→ 锁内双检缓存。
  # 锁文件放 /tmp（复用不删除；不污染缓存目录，干运行零持久化副作用）。
  local lockfile="/tmp/mo_lock_$(cache_key_hash "$path")"
  local locked=false
  if [[ "${UPDATE_CACHE:-false}" != "true" ]]; then
    exec 9>"$lockfile"
    flock 9
    locked=true
    # 双检：等待者可能在锁期间已写入缓存
    if cached=$(cache_get "$path" "$is_search"); then
      exec 9>&-
      echo "$cached"
      return 0
    fi
    if cache_empty_fresh "$path" "$is_search"; then
      exec 9>&-
      return 1
    fi
  fi

  local curl_args=(
    "--get" "-s"
    "--connect-timeout" "${TMDB_CURL_CONNECT_TIMEOUT}"
    "--max-time" "${TMDB_CURL_MAX_TIME}" "-fS"
  )
  if $TMDB_USE_BEARER; then
    curl_args+=("--header" "Authorization: Bearer ${TMDB_AUTH_TOKEN}")
  fi
  curl_args+=("--data-urlencode" "language=${TMDB_LANG}")
  if ! $TMDB_USE_BEARER; then
    curl_args+=("--data-urlencode" "api_key=${TMDB_AUTH_TOKEN}")
  fi
  local a
  for a in "$@"; do
    curl_args+=("--data-urlencode" "$a")
  done

  local full_url="${TMDB_API_BASE_URL}${endpoint}"
  [[ "$DEBUG_LEVEL" -ge 2 ]] && _log 调试 "TMDB 请求: ${full_url}?..."

  # 递增重试（2^n 封顶 16s）：curl 的 --retry-delay 为固定延迟，这里手写循环
  local result=""
  local attempt=0 delay=1
  while true; do
    if result=$(curl "${curl_args[@]}" "$full_url" 2>&1); then
      break
    fi
    attempt=$((attempt + 1))
    if ((attempt > TMDB_CURL_RETRY)); then
      _log 错误 "TMDB 请求失败（重试 ${TMDB_CURL_RETRY} 次后）: ${full_url}  错误: ${result}"
      return 2
    fi
    _log 警告 "TMDB 请求失败，${delay}s 后重试（${attempt}/${TMDB_CURL_RETRY}）: ${full_url}"
    sleep "$delay"
    ((delay *= 2))
    [[ $delay -gt 16 ]] && delay=16
  done
  # 搜索空结果 → 写 3 天短 TTL 哨兵（查无此片；新片出现后自动重试）；否则正常写缓存
  if [[ "$is_search" == "1" ]] && ! echo "$result" | jq -e '.results | length > 0' >/dev/null 2>&1; then
    cache_put_empty "$path" "$is_search" "$key"
  else
    cache_put "$path" "$result" "$is_search" "$key"
  fi
  if $locked; then
    exec 9>&-
  fi
  echo "$result"
}

################################################################################
# 媒体文件名解析
################################################################################

# 从文件路径向上查找剧名目录（跳过特典/分类/CD 子目录）。
# 用于特典文件名不含剧名时（如 SPs/CM01.mkv）从父目录链推断所属剧集。
find_show_dir_from_path() {
  local file="$1"
  local dir parent cleaned_dir
  dir=$(dirname "$file")
  while [[ -n "$dir" && "$dir" != "/" && "$dir" != "." ]]; do
    parent=$(basename "$dir")
    # 跳过特典目录与常见分类目录
    if [[ " ${SKIP_DIRS_LOWER[*]} " == *" ${parent,,} "* ]]; then
      dir=$(dirname "$dir")
      continue
    fi
    # 跳过以 [数字 开头的 CD 子目录（如 [200226]...）
    if echo "$parent" | grep -qE '^\[[0-9]'; then
      dir=$(dirname "$dir")
      continue
    fi
    cleaned_dir=$(clean_name "$parent")
    if [[ -n "$cleaned_dir" ]]; then
      echo "$parent"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

# 从文件路径向上查找媒体（剧名/电影名）目录的完整路径。
# 跳过特典目录、分类目录、CD 编号目录等；返回首个"媒体名"目录。
# 用于：①特典文件名不含媒体名时推断归属；②统计媒体目录内正片数量以区分电影/剧集。
find_show_path_from_file() {
  local file="$1" dir parent cleaned
  dir=$(dirname "$file")
  while [[ -n "$dir" && "$dir" != "/" && "$dir" != "." ]]; do
    parent=$(basename "$dir")
    # 跳过特典目录与常见分类目录
    if [[ " ${SKIP_DIRS_LOWER[*]} " == *" ${parent,,} "* ]]; then
      dir=$(dirname "$dir")
      continue
    fi
    # 跳过以 [数字 开头的 CD 子目录（如 [200226]...）
    if echo "$parent" | grep -qE '^\[[0-9]'; then
      dir=$(dirname "$dir")
      continue
    fi
    cleaned=$(clean_name "$parent")
    if [[ -n "$cleaned" ]]; then
      echo "$dir"
      return 0
    fi
    dir=$(dirname "$dir")
  done
  return 1
}

# 统计媒体目录内"正片"（非特典/附带）视频文件数量。
# 用于文件名无明确季集/年份特征时区分电影/剧集（不依赖下载目录，合集种子可能混合）：
# 仅 1 个正片 → 电影（如合集里的剧场版）；多个正片 → 剧集（多集动画）。
# 注意：mka 是纯音频容器（电影音轨），不算正片视频。
# 结果按 show 目录缓存，避免重复扫描。
count_main_videos() {
  local dir="$1" f count=0
  if [[ -n "${MAIN_COUNT_CACHE[$dir]:-}" ]]; then
    echo "${MAIN_COUNT_CACHE[$dir]}"
    return
  fi
  # 用 VIDEO_EXTS 动态生成 find -name 列表（与配置一致，用户加扩展即生效）
  local -a name_args=()
  local ext
  for ext in "${VIDEO_EXTS[@]}"; do
    [[ -z "$ext" ]] && continue
    name_args+=(-name "*.${ext}")
  done
  local -a find_args=(-maxdepth 2 -type f)
  if [[ ${#name_args[@]} -gt 0 ]]; then
    # name_args 是 -name/pattern 交替对——按对追加，-o 插在配对之间
    local -a joined=()
    local i
    for ((i = 0; i < ${#name_args[@]}; i += 2)); do
      joined+=("${name_args[$i]}" "${name_args[$((i + 1))]}")
      ((i + 2 < ${#name_args[@]})) && joined+=(-o)
    done
    find_args+=("(" "${joined[@]}" ")")
  fi
  while IFS= read -r -d '' f; do
    # 跳过特典/附带子目录（SPs/CDs/Scans/Fonts 等，词表见 SKIP_DIRS）
    local skip=false seg
    for seg in ${f//\// }; do
      if [[ " ${SKIP_DIRS_LOWER[*]} " == *" ${seg,,} "* ]]; then
        skip=true
        break
      fi
    done
    $skip && continue
    count=$((count + 1))
  done < <(find "$dir" "${find_args[@]}" -print0 2>/dev/null)
  MAIN_COUNT_CACHE["$dir"]="$count"
  echo "$count"
}

# 特典识别（Season 00）：文件名含特典标记（可带可不带数字），或父目录为特典目录。
# 如 "2nd Season [Menu01]"、" [NCOP]"、"CM01.mkv"（在 SPs 目录）均识别为特典。
# 输出（stdout 协议，空=非特典）：
#   skip|movie_extra|<year>|<season>|<episode>|<episode_end>|<fragment>  电影特典（TMDB 不收录，跳过）
#   tv|<title>|<year>|0|<ep_num>|<fragment>                             剧集特典（归 Season 00）
detect_special() {
  local file="$1" base="$2" cleaned="$3" year="$4" season="$5" episode="$6" episode_end="$7"
  # 词表来自 mo_special_words.json（SPECIAL_WORDS，语义=特典类别词）；
  # 空格归一化后子串匹配（纯字符串匹配，词表内容不当作正则；"nc op" == "ncop"）。
  local is_special=false
  local frag=""
  local tag=""
  local i
  if [[ ${#SPECIAL_WORDS[@]} -gt 0 ]] && echo "$base" | grep -qE '\[[^]]*\]'; then
    local t_line w_norm t_norm
    while IFS= read -r t_line; do
      [[ -z "$t_line" ]] && continue
      t_norm="${t_line//[[:space:]]/}"
      t_norm="${t_norm,,}"
      for i in "${!SPECIAL_WORDS[@]}"; do
        w_norm="${SPECIAL_WORDS[$i]//[[:space:]]/}"
        w_norm="${w_norm,,}"
        [[ -z "$w_norm" ]] && continue
        if [[ "$t_norm" == *"$w_norm"* ]]; then
          is_special=true
          frag="$w_norm"
          tag="[$t_line]"
          break 2
        fi
      done
    done < <(echo "$base" | grep -oE '\[[^]]*\]' | tr -d '[]')
  fi
  # 父目录为特典目录（SPs/Specials/CDs/Bonus/Extras 等）
  if ! $is_special; then
    local parent_dir
    parent_dir=$(basename "$(dirname "$file")")
    if echo "$parent_dir" | grep -qiE '^(sp|sps|special|specials|cd|cds|bonus|bonuses|extra|extras|特典|特番|花絮)$'; then
      is_special=true
    fi
  fi
  if ! $is_special; then
    return 0
  fi

  local ep_num sp_frag stripped
  # 电影/剧集特典归属（不依赖下载目录，合集种子可能混合电影与剧集）：
  # 媒体目录仅 1 个正片 → 电影特典（TMDB 不收录，跳过不整理）；
  # 多个正片 → 剧集特典（归 Season 00）。
  local show_path main_count
  show_path=$(find_show_path_from_file "$file")
  if [[ -n "$show_path" ]]; then
    main_count=$(count_main_videos "$show_path")
    if ((main_count == 1)); then
      echo "skip|movie_extra|${year}|${season}|${episode}|${episode_end}|"
      return 0
    fi
  fi
  # 特典编号与片段：
  # - 文件名标记匹配到特典词时（frag 非空），用 frag+编号（如 Preview02）
  # - 仅父目录判断（SPs 等）时，从方括号标记中挑选特典片段（跳过压制组/编码/画质
  #   格式标记），避免用完整文件名（会导致 S00 前缀超长且后续 translate 误替换）
  if [[ -n "$frag" ]]; then
    ep_num=$(echo "$tag" | grep -oE '[0-9]+' | head -1)
    sp_frag="${frag}${ep_num:-}"
  else
    local pick="" tag_line
    while IFS= read -r tag_line; do
      [[ -z "$tag_line" ]] && continue
      if ! echo "$tag_line" | grep -qiE \
        'vcb|studio|team|ma10p|hi10p|x26[45]|flac|aac|opus|ac3|dts|1080p|720p|480p|2160p'; then
        pick="$tag_line"
        break
      fi
    done < <(echo "$base" | grep -oE '\[[^]]*\]' | tr -d '[]')
    if [[ -n "$pick" ]]; then
      sp_frag="$pick"
    elif [[ -n "$cleaned" ]]; then
      # 无方括号特典标记（如裸特典 CM01.mkv）：用 clean_name 后的文件名
      sp_frag="$cleaned"
    else
      sp_frag="SP"
    fi
    ep_num=$(echo "$sp_frag" | grep -oE '[0-9]+' | head -1)
  fi
  local title
  title=$(echo "$cleaned" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  # 若标题仅由特典标记构成（无剧名），从父目录链向上查找剧名目录
  stripped=""
  if [[ -n "$frag" ]]; then
    stripped=$(echo "$title" | sed -E "s/${frag}[0-9]*//Ig" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  fi
  if [[ -z "$stripped" ]]; then
    title=$(find_show_dir_from_path "$file")
    [[ -n "$title" ]] && title=$(clean_name "$title")
    [[ -z "$title" ]] && title="$cleaned"
  fi
  echo "tv|${title}|${year}|0|${ep_num:-1}|${sp_frag}"
}

# 解析媒体文件名，输出：type|title|year|season|episode|special_fragment
# type：movie（电影正片）/ tv（剧集，含特典 Season 00）/ skip（电影特典，跳过不整理）/ unknown（识别不出，交 AI）
parse_media_filename() {
  local file="$1"
  local filename base ext cleaned
  filename=$(basename "$file")
  base="${filename%.*}"
  ext="${filename##*.}"
  cleaned=$(clean_name "$base")

  local type="unknown" title="" year="" season="" episode="" episode_end="" special_fragment=""
  # 输出契约：type|title|year|season|episode|episode_end|special_fragment（episode_end 空=单集）

  # (YYYY) 年份提取：任意位置（Title (2020) [1080p]、Show (2020) S01E01、Movie (2020)）。
  # 提取后从 base 移除并重新 clean；TV 规则命中时年份进 year 字段，否则判定为 movie。
  if [[ "$base" =~ \(([0-9]{4})\) ]]; then
    year="${BASH_REMATCH[1]}"
    base="${base/\(${year}\)/}"
    cleaned=$(clean_name "$base")
  fi

  # 电视剧格式：S##E##（季/集号 1-2 位均可；支持多集区间 S01E01-E02 及扩展 S01E01-E02E03）
  if [[ "$cleaned" =~ (.*)[\ ._-]*[Ss]([0-9]{1,2})[Ee]([0-9]{1,2}) ]]; then
    title="${BASH_REMATCH[1]}"
    season="${BASH_REMATCH[2]}"
    episode="${BASH_REMATCH[3]}"
    # 多集区间：匹配点之后的 -E## / E## 段（可连续扩展）
    local range_tail="${cleaned#*${BASH_REMATCH[0]}}"
    if [[ "$range_tail" =~ ^[\ ._-]*[Ee]([0-9]{1,2}) ]]; then
      episode_end="${BASH_REMATCH[1]}"
      local tail2="${range_tail#*${BASH_REMATCH[0]}}"
      while [[ "$tail2" =~ ^[\ ._-]*[Ee]([0-9]{1,2}) ]]; do
        episode_end="${BASH_REMATCH[1]}"
        tail2="${tail2#*${BASH_REMATCH[0]}}"
      done
    fi
    title=$(strip_season_suffix "$title")
    type="tv"
    echo "$type|$title|$year|$season|$episode|${episode_end:-}|$special_fragment"
    return
  fi

  # 电视剧格式：#x##（季/集号 1-2 位均可）
  if [[ "$cleaned" =~ (.*)[\ ._-]*([0-9]{1,2})[xX]([0-9]{1,2}) ]]; then
    title="${BASH_REMATCH[1]}"
    season="${BASH_REMATCH[2]}"
    episode="${BASH_REMATCH[3]}"
    title=$(strip_season_suffix "$title")
    type="tv"
    echo "$type|$title|$year|$season|$episode|${episode_end:-}|$special_fragment"
    return
  fi

  # 特典识别（Season 00）：文件名含特典标记（可带可不带数字），或父目录为特典目录。
  # 如 "2nd Season [Menu01]"、" [NCOP]"、"CM01.mkv"（在 SPs 目录）均识别为特典。
  local special_result
  special_result=$(detect_special "$file" "$base" "$cleaned" "$year" "$season" "$episode" "${episode_end:-}")
  if [[ -n "$special_result" ]]; then
    echo "$special_result"
    return
  fi

  # 季份格式
  if echo "$cleaned" | grep -qiE '([0-9]+)(st|nd|rd|th)?[[:space:]]*[Ss]eason'; then
    season=$(echo "$cleaned" | grep -oiE '([0-9]+)(st|nd|rd|th)?[[:space:]]*[Ss]eason' | sed -E 's/[^0-9]//g')
    title=$(echo "$cleaned" | sed -E 's/[[:space:]]*[0-9]+(st|nd|rd|th)?[[:space:]]*[Ss]eason[[:space:]]*[0-9]*//I' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
    if [[ "$base" =~ \[([0-9]+)\] ]]; then
      episode="${BASH_REMATCH[1]}"
    fi
    type="tv"
    echo "$type|$title|$year|$season|${episode:-0}|$special_fragment"
    return
  fi

  # 方括号格式 [#]
  if [[ "$base" =~ \[([0-9]+)\] ]]; then
    local num="${BASH_REMATCH[1]}"
    if ! [[ "$num" =~ ^(1080|720|480|2160|4320)$ ]]; then
      episode="$num"
      title=$(echo "$cleaned" | sed -E 's/\[[0-9]+\]//g')
      type="tv"
      echo "$type|$title|$year|${season:-1}|$episode|$special_fragment"
      return
    fi
  fi

  # 电影判定：无任何 TV/特典特征且年份存在（(YYYY) 已提取）
  if [[ -n "$year" ]]; then
    title=$(echo "$cleaned" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
    type="movie"
    echo "$type|$title|$year|$season|$episode|${episode_end:-}|$special_fragment"
    return
  fi

  # 文件名无明确季集/年份特征（如压制组风格 [Group] Title [1080p]）：
  # 不依赖下载目录（合集种子可能把剧场版电影放在剧集目录下），
  # 根据媒体目录内正片数量判断：仅 1 个正片 → 电影；多个正片 → 剧集。
  # 源根直属散放文件（show_path == SOURCE_DIR）不统计（共享目录误判风险）→ 交 AI。
  local show_path main_count
  show_path=$(find_show_path_from_file "$file")
  if [[ -n "$show_path" ]] && [[ "$show_path" != "$SOURCE_DIR" ]]; then
    main_count=$(count_main_videos "$show_path")
    if ((main_count == 1)); then
      title="$cleaned"
      type="movie"
      echo "$type|$title|$year|$season|$episode|${episode_end:-}|$special_fragment"
      return
    elif ((main_count >= 2)); then
      title="$cleaned"
      type="tv"
      season="${season:-1}"
      episode="${episode:-0}"
      echo "$type|$title|$year|$season|$episode|${episode_end:-}|$special_fragment"
      return
    fi
  fi

  # 无法判断 → unknown 交 AI
  type="unknown"
  title="$cleaned"
  echo "$type|$title|$year|$season|$episode|$special_fragment"
}

################################################################################
# 条目登记（register 层）与识别池
#
# 一切条目写入收拢于 register_*：原子完成"目的映射 + 结局账本 + 计数器"，
# 结构上不可能出现只写一半的不一致。识别池并发运行时，子进程通过 emit 输出
# 协议行（key\tTYPE\tpayload）到 POOL_EMIT_FILE，父进程合并时调用 register_*。
# 协议行类型：
#   DEST <subdir|filename>           → register_identified
#   FALLBACK <subdir|filename>       → register_fallback
#   PENDING <ai_data>                → register_pending（待 AI 搜索纠正）
#   ARTIST_PENDING <artists|album>   → register_pending_artist（音频多艺术家待 AI 判定）
#   SPECIAL_PENDING <show_id|frag|show|names> → 特典映射待学习
#   SKIP <reason>                    → register_skip（skip_type/skip_unidentified）
#   REQ_FAILED                       → register_request_failed
################################################################################

# 登记识别成功条目（可链接）。
register_identified() {
  local key="$1" subdir="$2" filename="$3"
  MEDIA_DESTINATION_MAP["$key"]="${subdir}|${filename}"
  MEDIA_OUTCOME_MAP["$key"]="identified"
}

# 登记回退命名条目（AI 尽力后仍失败；降级成功，可链接）。
register_fallback() {
  local key="$1" subdir="$2" filename="$3"
  MEDIA_DESTINATION_MAP["$key"]="${subdir}|${filename}"
  MEDIA_OUTCOME_MAP["$key"]="fallback"
}

# 登记待 AI 搜索纠正条目（不进入目的映射）。
register_pending() {
  local key="$1" ai_data="$2"
  PENDING_AI_SEARCH["$key"]="$ai_data"
  PENDING_SEARCH_COUNT=$((PENDING_SEARCH_COUNT + 1))
  MEDIA_OUTCOME_MAP["$key"]="pending_ai"
}

# 登记待 AI 判定艺术家的音频条目（不进入目的映射）。
register_pending_artist() {
  local key="$1" artists_album="$2"
  PENDING_AI_ARTIST["$key"]="$artists_album"
  PENDING_ARTIST_COUNT=$((PENDING_ARTIST_COUNT + 1))
  MEDIA_OUTCOME_MAP["$key"]="pending_ai"
}

# 登记跳过条目（type=skip_type/skip_unidentified；不进入目的映射）。
register_skip() {
  local key="$1" reason="$2"
  MEDIA_OUTCOME_MAP["$key"]="$reason"
}

# 登记请求失败条目（重试耗尽仍失败；不进入目的映射）。
register_request_failed() {
  local key="$1"
  MEDIA_OUTCOME_MAP["$key"]="request_failed"
}

# 登记待 AI 匹配甄别条目（搜索有结果但需甄别；不进入目的映射）。
# 同 key 重复登记（如纠正词重搜再次需甄别）不重复计数。
register_pending_match() {
  local key="$1" payload="$2"
  if [[ -z "${PENDING_AI_MATCH[$key]:-}" ]]; then
    PENDING_MATCH_COUNT=$((PENDING_MATCH_COUNT + 1))
  fi
  PENDING_AI_MATCH["$key"]="$payload"
  MEDIA_OUTCOME_MAP["$key"]="pending_ai"
}

# 目录链：文件父目录相对源根的路径，最多保留靠近文件的 3 层（剧名通常靠近文件）。
# 用于 AI 输入（directory 字段）与 PENDING_AI_SEARCH 存储。
dir_chain() {
  local file="$1" rel
  rel=$(dirname "$file")
  rel="${rel#"$SOURCE_DIR"/}"
  # 不在源目录下（或就是源根）→ 用父目录名
  if [[ "$rel" == "$(dirname "$file")" ]]; then
    rel=$(basename "$rel")
  fi
  local parts=() out="" p
  IFS='/' read -ra parts <<<"$rel"
  if ((${#parts[@]} > 3)); then
    parts=("${parts[@]:${#parts[@]}-3}")
  fi
  for p in "${parts[@]}"; do
    out="${out:+$out/}$p"
  done
  echo "$out"
}

# 合并协议行文件（register_* 登记）。返回前记录 MERGE_PROCESSED/FAILED/STREAK 供阈值检查。
# 用于：识别池合并（pool_run）与父进程 identify 调用（命令替换会丢 emit 副作用，需经临时文件回传）。
merge_emit_lines() {
  local emit_file="$1"
  MERGE_PROCESSED=0
  MERGE_FAILED=0
  MERGE_STREAK=0
  local line key type payload
  while IFS=$'\t' read -r key type payload; do
    [[ -z "$key" ]] && continue
    MERGE_PROCESSED=$((MERGE_PROCESSED + 1))
    case "$type" in
      DEST)
        local subdir filename
        IFS='|' read -r subdir filename <<<"$payload"
        register_identified "$key" "$subdir" "$filename"
        ;;
      FALLBACK)
        local subdir filename
        IFS='|' read -r subdir filename <<<"$payload"
        register_fallback "$key" "$subdir" "$filename"
        ;;
      PENDING)
        register_pending "$key" "$payload"
        ;;
      ARTIST_PENDING)
        register_pending_artist "$key" "$payload"
        ;;
      SPECIAL_PENDING)
        local show_id fragment show_title season0_names
        IFS='|' read -r show_id fragment show_title season0_names <<<"$payload"
        PENDING_AI_SPECIAL["${show_id}|${fragment}"]="${show_title}|${season0_names}"
        PENDING_SPECIAL_COUNT=$((PENDING_SPECIAL_COUNT + 1))
        ;;
      SKIP)
        register_skip "$key" "$payload"
        ;;
      REQ_FAILED)
        register_request_failed "$key"
        MERGE_FAILED=$((MERGE_FAILED + 1))
        MERGE_STREAK=$((MERGE_STREAK + 1))
        ;;
      MATCH)
        register_pending_match "$key" "$payload"
        ;;
      *)
        MERGE_STREAK=0
        ;;
    esac
  done < <(cat "$emit_file")
}

# 协议输出：worker 模式写入 POOL_EMIT_FILE；父进程模式（无池）直接登记。
emit() {
  local key="${1:-}" type="${2:-}" payload="${3:-}"
  if [[ -n "${POOL_EMIT_FILE:-}" ]]; then
    printf '%s\t%s\t%s\n' "$key" "$type" "$payload" >>"$POOL_EMIT_FILE"
    return 0
  fi
  case "$type" in
    SPECIAL_PENDING)
      local show_id fragment show_title season0_names
      IFS='|' read -r show_id fragment show_title season0_names <<<"$payload"
      PENDING_AI_SPECIAL["${show_id}|${fragment}"]="${show_title}|${season0_names}"
      PENDING_SPECIAL_COUNT=$((PENDING_SPECIAL_COUNT + 1))
      ;;
    MATCH)
      register_pending_match "$key" "$payload"
      ;;
  esac
}

# 识别池：对文件列表并发执行 process_one_file，结果行经 POOL_EMIT_FILE 收集后由父进程合并。
# 并发控制：满池时等待最老的 job（bash 4.0 兼容，不用 wait -n）。
pool_run() {
  local pool_dir
  pool_dir=$(mktemp -d)
  export POOL_EMIT_FILE="$pool_dir/emit"
  : >"$POOL_EMIT_FILE"

  local -a pids=()
  local f workers="${MEDIA_WORKERS:-4}"
  for f in "$@"; do
    # worker 协议只走 POOL_EMIT_FILE，stdout 丢弃（防止识别函数 echo 泄漏到终端）
    (process_one_file "$f" >/dev/null) &
    pids+=("$!")
    if ((${#pids[@]} >= workers)); then
      wait "${pids[0]}" || true
      pids=("${pids[@]:1}")
    fi
  done
  for p in "${pids[@]}"; do
    wait "$p" || true
  done

  # 合并协议行（register_* 登记 + 请求失败统计）
  merge_emit_lines "$POOL_EMIT_FILE"

  # 请求失败阈值（仅初始识别池启用）：连续 ≥5 次或失败率 ≥50% → 终止，防止整库跑空
  if [[ "${POOL_THRESHOLD_CHECK:-false}" == "true" ]]; then
    local rate=0
    ((MERGE_PROCESSED > 0)) && rate=$((MERGE_FAILED * 100 / MERGE_PROCESSED))
    if ((MERGE_STREAK >= 5 || (MERGE_PROCESSED >= 10 && rate >= 50))); then
      _log 错误 "TMDB 请求失败过多（连续 ${MERGE_STREAK} 次 / 失败率 ${rate}%），终止运行——请检查网络或 TMDB 密钥"
      exit 1
    fi
  fi

  unset POOL_EMIT_FILE
  rm -rf "$pool_dir"
}

################################################################################
# 媒体识别
################################################################################

# 识别电影。成功时 echo "子目录|文件名" 到 stdout，失败时 echo 空并记录 AI 待处理。
# 由已知 movie id 构建目的命名（detail 缓存优先，fallback 用搜索结果的标题/年份）。
# 识别与 AI 匹配消费共用——命名格式化是脚本的确定性职责，AI 只做判断。
build_movie_dest() {
  local movie_id="$1" ext="$2" fb_title="$3" fb_year="$4"
  local mtitle="" myear=""
  local detail
  if detail=$(tmdb_api "/movie/${movie_id}"); then
    mtitle=$(echo "$detail" | jq -r '.title // empty')
    local rdate
    rdate=$(echo "$detail" | jq -r '.release_date // empty')
    [[ -n "$rdate" ]] && myear="${rdate:0:4}"
  fi
  [[ -z "$mtitle" ]] && mtitle="$fb_title"
  [[ -z "$myear" ]] && myear="$fb_year"
  [[ -z "$mtitle" ]] && {
    _log 错误 "电影详情缺失: /movie/${movie_id}"
    return 1
  }
  mtitle=$(sanitize "$mtitle")
  # 年份可省略（Jellyfin 规范）：无年份时不带括号段
  local year_tag=""
  [[ -n "$myear" ]] && year_tag=" (${myear})"
  _log 匹配 "电影匹配: $mtitle${year_tag}"
  _log 信息 "目标: ${FOLDER_MOVIES}/${mtitle}${year_tag}/${mtitle}${year_tag}.${ext}"
  sleep "$TMDB_DELAY"
  echo "${FOLDER_MOVIES}/${mtitle}${year_tag}|${mtitle}${year_tag}.${ext}"
  return 0
}

identify_movie() {
  local base="$1" ext="$2" file="$3" title="$4" year="$5"
  _log 搜索 "搜索电影: $title (年份: ${year:-无})"

  # 返回码约定：0=识别成功（stdout=子目录|文件名）；1=查询无结果；2=请求失败；
  # 3=需甄别（emit MATCH，交 AI 匹配）——待定登记由调用方负责。
  # 注意：不能用 `if ! result=$(...)` 捕获 rc——! 会把 $? 反转为 0，须用 || rc=$?
  local result="" movie_id="" rc=0
  result=$(tmdb_api "/search/movie" "query=${title}" \
    ${year:+"year=${year}"}) || rc=$?
  if [[ $rc -eq 0 && -n "$result" ]]; then
    movie_id=$(echo "$result" | jq -r '.results[0].id // empty')
  fi
  if [[ -z "$movie_id" ]]; then
    # 1=空哨兵跳过请求/无结果；2=请求失败
    [[ $rc -eq 2 ]] && return 2
    return 1
  fi

  # 需甄别检测（脚本优先，减少 AI 依赖）：parse 年份与结果年份不符时，
  # 先遍历候选找年份一致的；找不到 → emit MATCH 交 AI 匹配
  local search_year fb_title fb_year
  search_year=$(echo "$result" | jq -r '.results[0].release_date // empty' | cut -c1-4)
  if [[ -n "$year" ]] && [[ -n "$search_year" ]] && [[ "$year" != "$search_year" ]]; then
    local alt_id
    alt_id=$(echo "$result" | jq -r --arg y "$year" '.results[] | select(.release_date | startswith($y)) | .id' 2>/dev/null | head -1)
    if [[ -n "$alt_id" ]]; then
      movie_id="$alt_id"
      search_year="$year"
    else
      _log 信息 "年份不符（parse=$year 结果=$search_year），交 AI 匹配: $title"
      emit "$file" MATCH "movie	${year}		${episode:-}	/search/movie	$(cache_key "query=${title}" ${year:+"year=${year}"})"
      return 3
    fi
  fi
  fb_title=$(echo "$result" | jq -r '.results[0].title // empty')
  fb_year="$search_year"
  build_movie_dest "$movie_id" "$ext" "$fb_title" "$fb_year"
}

# 查询季偏移值（优先精确剧名，其次 TMDB ID）。
get_season_offset() {
  local search_name="$1" show_id="$2" season="$3"
  local lower_name="${search_name,,}"
  echo "${SEASON_OFFSET_MAP[$lower_name]:-${SEASON_OFFSET_MAP["id:$show_id"]:-}}"
}

# 匹配特典集号。成功返回 TMDB 集号，失败返回 fallback。
match_special_episode() {
  local show_id="$1" fragment="$2" fallback="$3" season0_json="$4"
  [[ -z "$season0_json" ]] && {
    echo "$fallback"
    return 1
  }
  _log 搜索 "尝试匹配特典: '$fragment'"

  # 候选词：本地关键字符串 + 去数字核心 + keymap 映射的所有 TMDB 关键字（多语言数组）
  local -a terms=("$fragment")
  local core val
  core=$(printf '%s' "$fragment" | sed -E 's/[0-9]+//g' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  [[ -n "$core" && "$core" != "$fragment" ]] && terms+=("$core")
  val="${SPECIAL_MAP[${fragment,,}]:-}"
  [[ -z "$val" ]] && val="${SPECIAL_MAP[$core]:-}"
  if [[ -n "$val" ]]; then
    while IFS= read -r v; do
      [[ -n "$v" ]] && terms+=("$v")
    done < <(echo "$val" | jq -r 'if type == "array" then .[] else . end' 2>/dev/null)
  fi

  # 三级匹配优先级（可信度递减）：
  #   1) 精确：候选词 == 特典条目名（忽略大小写）——最强信号
  #   2) 最短前缀：条目名以候选词开头，多个命中取最短的条目名（"Menu Card" vs "Menu" 取 "Menu"）
  #   3) contains：子串包含（多语言/翻译场景兜底）
  local best_ep="" term term_lower ep
  local tier=1
  for tier in 1 2 3; do
    for term in "${terms[@]}"; do
      term_lower="${term,,}"
      [[ -z "$term_lower" ]] && continue
      if [[ $tier -eq 1 ]]; then
        ep=$(echo "$season0_json" | jq -r --arg frag "$term_lower" \
          '[.episodes[] | select(.name | ascii_downcase == $frag) | .episode_number] | .[0] // empty' 2>/dev/null || true)
      elif [[ $tier -eq 2 ]]; then
        ep=$(echo "$season0_json" | jq -r --arg frag "$term_lower" \
          '[.episodes[] | select(.name | ascii_downcase | startswith($frag)) | {n: .episode_number, len: (.name | length)}] | sort_by(.len) | .[0].n // empty' 2>/dev/null || true)
      else
        ep=$(echo "$season0_json" | jq -r --arg frag "$term_lower" \
          '[.episodes[] | select(.name | ascii_downcase | contains($frag)) | .episode_number] | .[0] // empty' 2>/dev/null || true)
      fi
      ep=$(echo "$ep" | head -1 | tr -d ' \t\r\n')
      if [[ -n "$ep" ]]; then
        best_ep="$ep"
        _log 匹配 "特典匹配成功（词: $term，级别 $tier），TMDB集号: $best_ep"
        break 2
      fi
    done
  done

  if [[ -n "$best_ep" ]]; then
    echo "$best_ep"
    return 0
  fi

  _log 警告 "未匹配到特典关键字，使用原始片段: $fallback"
  echo "$fallback"
  return 1
}

# 剥离标题末尾的季后缀词（T/S/II/2nd/Season 2 等）。输出 "剥离后\t后缀"（无后缀时后缀为空）。
strip_season_suffix_word() {
  local name="$1" word stripped
  # 长词优先（Season 2 先于 2；II 先于...），避免短词误剥
  for word in "season 2" "season 3" "season 4" "season 5" "2nd" "3rd" "4th" "5th" "ii" "iii" "iv" "v" "t" "s" "2" "3" "4" "5"; do
    if [[ "${name,,}" =~ (.*)[\ ._-]+${word}$ ]]; then
      stripped="${name:0:${#BASH_REMATCH[1]}}"
      echo "${stripped}	${word}"
      return 0
    fi
  done
  echo "${name}	"
}

# 由已知 show id 构建剧集目的命名（detail/集名/季偏移/特典/多集区间）。
# 识别与 AI 匹配消费共用——命名格式化是脚本的确定性职责，AI 只做判断。
# 参数：show_id season episode episode_end special_fragment base ext file search_name
# 返回：0=成功（stdout=子目录|文件名）；1=详情缺失或季偏移无法计算（调用方决定去向）。
build_tv_dest() {
  local show_id="$1" season="$2" episode="$3" episode_end="$4" special_fragment="$5"
  local base="$6" ext="$7" file="$8" search_name="$9"
  # 归一化季/集号为无前导零十进制：parse 可能产出 "01"/"08"（S##E## 格式）。
  # 1) 保证季缓存路径 season/1.json 与 update_cache 的整数循环一致（否则缓存互不命中）；
  # 2) 避免 $((episode + 偏移)) 将 "08" 当八进制报错。
  if [[ "$season" =~ ^[0-9]+$ ]]; then season=$((10#$season)); fi
  if [[ "$episode" =~ ^[0-9]+$ ]]; then episode=$((10#$episode)); fi
  if [[ "$episode_end" =~ ^[0-9]+$ ]]; then episode_end=$((10#$episode_end)); fi

  local show_title="" year="" total_seasons=1 s1_ep_count=0 season0_json=""
  local tv_details
  if tv_details=$(tmdb_api "/tv/${show_id}"); then
    show_title=$(echo "$tv_details" | jq -r '.name // empty')
    local first_air
    first_air=$(echo "$tv_details" | jq -r '.first_air_date // empty')
    year="${first_air:0:4}"
    total_seasons=$(echo "$tv_details" | jq -r '.number_of_seasons // 1' 2>/dev/null || echo 1)
  fi
  [[ -z "$show_title" ]] && show_title=$(echo "$tv_details" | jq -r '.original_name // empty' 2>/dev/null)
  [[ -z "$show_title" ]] && {
    _log 错误 "剧集详情缺失: /tv/${show_id}"
    echo ""
    return 1
  }
  show_title=$(sanitize "$show_title")
  # 年份可省略（Jellyfin 规范）：无年份时不带括号段
  local year_tag=""
  [[ -n "$year" ]] && year_tag=" (${year})"
  _log 匹配 "剧集匹配: $show_title${year_tag}"

  # 第一季集数（季偏移用；tmdb_api 自动缓存 /tv/{id}/season/1）
  s1_ep_count=0
  if ((10#${season:-0} > 1)) && ((10#${total_seasons:-0} < 10#${season:-0})); then
    local s1_json
    if s1_json=$(tmdb_api "/tv/${show_id}/season/1"); then
      s1_ep_count=$(echo "$s1_json" | jq '.episodes | length // 0' 2>/dev/null || echo 0)
    fi
  fi

  # 特典季数据（tmdb_api 自动缓存 /tv/{id}/season/0，非搜索=原始 JSON）
  season0_json=$(tmdb_api "/tv/${show_id}/season/0" 2>/dev/null || echo "")

  local original_season=$season
  local shifted=false
  # 10# 强制十进制，避免 season 前导 0（如 08）被当八进制
  if ((10#${season:-0} > 1)) && ((10#${total_seasons:-0} < 10#${season:-0})); then
    if [[ "$s1_ep_count" -gt 0 ]]; then
      episode=$((episode + s1_ep_count))
      season=1
      shifted=true
      _log 警告 "TMDB 仅 $total_seasons 季，自动偏移 +$s1_ep_count"
    else
      local offset
      offset=$(get_season_offset "$search_name" "$show_id" "$original_season")
      if [[ -n "$offset" ]]; then
        episode=$((episode + offset))
        season=1
        shifted=true
        _log 警告 "手动偏移 $offset 将 S${original_season} 映射到 S01E${episode}"
      else
        # 无法计算季偏移 → 交调用方（识别→AI 匹配甄别）
        _log 错误 "无法计算季偏移: S${original_season}（TMDB 仅 $total_seasons 季）"
        echo ""
        return 1
      fi
    fi
  fi

  local tmdb_matched=1
  local translated=""
  if ((10#${season:-0} == 0)) && [[ -n "$special_fragment" ]]; then
    local new_ep
    translated=$(translate_fragment "$special_fragment")
    if [[ "$translated" != "$special_fragment" ]]; then
      if new_ep=$(match_special_episode "$show_id" "$translated" \
        "$episode" "$season0_json"); then
        tmdb_matched=0
        episode=$new_ep
      fi
    fi
    if [[ $tmdb_matched -ne 0 ]]; then
      if new_ep=$(match_special_episode "$show_id" "$special_fragment" \
        "$episode" "$season0_json"); then
        tmdb_matched=0
        episode=$new_ep
      fi
    fi
    if [[ $tmdb_matched -ne 0 ]]; then
      # 值 = 剧集名 | SEASON0 特典名列表（编号:名称），供 AI 判定本地字符串对应哪个 TMDB 特典
      local season0_names
      season0_names=$(echo "$season0_json" | jq -r '[.episodes[] | "\(.episode_number):\(.name)"] | join("; ")' 2>/dev/null)
      emit "$file" SPECIAL_PENDING "${show_id}|${special_fragment}|${show_title}|${season0_names}"
    fi
    # 未匹配时使用标准键作为 episode 名（Jellyfin/TMDB 可识别标准字符串）
    [[ $tmdb_matched -ne 0 ]] && episode="${translated:-$special_fragment}"
  fi

  if ((10#${season:-0} == 0)) && [[ $tmdb_matched -ne 0 ]]; then
    local s00_dest
    # 未匹配特典用 S00{类型}{编号} 命名（如 CM01 -> S00CM01），
    # 避免占用 S00E 编号，干扰 TMDB 正常识别的特典集
    s00_dest=$(special_s00_dest "$show_title" "$year_tag" "${translated:-$special_fragment}" "$ext")
    _log 跳过 "特典未匹配，文件名无单集标题"
    _log 信息 "目标: ${s00_dest%%|*}/${s00_dest#*|}"
    echo "$s00_dest"
    sleep "$TMDB_DELAY"
    return 0
  fi

  if ! [[ "$episode" =~ ^[0-9]+$ ]]; then
    local s00_dest
    # 集号异常特典同样用 S00{类型}{编号} 命名
    s00_dest=$(special_s00_dest "$show_title" "$year_tag" "$special_fragment" "$ext")
    _log 警告 "特典集号异常，使用原始片段"
    _log 信息 "目标: ${s00_dest%%|*}/${s00_dest#*|}"
    echo "$s00_dest"
    sleep "$TMDB_DELAY"
    return 0
  fi

  local s_fmt e_fmt
  s_fmt=$(safe_printf_int "$season" "00")
  e_fmt=$(safe_printf_int "$episode" "00")

  local episode_name=""
  if ((10#${season:-0} == 0)); then
    [[ -n "$season0_json" ]] && episode_name=$(echo "$season0_json" | jq -r ".episodes[] | select(.episode_number == ${episode}) | .name // empty")
    if [[ -z "$episode_name" ]]; then
      local tmp_json
      if tmp_json=$(tmdb_api "/tv/${show_id}/season/0"); then
        episode_name=$(echo "$tmp_json" | jq -r ".episodes[] | select(.episode_number == ${episode}) | .name // empty")
      fi
    fi
  else
    # 季集名（tmdb_api 自动缓存 /tv/{id}/season/{n}）
    local tmp_json
    if tmp_json=$(tmdb_api "/tv/${show_id}/season/${season}"); then
      episode_name=$(echo "$tmp_json" | jq -r ".episodes[] | select(.episode_number == ${episode}) | .name // empty")
    fi
  fi

  [[ -z "$episode_name" ]] && {
    local title_part
    title_part=$(echo "$base" | sed -r 's/.*[Ss][0-9]{2}[Ee][0-9]{2}[\ ._-]*//')
    [[ -z "$title_part" ]] && title_part="Episode ${e_fmt}"
    episode_name=$(sanitize "$title_part")
  }

  # 多集区间：补充末集集名（同一季 JSON 已缓存；首末集名以 " - " 连接）
  local episode_end_name="" ep_range="" name_part=""
  if [[ -n "$episode_end" ]] && [[ "$episode_end" != "$episode" ]]; then
    local end_json="${tmp_json:-$season0_json}"
    local e_fmt_end
    e_fmt_end=$(safe_printf_int "$episode_end" "00")
    ep_range="-E${e_fmt_end}"
    [[ -n "$end_json" ]] && episode_end_name=$(echo "$end_json" | jq -r ".episodes[] | select(.episode_number == ${episode_end}) | .name // empty")
    name_part="$(sanitize "$episode_name")"
    if [[ -n "$episode_end_name" ]]; then
      name_part="${name_part} - $(sanitize "$episode_end_name")"
    fi
  else
    name_part="$(sanitize "$episode_name")"
  fi

  # 输出匹配到的单集信息与目标文件（不受 DEBUG_LEVEL 限制）。
  # 文件名不含剧集名（Jellyfin 通过父目录识别剧集，不影响刮削）
  _log 匹配 "匹配单集: ${show_title}${year_tag} S${s_fmt}E${e_fmt}${ep_range} - ${name_part}"
  _log 信息 "目标: ${FOLDER_SHOWS}/${show_title}${year_tag}/Season ${s_fmt}/S${s_fmt}E${e_fmt}${ep_range} - ${name_part}.${ext}"

  echo "${FOLDER_SHOWS}/${show_title}${year_tag}/Season ${s_fmt}|S${s_fmt}E${e_fmt}${ep_range} - ${name_part}.${ext}"
  sleep "$TMDB_DELAY"
  return 0
}

# 识别电视剧。成功时 echo "子目录|文件名" 到 stdout，失败时 echo 空。
# 参数：title season episode episode_end base ext special_fragment file（episode_end 空=单集）。
# 返回码约定：0=识别成功；1=查询无结果；2=请求失败；3=需甄别（emit MATCH，交 AI 匹配）。
identify_tv_show() {
  local title="$1" season="$2" episode="$3" episode_end="$4"
  local base="$5" ext="$6" special_fragment="$7" file="$8"
  if [[ "$season" =~ ^[0-9]+$ ]]; then season=$((10#$season)); fi
  if [[ "$episode" =~ ^[0-9]+$ ]]; then episode=$((10#$episode)); fi
  if [[ "$episode_end" =~ ^[0-9]+$ ]]; then episode_end=$((10#$episode_end)); fi
  local search_name
  search_name=$(strip_season_suffix "$title")

  # 搜索剧集（tmdb_api 自动缓存 /search/tv）
  # 注意：不能用 `if ! result=$(...)` 捕获 rc——! 会把 $? 反转为 0，须用 || search_rc=$?
  _log 搜索 "搜索剧集: $search_name"
  local result="" show_id="" search_rc=0
  result=$(tmdb_api "/search/tv" "query=${search_name}") || search_rc=$?
  if [[ $search_rc -eq 0 && -n "$result" ]]; then
    show_id=$(echo "$result" | jq -r '.results[0].id // empty')
  fi

  # 后缀季脚本侧：搜索无结果时剥季后缀重搜（Railgun T → Railgun → base 剧）
  local season_suffix=""
  if [[ -z "$show_id" ]] && [[ $search_rc -ne 2 ]]; then
    local stripped_word
    stripped_word=$(strip_season_suffix_word "$search_name")
    season_suffix="${stripped_word#*	}"
    if [[ -n "$season_suffix" ]]; then
      search_name="${stripped_word%%	*}"
      _log 搜索 "季后缀剥离重搜: $search_name"
      local result2="" rc2=0
      result2=$(tmdb_api "/search/tv" "query=${search_name}") || rc2=$?
      if [[ $rc2 -eq 0 && -n "$result2" ]]; then
        result="$result2"
        show_id=$(echo "$result" | jq -r '.results[0].id // empty')
      fi
    fi
  fi
  if [[ -z "$show_id" ]]; then
    [[ $search_rc -eq 2 ]] && return 2
    return 1
  fi

  # 后缀季映射（脚本优先，减少 AI 依赖）：base 剧 seasons 名含被剥后缀 → 文件季号映射到该 season
  local mapped_season="$season"
  if [[ -n "$season_suffix" ]]; then
    local tv_map ms
    if tv_map=$(tmdb_api "/tv/${show_id}"); then
      ms=$(echo "$tv_map" | jq -r --arg s "$season_suffix" \
        '[.seasons[]? | select((.name // "") | ascii_downcase | test("(^|[^a-z0-9])" + $s + "([^a-z0-9]|$)")) | .season_number] | max // empty' 2>/dev/null)
      if [[ -n "$ms" ]] && [[ "$ms" != "0" ]]; then
        mapped_season="$ms"
        _log 警告 "季后缀 '$season_suffix' 匹配 Season ${ms}，文件 S${season} 映射为 S${ms}"
      fi
    fi
  fi

  # 命名构建（detail/集名/偏移/特典）——复用 build_tv_dest；
  # 失败（详情缺失/季偏移无法计算）→ 需甄别 → AI 匹配
  local dest
  if dest=$(build_tv_dest "$show_id" "$mapped_season" "$episode" "$episode_end" \
    "$special_fragment" "$base" "$ext" "$file" "$search_name"); then
    echo "$dest"
    return 0
  fi
  _log 信息 "剧集信息异常，交 AI 匹配: $search_name"
  emit "$file" MATCH "tv		${mapped_season}	${episode}	/search/tv	$(cache_key "query=${search_name}")"
  return 3
}

################################################################################
# AI 批处理
################################################################################

# 单次 AI 批量请求：合并处理搜索词纠正与特典映射学习（一次 API 调用）。
#
# AI 预期返回 JSON（由 AI_BATCH_PROMPT 引导，ai_batch_request 用 jq 解析）：
#   {
#     "search":  { "<完整 file 路径>": { "search_term": "...", "year": "..." }, ... },
#     "special": { "<show_id>|<fragment>": { "english_keyword": "...", "chinese_keyword": "..." }, ... }
#   }
# 无条目的一类返回 {}。解析后：
#   - search 部分更新 PENDING_AI_SEARCH（追加 |搜索词|年份）
#   - special 部分写入特典映射文件与内存映射（AI 学习）
# 构造 AI 批处理输入 JSON（jq 安全转义：文件名含引号/反斜杠不破坏 JSON；每类最多 AI_BATCH_SIZE 条）。
# 记录本批 key 集合（AI_BATCH_KEYS_*）：消费端只处理 AI 响应覆盖的条目，批外条目留待下一批。
build_ai_input_json() {
  local input_json='{"search_entries":[],"special_entries":[],"artist_entries":[],"match_entries":[]}'
  local batch_limit="${AI_BATCH_SIZE:-50}"
  AI_BATCH_KEYS_SEARCH=()
  AI_BATCH_KEYS_SPECIAL=()
  AI_BATCH_KEYS_ARTIST=()
  AI_BATCH_KEYS_MATCH=()
  local key info type dir_chain_val count=0
  for key in "${!PENDING_AI_SEARCH[@]}"; do
    ((count >= batch_limit)) && break
    info="${PENDING_AI_SEARCH[$key]}"
    IFS=$'\t' read -r type dir_chain_val <<<"$info"
    input_json=$(jq -c --arg f "$key" --arg d "$dir_chain_val" --arg t "$type" \
      '.search_entries += [{file: $f, directory: $d, type: $t}]' <<<"$input_json")
    AI_BATCH_KEYS_SEARCH+=("$key")
    count=$((count + 1))
  done
  count=0
  local show_id fragment show_val show_title season0_names
  for key in "${!PENDING_AI_SPECIAL[@]}"; do
    ((count >= batch_limit)) && break
    IFS='|' read -r show_id fragment <<<"$key"
    show_val="${PENDING_AI_SPECIAL[$key]}"
    IFS='|' read -r show_title season0_names <<<"$show_val"
    input_json=$(jq -c --arg s "$show_id" --arg f "$fragment" --arg t "$show_title" --arg s0 "$season0_names" \
      '.special_entries += [{show_id: $s, fragment: $f, series: $t, season0: $s0}]' <<<"$input_json")
    AI_BATCH_KEYS_SPECIAL+=("$key")
    count=$((count + 1))
  done
  count=0
  local artists_str album_name
  for key in "${!PENDING_AI_ARTIST[@]}"; do
    ((count >= batch_limit)) && break
    IFS='|' read -r artists_str album_name _ <<<"${PENDING_AI_ARTIST[$key]}"
    input_json=$(jq -c --arg f "$key" --arg a "$artists_str" --arg al "$album_name" \
      '.artist_entries += [{file: $f, artists: $a, album: $al}]' <<<"$input_json")
    AI_BATCH_KEYS_ARTIST+=("$key")
    count=$((count + 1))
  done
  count=0
  local m_type m_year m_season m_episode m_endpoint m_key
  for key in "${!PENDING_AI_MATCH[@]}"; do
    ((count >= batch_limit)) && break
    IFS=$'\t' read -r m_type m_year m_season m_episode m_endpoint m_key <<<"${PENDING_AI_MATCH[$key]}"
    # 输入 = search 响应原样（缓存中，零额外请求）+ 首候选 detail 的 seasons 四字段提炼（缓存命中才给）
    local search_data="" seasons_json="[]"
    search_data=$(jq -r '.data // empty' "$(cache_path "$m_endpoint" "$m_key")" 2>/dev/null) || search_data=""
    if [[ -n "$search_data" ]]; then
      local first_id d_json
      first_id=$(echo "$search_data" | jq -r '.results[0].id // empty' 2>/dev/null)
      if [[ -n "$first_id" ]]; then
        d_json=$(cat "$(cache_path "/${m_type}/${first_id}" "$m_key")" 2>/dev/null)
        if [[ -n "$d_json" ]] && echo "$d_json" | jq -e . >/dev/null 2>&1; then
          seasons_json=$(echo "$d_json" | jq -c '[.seasons[]? | {season_number, name, episode_count, air_date}]' 2>/dev/null)
        fi
      fi
    fi
    [[ -n "$search_data" ]] || search_data="null"
    [[ -n "$seasons_json" ]] || seasons_json="[]"
    input_json=$(jq -c --arg f "$key" --arg t "$m_type" --arg y "$m_year" --arg s "$m_season" \
      --argjson sd "$search_data" --argjson sn "$seasons_json" \
      '.match_entries += [{file: $f, type: $t, year: $y, season: $s, search: $sd, seasons: $sn}]' <<<"$input_json")
    AI_BATCH_KEYS_MATCH+=("$key")
    count=$((count + 1))
  done
  echo "$input_json"
}

ai_batch_request() {
  # 无待处理项直接返回
  if [[ $PENDING_SEARCH_COUNT -eq 0 ]] &&
    [[ $PENDING_SPECIAL_COUNT -eq 0 ]] &&
    [[ $PENDING_ARTIST_COUNT -eq 0 ]] &&
    [[ $PENDING_MATCH_COUNT -eq 0 ]]; then
    return
  fi
  _log 智能 "AI 批量请求（搜索 $PENDING_SEARCH_COUNT + 特典 $PENDING_SPECIAL_COUNT + 艺术家 $PENDING_ARTIST_COUNT + 匹配 $PENDING_MATCH_COUNT）"

  local input_json
  input_json=$(build_ai_input_json)
  local full_prompt="$AI_BATCH_PROMPT"$'\n\n'"Input: $input_json"

  local payload
  payload=$(jq -n --arg content "$full_prompt" --arg model "$AI_MODEL" --arg sys "$AI_SYSTEM_MESSAGE" \
    '{model: $model, messages: [{role: "system", content: $sys}, {role: "user", content: $content}], temperature: 0.2}')

  [[ "${AI_DRY_RUN,,}" == "true" ]] && {
    _log 智能 "AI 干运行，Prompt 摘要: 搜索 $PENDING_SEARCH_COUNT 个 + 特典 $PENDING_SPECIAL_COUNT 个 + 艺术家 $PENDING_ARTIST_COUNT 个 + 匹配 $PENDING_MATCH_COUNT 个"
    # 返回非零：未消费任何条目（run_ai_batch 视作失败 → 剩余显式跳过，可逆）
    return 1
  }

  if [[ "$AI_CALL_COUNT" -ge "${AI_MAX_CALLS}" ]]; then
    _log 警告 "AI 调用次数已达上限，跳过批量请求"
    return 1
  fi

  local api_url="${AI_FULL_URL:-${AI_BASE_URL}/v1/chat/completions}"
  # 递增重试（2^n 封顶 16s），与 tmdb_api 同一策略
  local response=""
  local attempt=0 delay=1
  while true; do
    if response=$(curl -s --connect-timeout "${AI_CURL_CONNECT_TIMEOUT}" --max-time "${AI_CURL_MAX_TIME}" \
      -H "Content-Type: application/json" -H "Authorization: Bearer ${AI_API_KEY}" -d "$payload" "$api_url" 2>&1); then
      break
    fi
    attempt=$((attempt + 1))
    if ((attempt > AI_CURL_RETRY)); then
      _log 错误 "AI 批量请求失败（重试 ${AI_CURL_RETRY} 次后）"
      return 1
    fi
    _log 警告 "AI 批量请求失败，${delay}s 后重试（${attempt}/${AI_CURL_RETRY}）"
    sleep "$delay"
    ((delay *= 2))
    [[ $delay -gt 16 ]] && delay=16
  done
  AI_CALL_COUNT=$((AI_CALL_COUNT + 1))

  local content
  content=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
  if [[ -z "$content" ]]; then
    _log 错误 "AI 批量请求未返回有效内容"
    return 1
  fi

  echo "$content" | jq -e . >/dev/null 2>&1 || {
    _log 错误 "AI 批量请求返回非 JSON: $content"
    return 1
  }

  _log 智能 "AI 批量请求结果: $content"
  local result_json="$content"

  # 解析 search 部分：更新 PENDING_AI_SEARCH（追加 |搜索词|年份|AI判断类别）
  local ai_term ai_year ai_media
  for key in "${!PENDING_AI_SEARCH[@]}"; do
    ai_term=$(echo "$result_json" | jq -r --arg file "$key" '.search[$file].search_term // empty')
    ai_year=$(echo "$result_json" | jq -r --arg file "$key" '.search[$file].year // empty')
    ai_media=$(echo "$result_json" | jq -r --arg file "$key" '.search[$file].media_type // empty')
    if [[ -n "$ai_term" ]] || [[ -n "$ai_media" ]]; then
      local old="${PENDING_AI_SEARCH[$key]}"
      PENDING_AI_SEARCH[$key]="${old}	${ai_term}	${ai_year}	${ai_media}"
    fi
  done

  # 解析 artist_choice 部分：AI 判定多艺术家中的专辑艺术家（空串=判断不出）
  for key in "${!PENDING_AI_ARTIST[@]}"; do
    AI_ARTIST_CHOICE[$key]=$(echo "$result_json" | jq -r --arg file "$key" '.artist_choice[$file] // empty')
  done

  # 解析 match 部分：AI 匹配甄别（choice=选定 id；season_shift=季映射；search_term=无匹配纠正词）
  for key in "${!PENDING_AI_MATCH[@]}"; do
    AI_MATCH_CHOICE[$key]=$(echo "$result_json" | jq -r --arg file "$key" '.match[$file].choice // empty')
    AI_MATCH_SHIFT[$key]=$(echo "$result_json" | jq -r --arg file "$key" '.match[$file].season_shift // empty')
    AI_MATCH_TERM[$key]=$(echo "$result_json" | jq -r --arg file "$key" '.match[$file].search_term // empty')
  done

  # 记录本批响应覆盖的 key（AI 漏了的条目留待下一批；缺失计数警告）
  AI_RESPONDED_SEARCH=()
  AI_RESPONDED_ARTIST=()
  AI_RESPONDED_MATCH=()
  local responded
  for key in "${AI_BATCH_KEYS_SEARCH[@]}"; do
    responded=$(echo "$result_json" | jq -r --arg f "$key" '.search | has($f)' 2>/dev/null)
    [[ "$responded" == "true" ]] && AI_RESPONDED_SEARCH["$key"]=1
  done
  for key in "${AI_BATCH_KEYS_ARTIST[@]}"; do
    responded=$(echo "$result_json" | jq -r --arg f "$key" '.artist_choice | has($f)' 2>/dev/null)
    [[ "$responded" == "true" ]] && AI_RESPONDED_ARTIST["$key"]=1
  done
  for key in "${AI_BATCH_KEYS_MATCH[@]}"; do
    responded=$(echo "$result_json" | jq -r --arg f "$key" '.match | has($f)' 2>/dev/null)
    [[ "$responded" == "true" ]] && AI_RESPONDED_MATCH["$key"]=1
  done
  local missing=$((${#AI_BATCH_KEYS_SEARCH[@]} + ${#AI_BATCH_KEYS_ARTIST[@]} + ${#AI_BATCH_KEYS_MATCH[@]} - \
    ${#AI_RESPONDED_SEARCH[@]} - ${#AI_RESPONDED_ARTIST[@]} - ${#AI_RESPONDED_MATCH[@]}))
  ((missing > 0)) && _log 警告 "AI 响应缺失 $missing 个条目（留待下一批）"

  learn_special_keywords "$result_json"
}

# AI 学习写回：AI 从该条 season0 候选关键字列表中选出与本地片段匹配的项，
# 写回 keymap 作为匹配关键字（可多语言数组）。
# 交叉验证：AI 返回的每个匹配关键字必须存在于该条 season0 候选列表（防 AI 幻觉污染映射）。
learn_special_keywords() {
  local result_json="$1"
  local tmdb_name key
  for key in "${!PENDING_AI_SPECIAL[@]}"; do
    local fragment key_lower season0_names
    IFS='|' read -r _ fragment <<<"$key"
    key_lower="${fragment,,}"
    season0_names="${PENDING_AI_SPECIAL[$key]#*|}"
    tmdb_name=$(echo "$result_json" | jq -r --arg k "$fragment" '.special[$k] // empty')
    if [[ -n "$tmdb_name" ]] && [[ "$tmdb_name" != "null" ]]; then
      # 交叉验证：过滤掉不在候选列表中的项（数组逐项 / 字符串单项）。
      # 注意：`$s0 | contains(.)` 中 . 指管道输入（$s0 自身）——须先捕获元素为 $item
      local valid_name
      valid_name=$(echo "$tmdb_name" | jq -r --arg s0 "$season0_names" \
        'if type == "array" then ([.[] | select(. as $item | ($item != "") and ($s0 | contains($item)))] | if length > 0 then . else empty end)
				  else (if (. != "") and ($s0 | contains(.)) then . else empty end) end' 2>/dev/null) || valid_name=""
      if [[ -z "$valid_name" ]] || [[ "$valid_name" == "null" ]]; then
        _log 警告 "AI 特典匹配关键字不在候选列表，丢弃: $fragment -> $tmdb_name"
        continue
      fi
      tmdb_name="$valid_name"
      # 确保映射文件存在（不存在则创建空 JSON，AI 学到的映射需要持久化）
      if [[ ! -f "$SPECIAL_MAP_FILE" ]]; then
        echo '{}' >"$SPECIAL_MAP_FILE" 2>/dev/null || true
      fi
      local tmp_map_file="${SPECIAL_MAP_FILE}.tmp.$$"
      # JSON 文件：合并写入数组（已有值则去重追加；字符串值归并为数组）
      if jq --arg k "$key_lower" --argjson v "$tmdb_name" \
        'if has($k) then (.[$k] = (((if (.[$k]|type)=="array" then .[$k] else [.[$k]] end) + (if ($v|type)=="array" then $v else [$v] end)) | unique)) else (.[$k] = (if ($v|type)=="array" then $v else [$v] end)) end' \
        "$SPECIAL_MAP_FILE" >"$tmp_map_file" 2>/dev/null; then
        if ! mv "$tmp_map_file" "$SPECIAL_MAP_FILE"; then
          rm -f "$tmp_map_file"
        fi
      else
        rm -f "$tmp_map_file"
      fi
      # 更新内存映射（JSON 数组）
      local existing="${SPECIAL_MAP[$key_lower]:-}"
      if [[ -z "$existing" ]]; then
        SPECIAL_MAP["$key_lower"]=$(jq -n --argjson v "$tmdb_name" 'if ($v|type)=="array" then $v else [$v] end')
      else
        SPECIAL_MAP["$key_lower"]=$(echo "$existing" | jq --argjson v "$tmdb_name" \
          '(if type=="array" then . else [.] end) + (if ($v|type)=="array" then $v else [$v] end) | unique')
      fi
      _log 智能 "已添加特典映射: $fragment -> $tmdb_name"
    fi
  done
}

################################################################################
# 硬链接处理
################################################################################

# 判断源与目标是否为同一 inode（硬链接已存在）。
# 获取文件 inode（兼容 GNU/BSD/BusyBox stat）。
# 依次尝试：GNU stat -c '%i' -> BSD stat -f '%i' -> ls -i -> find -printf。
get_file_inode() {
  local filepath="$1"
  local inode
  inode=$(stat -c '%i' "$filepath" 2>/dev/null)
  [[ -n "$inode" ]] && {
    echo "$inode"
    return 0
  }
  inode=$(stat -f '%i' "$filepath" 2>/dev/null)
  [[ -n "$inode" ]] && {
    echo "$inode"
    return 0
  }
  # ls -i 解析 inode 字段（BusyBox 可靠，stat/find -printf 可能不可用）
  # shellcheck disable=SC2012
  inode=$(ls -i "$filepath" 2>/dev/null | awk '{print $1}')
  [[ -n "$inode" ]] && {
    echo "$inode"
    return 0
  }
  # GNU find 兜底：-printf 解析 inode
  find "$filepath" -maxdepth 0 -printf '%i' 2>/dev/null
}

same_inode() {
  local src="$1" dst="$2"
  [[ ! -e "$dst" ]] && return 1
  local src_inode dst_inode

  src_inode=$(get_file_inode "$src")
  dst_inode=$(get_file_inode "$dst")
  [[ -z "$src_inode" || -z "$dst_inode" ]] && return 1

  [[ "$src_inode" == "$dst_inode" ]]
}

# 创建硬链接；干运行模式下仅打印；目标已存在时直接替换（不备份）。
# 注：不做 .bak 备份——遗留的 .bak_* 文件会被 Jellyfin 当作媒体扫描，干扰刮削。
hardlink_or_dryrun() {
  local src="$1" dst="$2"

  if $DRY_RUN; then
    _log 信息 "干运行：硬链接 '$src' -> '$dst'"
    return 0
  fi

  if same_inode "$src" "$dst"; then
    _log 跳过 "硬链接已存在，inode: $(stat -c '%i' "$src" 2>/dev/null)"
    return 0
  fi

  # 目标已存在：直接替换（先删旧目标再建硬链接）
  if [[ -e "$dst" ]]; then
    # 安全保护：目标是目录（如误传根目录）时拒绝替换，避免误操作真实目录
    if [[ -d "$dst" ]]; then
      _log 错误 "目标是目录，拒绝替换: $dst"
      return 1
    fi
    _log 信息 "目标已存在，直接替换: $dst"
    rm -f "$dst"
  fi

  if ln "$src" "$dst"; then
    _log 成功 "硬链接已创建"
    return 0
  else
    _log 错误 "硬链接创建失败"
    return 1
  fi
}

################################################################################
# 错误处理
################################################################################

# 全局 ERR trap：记录出错行号后退出。
_handle_error() {
  local line_num="$1"
  _log 错误 "脚本在第 $line_num 行出错（错误码：$?）"
  exit 1
}

################################################################################
# 命令行参数与帮助
################################################################################

# 显示帮助信息。
show_help() {
  cat <<EOF
Jellyfin 媒体库硬链接整理脚本 v${SCRIPT_VERSION}

用法：
  media_organizer.sh [选项] <源目录> <目的目录>
  media_organizer.sh --update-cache <源目录>            仅更新缓存，不整理
  media_organizer.sh --list-cache [关键词]              列出缓存条目

模式（一次调用只取其一）：
  <源目录> <目的目录>                    正常整理（使用缓存）
  --update-cache <源目录> <目的目录>     整理并强制重取对应缓存
  --update-cache <源目录>                仅更新缓存，不整理
  --list-cache [关键词]                  列出缓存条目（可选关键词过滤）

选项：
  -a, --automated       自动化模式（写入日志，跳过无法处理的项目）
      --no-automated    取消自动化模式（覆盖环境变量/mo_env 设置）
      --dry-run         干运行：不创建链接、不写缓存、不写日志（网络请求照常但不落盘）
      --no-dry-run      取消干运行（覆盖环境变量/mo_env 设置）
      --refresh-cache   清空全部持久化缓存后执行（可与任意模式叠加）
      --update-cache    强制重取对应缓存条目（与 --list-cache 互斥）
      --list-cache      列出缓存条目（与 --update-cache 互斥）
      --src-dir <目录>  指定源目录（与位置参数互斥）
      --dest-dir <目录> 指定目的目录（与位置参数互斥）
  -h, --help            显示此帮助
      --version         显示版本号

语法：
  -- 之后的所有参数一律视为位置参数
  带参数选项支持 --opt=值 与 --opt 值 两种形式（值以 - 开头时必须用 = 形式）

配置：
  优先级：CLI > 环境变量 > mo_env 文件 > 默认值
  mo_env 中可配置全部选项（配置示例：mo_env.example）

TMDB 认证：
  至少需要：TMDB_API_KEY 或 TMDB_API_RA_TOKEN
  获取位置：https://www.themoviedb.org/settings/api

示例：
  ./media_organizer.sh /downloads /media
  ./media_organizer.sh -a /downloads /media
  ./media_organizer.sh --dry-run /downloads /media
  ./media_organizer.sh --update-cache /downloads /media
  ./media_organizer.sh --list-cache 刀剑

文档：
  详细配置：CONFIG.md
  问题排除：TROUBLESHOOTING.md
  配置示例：mo_env.example
EOF
}

# 用法错误：输出错误、用法提示与帮助指引，退出码 2（GNU 惯例）。
_usage_error() {
  local msg="$1"
  _log 错误 "$msg"
  _log 错误 "用法：media_organizer.sh [选项] <源目录> <目的目录>（详见 --help）"
  exit 2
}

# 解析命令行参数（选项任意顺序；-- 后均为位置参数；带参选项支持 = 与空格两种形式）。
# 按入口形状（list / cache-only / organize）校验目录个数与模式冲突。
parse_args() {
  local args=("$@") i=0 arg
  local positional=() src="" dst="" after_dash=false

  while [[ $i -lt ${#args[@]} ]]; do
    arg="${args[$i]}"
    if [[ "$after_dash" == "true" ]]; then
      positional+=("$arg")
      i=$((i + 1))
      continue
    fi
    case "$arg" in
      --)
        after_dash=true
        ;;
      -a | --automated)
        AUTOMATED=true
        ;;
      --no-automated)
        AUTOMATED=false
        ;;
      --dry-run)
        DRY_RUN=true
        ;;
      --no-dry-run)
        DRY_RUN=false
        ;;
      --refresh-cache)
        REFRESH_CACHE=true
        ;;
      --update-cache)
        UPDATE_CACHE=true
        ;;
      --list-cache)
        LIST_CACHE=true
        # 可选过滤关键词（下一位非选项则作为过滤词）
        if [[ $i -lt $((${#args[@]} - 1)) && "${args[$((i + 1))]}" != -* ]]; then
          i=$((i + 1))
          LIST_CACHE_FILTER="${args[$i]}"
        fi
        ;;
      --list-cache=*)
        LIST_CACHE=true
        LIST_CACHE_FILTER="${arg#*=}"
        ;;
      --src-dir | --src-dir=*)
        if [[ "$arg" == --src-dir=* ]]; then
          src="${arg#*=}"
        else
          i=$((i + 1))
          if [[ $i -ge ${#args[@]} || "${args[$i]}" == -* ]]; then
            _usage_error "选项 --src-dir 缺少参数值（以 - 开头的值请用 --src-dir=值 形式）"
          fi
          src="${args[$i]}"
        fi
        ;;
      --dest-dir | --dest-dir=*)
        if [[ "$arg" == --dest-dir=* ]]; then
          dst="${arg#*=}"
        else
          i=$((i + 1))
          if [[ $i -ge ${#args[@]} || "${args[$i]}" == -* ]]; then
            _usage_error "选项 --dest-dir 缺少参数值（以 - 开头的值请用 --dest-dir=值 形式）"
          fi
          dst="${args[$i]}"
        fi
        ;;
      -h | --help)
        show_help
        exit 0
        ;;
      --version)
        echo "media_organizer.sh v${SCRIPT_VERSION}"
        exit 0
        ;;
      -*)
        _usage_error "未知选项 '$arg'"
        ;;
      *)
        positional+=("$arg")
        ;;
    esac
    i=$((i + 1))
  done

  # ---- 目录通道与形状校验 ----
  # 通道互斥：位置参数与 --src-dir/--dest-dir 不可混用
  if [[ ${#positional[@]} -gt 0 && (-n "$src" || -n "$dst") ]]; then
    _usage_error "目录只能通过一种方式指定：2 个位置参数，或 --src-dir + --dest-dir"
  fi
  if [[ ${#positional[@]} -gt 2 ]]; then
    _usage_error "位置参数过多：最多 2 个（源目录、目的目录）"
  fi
  if [[ ${#positional[@]} -eq 1 ]]; then
    SOURCE_DIR="${positional[0]}"
  elif [[ ${#positional[@]} -eq 2 ]]; then
    SOURCE_DIR="${positional[0]}"
    DESTINATION_DIR="${positional[1]}"
  fi
  [[ -n "$src" ]] && SOURCE_DIR="$src"
  [[ -n "$dst" ]] && DESTINATION_DIR="$dst"

  # list 形状：0 个目录，拒绝目录参数与修饰标志
  if [[ "$LIST_CACHE" == "true" ]]; then
    if [[ -n "$SOURCE_DIR" || -n "$DESTINATION_DIR" ]]; then
      _usage_error "--list-cache 不接受目录参数"
    fi
    [[ "$UPDATE_CACHE" == "true" ]] && _usage_error "--list-cache 与 --update-cache 不能同时使用"
    [[ "$DRY_RUN" == "true" ]] && _usage_error "--dry-run 不能与 --list-cache 同时使用"
    [[ "$AUTOMATED" == "true" ]] && _usage_error "--automated 不能与 --list-cache 同时使用"
    return 0
  fi

  # update-cache 形状：1 个目录 = 仅刷缓存；2 个目录 = 刷新并整理
  if [[ "$UPDATE_CACHE" == "true" ]]; then
    if [[ -z "$SOURCE_DIR" ]]; then
      _usage_error "--update-cache 需要源目录（位置参数或 --src-dir）"
    fi
    if [[ -z "$DESTINATION_DIR" ]]; then
      # cache-only：仅刷缓存，不整理——无链接可预览、无跳过概念
      [[ "$DRY_RUN" == "true" ]] && _usage_error "--dry-run 不能与仅更新缓存同时使用（无链接可预览）"
      [[ "$AUTOMATED" == "true" ]] && _usage_error "--automated 不能与仅更新缓存同时使用（无整理步骤）"
    fi
    return 0
  fi

  # organize 形状：恰好 2 个目录
  if [[ -z "$SOURCE_DIR" || -z "$DESTINATION_DIR" ]]; then
    _usage_error "需要源目录与目的目录（2 个位置参数，或 --src-dir + --dest-dir）"
  fi
}

# 入口目录校验：源目录存在可读；目的目录存在可写或可创建（干运行不创建目录）。
validate_directories() {
  if [[ -n "$SOURCE_DIR" && (! -d "$SOURCE_DIR" || ! -r "$SOURCE_DIR") ]]; then
    _log 错误 "源目录不存在或不可读：$SOURCE_DIR"
    exit 1
  fi
  if [[ -z "$DESTINATION_DIR" ]]; then
    return 0
  fi
  if [[ ! -e "$DESTINATION_DIR" ]]; then
    if [[ "$DRY_RUN" == "true" ]]; then
      _log 错误 "目的目录不存在（干运行不会创建目录）：$DESTINATION_DIR"
      exit 1
    fi
    if ! mkdir -p "$DESTINATION_DIR" 2>/dev/null; then
      _log 错误 "无法创建目的目录：$DESTINATION_DIR"
      exit 1
    fi
  elif [[ ! -d "$DESTINATION_DIR" || ! -w "$DESTINATION_DIR" ]]; then
    _log 错误 "目的目录不可用（需为可写目录）：$DESTINATION_DIR"
    exit 1
  fi
}

################################################################################
# 环境检查
################################################################################

# 检查硬链接支持（源与目标必须在同一文件系统）。
check_hardlink_support() {
  if ! ${SKIP_HARDLINK_CHECK,,}; then
    src_test="$SOURCE_DIR/.hardlink_test_src_$$"
    dst_test="$DESTINATION_DIR/.hardlink_test_dst_$$"
    touch "$src_test" 2>/dev/null || {
      _log 错误 "无法在源目录创建测试文件"
      exit 1
    }
    if ! ln "$src_test" "$dst_test" 2>/dev/null; then
      rm -f "$src_test"
      _log 错误 "无法创建硬链接"
      exit 1
    fi
    rm -f "$dst_test" "$src_test"
  fi
}

# 初始化缓存目录，处理 --refresh-cache（清空整个缓存目录）。
# 干运行模式只解析路径、不创建目录（零持久化副作用）。
init_cache_dir() {
  # 解析默认缓存路径（优先级：环境变量 > 执行目录 mo_cache > 脚本目录 mo_cache）
  if [[ -z "${CACHE_DIR:-}" ]]; then
    if [[ -d "$PWD/mo_cache" ]]; then
      CACHE_DIR="$PWD/mo_cache"
    else
      CACHE_DIR="$SCRIPT_DIR/mo_cache"
    fi
  fi
  if [[ "${DRY_RUN:-false}" != "true" ]]; then
    if ! mkdir -p "$CACHE_DIR" 2>/dev/null; then
      CACHE_DIR=""
    fi
  fi

  if [[ "$REFRESH_CACHE" == "true" ]] && [[ -n "$CACHE_DIR" ]]; then
    cache_clear
    [[ "${DRY_RUN:-false}" != "true" ]] && _log 信息 "缓存已清除"
  fi

  # 创建镜像 API 的缓存子目录
  if [[ "${DRY_RUN:-false}" != "true" ]]; then
    mkdir -p "$CACHE_DIR/search/movie" "$CACHE_DIR/search/tv" \
      "$CACHE_DIR/tv" "$CACHE_DIR/movie" 2>/dev/null || true
  fi
}

################################################################################
# 主处理流水线
################################################################################

# 扫描源目录，收集视频文件列表。
# 按去除压制组/字幕组等方括号信息后的名称排序，
# 保证同一部剧先按季、再按集有序处理（先第一季再第二季）。
scan_files() {
  _log 信息 "正在扫描源目录..."
  local file ext ext_lower key entry
  # 进程替换保证 while 在父 shell 执行，VIDEO_FILES 修改生效
  # 用换行分隔 + sort（BusyBox sort 仅支持 -nru，不支持 -z/-k）
  while IFS= read -r entry; do
    file="${entry#*$'\t'}"
    VIDEO_FILES+=("$file")
  done < <(
    find "$SOURCE_DIR" -type f -print0 |
      while IFS= read -r -d '' file; do
        ext="${file##*.}"
        ext_lower="${ext,,}"
        if [[ " ${VIDEO_EXTS[*]} " =~ [[:space:]]${ext_lower}[[:space:]] ]]; then
          key=$(clean_name "$(basename "$file")")
          printf '%s\t%s\n' "$key" "$file"
        fi
      done |
      sort
  )
  # 收集音频文件（CD 音乐，归入 Music 分类）
  while IFS= read -r entry; do
    file="${entry#*$'\t'}"
    AUDIO_FILES+=("$file")
  done < <(
    find "$SOURCE_DIR" -type f -print0 |
      while IFS= read -r -d '' file; do
        ext="${file##*.}"
        ext_lower="${ext,,}"
        if [[ " ${AUDIO_EXTS[*]} " =~ [[:space:]]${ext_lower}[[:space:]] ]]; then
          printf '%s\t%s\n' "$(basename "$file")" "$file"
        fi
      done |
      sort
  )
  _log 信息 "共发现 ${#VIDEO_FILES[@]} 个视频文件、${#AUDIO_FILES[@]} 个音频文件，开始识别..."
}

# 第一阶段：解析文件名并识别，构建 MEDIA_DESTINATION_MAP。
# 按扩展名分发单个文件到视频/音频处理（识别池 worker 入口）。
process_one_file() {
  local f="$1"
  local ext="${f##*.}"
  ext="${ext,,}"
  if [[ " ${VIDEO_EXTS[*]} " =~ [[:space:]]${ext}[[:space:]] ]]; then
    process_one_video "$f"
  elif [[ " ${AUDIO_EXTS[*]} " =~ [[:space:]]${ext}[[:space:]] ]]; then
    process_one_audio "$f"
  fi
}

# 单个视频文件的识别：parse → 分类 → 识别 → 协议输出。
# 协议：DEST（识别成功）/ PENDING（无结果或 unknown，待 AI）/ REQ_FAILED（请求失败）/
# SKIP（类型跳过）。待定登记全部由父进程合并时执行。
process_one_video() {
  local video="$1"
  _log 信息 "处理视频: $(basename "$video")"
  push_indent

  local info type title year season episode episode_end special_fragment base ext dest="" rc=0
  info=$(parse_media_filename "$video")
  IFS='|' read -r type title year season episode episode_end special_fragment <<<"$info"
  base="${video##*/}"
  base="${base%.*}"
  ext="${video##*.}"

  if [[ "$type" == "movie" ]]; then
    dest=$(identify_movie "$base" "$ext" "$video" "$title" "$year") || rc=$?
  elif [[ "$type" == "tv" ]]; then
    dest=$(identify_tv_show "$title" "${season:-1}" "${episode:-0}" "${episode_end:-}" \
      "$base" "$ext" "$special_fragment" "$video") || rc=$?
  fi

  if [[ "$type" == "skip" ]]; then
    # 电影域特典/附带：不整理（TMDB/Jellyfin 均不收录电影特典，避免误判为剧集特典）
    _log 跳过 "电影特典/附带，不整理: $(basename "$video")"
    if $AUTOMATED && [[ "${DRY_RUN:-false}" != "true" ]]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') | $video | 电影特典不整理" >>"$SKIP_LOG_FILE"
    fi
    emit "$video" SKIP "skip_type"
    pop_indent
    return 0
  elif [[ "$type" == "unknown" ]]; then
    # unknown：识别不出类别，记录待 AI 判断（type=unknown，AI 返回 media_type 决定 movie/tv）
    _log 信息 "类别未定，交 AI 判断: $(basename "$video")"
    emit "$video" PENDING "unknown	$(dir_chain "$video")"
    pop_indent
    return 0
  elif [[ $rc -eq 2 ]]; then
    # 请求失败（网络/密钥问题，重试耗尽）——不登记 AI 待定，语义与"无结果"分离
    _log 错误 "TMDB 请求失败，跳过: $(basename "$video")"
    emit "$video" REQ_FAILED
  elif [[ $rc -eq 3 ]]; then
    # 需甄别：identify 已 emit MATCH（交 AI 匹配）
    _log 信息 "需甄别，交 AI 匹配: $(basename "$video")"
  elif [[ $rc -eq 0 && -n "$dest" ]]; then
    local destination_subdir destination_filename
    IFS='|' read -r destination_subdir destination_filename <<<"$dest"
    emit "$video" DEST "$destination_subdir|$destination_filename"
  else
    # 查询无结果（rc=1）→ 待 AI 搜索纠正
    _log 信息 "未匹配，交 AI 搜索: $(basename "$video")"
    emit "$video" PENDING "${type}	$(dir_chain "$video")"
  fi

  pop_indent
}

# 第一阶段：识别池处理全部视频文件（并发）。
process_video() {
  [[ ${#VIDEO_FILES[@]} -eq 0 ]] && return 0
  _log 信息 "开始识别视频（${#VIDEO_FILES[@]} 个，并发 ${MEDIA_WORKERS}）..."
  POOL_THRESHOLD_CHECK=true
  pool_run "${VIDEO_FILES[@]}"
}

# 解析 CD 目录名，输出：歌手|专辑。
# 目录名格式：[日期] ｢专辑名｣／歌手 [规格] (格式)，如 "[250110] ｢幸せのレシピ｣／平井大 [24bit_48kHz] (flac)"。
# 解析失败时歌手回退为 "Unknown"，专辑用原始目录名。
parse_cd_dir() {
  local dir="$1"
  local artist album
  # 去掉 [日期] 前缀
  local name="${dir#*] }"
  # 循环去掉末尾的 [规格] 与 (格式) 后缀（可能多个）
  local prev=""
  while [[ "$name" != "$prev" ]]; do
    prev="$name"
    name=$(echo "$name" | sed -E 's/[[:space:]]*\[[^]]*\]$//; s/[[:space:]]*\([^)]*\)$//')
  done
  name=$(echo "$name" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  # 按 ／ 分割：｢专辑｣／歌手
  if [[ "$name" == *"／"* ]]; then
    album="${name%%／*}"
    artist="${name##*／}"
  else
    album="$name"
    artist="Unknown"
  fi
  # 专辑名去掉 ｢｣ 引号
  album=$(echo "$album" | sed -E 's/^｢//; s/｣$//' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  artist=$(echo "$artist" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
  [[ -z "$artist" ]] && artist="Unknown"
  [[ -z "$album" ]] && album="$name"
  echo "$artist|$album"
}

# 单个音频文件的整理：伴随优先级（同名视频→音轨排除）→ 艺术家归类链（元数据）→ 协议输出。
# 协议：DEST（音频及其歌词/封面伴随，可链接）；ARTIST_PENDING（多艺术家待 AI 判定）。
# 艺术家归类链：专辑艺术家 → 单歌曲艺术家 → 多艺术家交 AI → 目录名解析 → Unknown。
process_one_audio() {
  local audio="$1"
  # 向上找到 CD 目录（目录名含日期/专辑/格式特征，如 [250110] ...、｢专辑｣／歌手、…(flac)）
  local dir cd_root bn
  dir=$(dirname "$audio")
  cd_root="$dir"
  while [[ "$cd_root" != "/" && "$cd_root" != "." ]]; do
    bn=$(basename "$cd_root")
    if echo "$bn" | grep -qE '\[[0-9]{6}\]|／|｢|\(flac|\(mp3|\(wav|\(webp'; then
      break
    fi
    cd_root=$(dirname "$cd_root")
  done
  # 未找到 CD 目录（走到 / 或 .）→ 以音频所在目录为专辑根，避免 parse_cd_dir("/") 产出垃圾
  [[ "$cd_root" == "/" || "$cd_root" == "." ]] && cd_root="$dir"

  local base_name="${audio%.*}"
  # 伴随优先级（视频 > 音频）：同名视频存在 → 该音频是视频的伴随音轨，
  # 由视频的伴随逻辑处理（link 时跟随），不独立整理
  local same_video="" v vext
  for v in "$base_name".*; do
    [[ ! -f "$v" ]] && continue
    [[ "$v" == "$audio" ]] && continue
    vext="${v##*.}"
    if [[ " ${VIDEO_EXTS[*]} " =~ [[:space:]]${vext,,}[[:space:]] ]]; then
      same_video="$v"
      break
    fi
  done
  if [[ -n "$same_video" ]]; then
    _log 跳过 "音频为视频伴随音轨，不独立整理: $(basename "$audio")"
    return 0
  fi

  # 元数据读取（ffprobe 读格式标签；仅整理不增删文件）
  local meta album_artist meta_artist meta_album
  meta=$(ffprobe -v quiet -show_entries format_tags=album_artist,artist,album \
    -of default=noprint_wrappers=1 "$audio" 2>/dev/null) || meta=""
  # 注意：pipefail 下 grep 无匹配会使管道整体返回非零，必须 || true（set -e 保护）
  album_artist=$(echo "$meta" | grep -iE 'album_artist=' | head -1 | sed -E 's/.*album_artist=//') || true
  meta_artist=$(echo "$meta" | grep -iE 'artist=' | grep -viE 'album_artist=' | head -1 | sed -E 's/.*artist=//') || true
  meta_album=$(echo "$meta" | grep -iE 'album=' | head -1 | sed -E 's/.*album=//') || true

  # CD 目录名解析（元数据缺失时的回退源）
  local parsed cd_artist cd_album
  parsed=$(parse_cd_dir "$(basename "$cd_root")")
  IFS='|' read -r cd_artist cd_album <<<"$parsed"

  # CD 目录下的相对子路径（保留碟片子目录，如 THCA-60298-1）
  local rel rel_dir
  rel="${audio#"$cd_root"/}"
  rel_dir=$(dirname "$rel")
  [[ "$rel_dir" == "." ]] && rel_dir=""

  local artist="" album="${meta_album:-$cd_album}"
  if [[ -n "$album_artist" ]]; then
    artist="$album_artist"
  elif [[ -n "$meta_artist" ]]; then
    # 拆分多艺术家（ID3v2 常用 / 或 \ 分隔）
    local -a arts=() cleaned_arts=() a
    IFS='/\\' read -ra arts <<<"$meta_artist"
    for a in "${arts[@]}"; do
      a=$(echo "$a" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')
      [[ -n "$a" ]] && cleaned_arts+=("$a")
    done
    if ((${#cleaned_arts[@]} <= 1)); then
      artist="${cleaned_arts[0]:-$meta_artist}"
    else
      # 多艺术家 → 交 AI 判定（AI 判断不出时拼接，见 run_ai_batch）
      _log 信息 "多艺术家，交 AI 判定: $(basename "$audio")"
      emit "$audio" ARTIST_PENDING \
        "$(
          IFS='|'
          echo "${cleaned_arts[*]}"
        )|${album:-}|${rel_dir}"
      return 0
    fi
  fi
  # 艺术家仍未解析 → 目录名解析 → Unknown
  [[ -z "$artist" ]] && artist="$cd_artist"
  [[ -z "$artist" ]] && artist="$FOLDER_UNKNOWN"
  [[ -z "$album" ]] && album="$FOLDER_UNKNOWN"

  local destination_subdir
  destination_subdir="${FOLDER_MUSIC}/$(sanitize "$artist")/$(sanitize "$album")"
  [[ -n "$rel_dir" ]] && destination_subdir="$destination_subdir/$rel_dir"
  emit "$audio" DEST "$destination_subdir|$(basename "$audio")"
  _log 信息 "音频: $(basename "$audio") -> $destination_subdir/"

  emit_audio_companions "$audio" "$cd_root" "$destination_subdir" "$artist" "$album"
}

# 音频伴随文件发射（链接既有文件，不提取/不生成）：歌词（同名 lrc/elrc/txt）+ 专辑级封面。
# 歌词随曲目（含碟片相对路径）；封面在源专辑根目录（目标专辑根）。
emit_audio_companions() {
  local audio="$1" cd_root="$2" destination_subdir="$3" artist="$4" album="$5"
  local base_name="${audio%.*}"
  local c
  for c in "${base_name}.lrc" "${base_name}.elrc" "${base_name}.txt"; do
    [[ -f "$c" ]] && emit "$c" DEST "$destination_subdir|$(basename "$c")"
  done
  # 专辑封面：源专辑根目录的类型名图片（cover/folder/poster/jacket/thumb/default）
  local cover_file cb cname
  for cover_file in "$cd_root"/*.jpg "$cd_root"/*.png "$cd_root"/*.webp; do
    [[ ! -f "$cover_file" ]] && continue
    cb=$(basename "$cover_file")
    cname="${cb%.*}"
    if echo "$cname" | grep -qiE '^(cover|folder|poster|jacket|thumb|default)$'; then
      emit "$cover_file" DEST \
        "${FOLDER_MUSIC}/$(sanitize "$artist")/$(sanitize "$album")|$cb"
      break
    fi
  done
}

# 处理音频文件（CD 音乐）：识别池并发处理，归入 Music/歌手/专辑/曲目。
process_audio() {
  [[ ${#AUDIO_FILES[@]} -eq 0 ]] && return 0
  _log 信息 "处理音频文件（CD 音乐，共 ${#AUDIO_FILES[@]} 个）..."
  POOL_THRESHOLD_CHECK=false
  pool_run "${AUDIO_FILES[@]}"
}

# 特典回退目标：S00{类型}{编号} - {片段}（避免占用 S00E 编号干扰 TMDB 识别）。
# 识别路径与回退命名共用，保证两套特典命名规则一致。
special_s00_dest() {
  local show_title="$1" year_tag="$2" fragment="$3" ext="$4"
  local clean_fragment sp_type sp_num s00_tag
  clean_fragment=$(sanitize "$fragment")
  sp_type=$(echo "$fragment" | sed -E 's/[0-9]+$//')
  sp_num=$(echo "$fragment" | grep -oE '[0-9]+$' | head -1)
  s00_tag="${sp_type}${sp_num}"
  [[ -z "$s00_tag" ]] && s00_tag="Special"
  echo "${FOLDER_SHOWS}/${show_title}${year_tag}/Season 00|S00${s00_tag} - ${clean_fragment}.${ext}"
}

# 回退命名（AI 尽力后仍失败）：按文件名推断的标题组织；年份可省略；空集名不加 " - " 段。
# 参数：type title year season episode episode_end fragment ext → 输出 子目录|文件名
fallback_naming() {
  local type="$1" title="$2" year="$3" season="$4" episode="$5" episode_end="$6" fragment="$7" ext="$8"
  local safe_title s_fmt e_fmt year_tag=""
  safe_title=$(sanitize "$title")
  [[ -n "$year" ]] && year_tag=" (${year})"
  if [[ "$type" == "movie" ]]; then
    echo "${FOLDER_MOVIES}/${safe_title}${year_tag}|${safe_title}${year_tag}.${ext}"
  elif [[ -n "$fragment" ]] && [[ "${season:-0}" == "0" ]]; then
    special_s00_dest "$safe_title" "$year_tag" "$fragment" "$ext"
  else
    s_fmt=$(safe_printf_int "${season:-1}" "00")
    e_fmt=$(safe_printf_int "${episode:-0}" "00")
    local ep_range=""
    if [[ -n "$episode_end" ]]; then
      local e_fmt_end
      e_fmt_end=$(safe_printf_int "$episode_end" "00")
      ep_range="-E${e_fmt_end}"
    fi
    echo "${FOLDER_SHOWS}/${safe_title}${year_tag}/Season ${s_fmt}|S${s_fmt}E${e_fmt}${ep_range}.${ext}"
  fi
}

# 解析待 AI 判定艺术家的音频条目：AI 有判定用判定结果，否则所有艺术家用 " & " 拼接。
resolve_pending_artists() {
  local force="${1:-}"
  local -a keys=()
  if [[ -n "$force" ]]; then
    keys=("${!PENDING_AI_ARTIST[@]}")
  else
    keys=("${AI_BATCH_KEYS_ARTIST[@]}")
  fi
  local audio
  for audio in "${keys[@]}"; do
    [[ -n "${PENDING_AI_ARTIST[$audio]:-}" ]] || continue
    # AI 漏了该条目 → 留待下一批（force 模式忽略该检查）
    [[ -n "$force" || -n "${AI_RESPONDED_ARTIST[$audio]:-}" ]] || continue
    local arts_album album rel_dir choice
    IFS='|' read -r arts_album album rel_dir <<<"${PENDING_AI_ARTIST[$audio]}"
    choice="${AI_ARTIST_CHOICE[$audio]:-}"
    local artist="$choice"
    if [[ -z "$artist" ]]; then
      artist="${arts_album//|/ & }"
      _log 警告 "AI 无法判定艺术家，拼接处理: $artist"
    fi
    local subdir
    subdir="${FOLDER_MUSIC}/$(sanitize "$artist")/$(sanitize "$album")"
    [[ -n "$rel_dir" ]] && subdir="$subdir/$rel_dir"
    register_identified "$audio" "$subdir" "$(basename "$audio")"
    # 歌词伴随（同名 lrc/elrc/txt）
    local base_name="${audio%.*}" c
    for c in "${base_name}.lrc" "${base_name}.elrc" "${base_name}.txt"; do
      [[ -f "$c" ]] && register_identified "$c" "$subdir" "$(basename "$c")"
    done
    _log 信息 "音频艺术家确定: $(basename "$audio") -> $subdir/"
    unset "PENDING_AI_ARTIST[$audio]"
    PENDING_ARTIST_COUNT=$((PENDING_ARTIST_COUNT - 1))
  done
}

# AI 辅助重处理待定搜索项：AI 纠正词 → 原始标题兜底 → 回退命名（降级成功）。
reprocess_pending_searches() {
  local video
  for video in "${AI_BATCH_KEYS_SEARCH[@]}"; do
    [[ -n "${PENDING_AI_SEARCH[$video]:-}" ]] || continue
    # AI 漏了该条目 → 留待下一批
    [[ -n "${AI_RESPONDED_SEARCH[$video]:-}" ]] || continue
    _log 信息 "重新处理（AI辅助）: $(basename "$video")"
    push_indent

    local info type title year season episode episode_end special_fragment base ext dest rc=0
    info=$(parse_media_filename "$video")
    IFS='|' read -r type title year season episode episode_end special_fragment <<<"$info"
    base="${video##*/}"
    base="${base%.*}"
    ext="${video##*.}"

    # identify 在命令替换中执行（子 shell 丢 emit 副作用）——经临时 emit 文件回传合并
    local tmp_emit
    tmp_emit=$(mktemp)
    POOL_EMIT_FILE="$tmp_emit"

    # 使用 AI 纠正后的搜索词重新搜索（复用 identify_*，无内联重复）
    local ai_data old_type ai_search ai_year ai_media
    ai_data="${PENDING_AI_SEARCH[$video]:-}"
    IFS=$'\t' read -r old_type _ ai_search ai_year ai_media <<<"$ai_data"
    local eff_type="$old_type"
    if [[ "$eff_type" == "unknown" && -n "$ai_media" ]]; then
      eff_type="$ai_media"
    fi
    if [[ -n "$ai_search" ]]; then
      if [[ "$eff_type" == "movie" ]]; then
        _log 搜索 "使用 AI 纠正词: $ai_search (年份: ${ai_year:-})"
        dest=$(identify_movie "$base" "$ext" "$video" "$ai_search" "${ai_year:-}") || rc=$?
      else
        _log 搜索 "使用 AI 纠正词搜索剧集: $ai_search"
        dest=$(identify_tv_show "$ai_search" "${season:-1}" "${episode:-0}" "${episode_end:-}" \
          "$base" "$ext" "$special_fragment" "$video") || rc=$?
      fi
    fi

    # 兜底重试（原始标题，仅 tv——movie 走 AI 纠正词，失败即回退）
    if [[ $rc -ne 2 ]] && { [[ $rc -ne 0 ]] || [[ -z "$dest" ]]; } && [[ "$type" == "tv" ]]; then
      dest=$(identify_tv_show "$title" "${season:-1}" "${episode:-0}" "${episode_end:-}" \
        "$base" "$ext" "$special_fragment" "$video") || rc=$?
    fi

    unset POOL_EMIT_FILE
    merge_emit_lines "$tmp_emit"
    rm -f "$tmp_emit"

    # 记录结果或回退命名
    local destination_subdir destination_filename
    if [[ $rc -eq 0 && -n "$dest" ]]; then
      IFS='|' read -r destination_subdir destination_filename <<<"$dest"
      register_identified "$video" "$destination_subdir" "$destination_filename"
    elif [[ $rc -eq 2 ]]; then
      register_request_failed "$video"
    elif [[ $rc -eq 3 ]]; then
      # identify 已重新登记 MATCH（下一批 AI 匹配）
      _log 信息 "需甄别，交 AI 匹配: $(basename "$video")"
    else
      # AI 尽力后仍失败 → 回退命名（降级成功）
      _log 错误 "经 AI 处理后仍无法识别，使用回退命名"
      local fallback_dest
      fallback_dest=$(fallback_naming "$type" "$title" "$year" "${season:-1}" "${episode:-0}" "${episode_end:-}" "$special_fragment" "$ext")
      IFS='|' read -r destination_subdir destination_filename <<<"$fallback_dest"
      register_fallback "$video" "$destination_subdir" "$destination_filename"
      _log 信息 "回退命名: ${destination_subdir}/${destination_filename}"
    fi

    pop_indent
    unset "PENDING_AI_SEARCH[$video]"
    PENDING_SEARCH_COUNT=$((PENDING_SEARCH_COUNT - 1))
  done
}

# 消费 AI 匹配结果：choice → 脚本构建命名（build_*_dest，命名是脚本职责）；
# season_shift 叠加到文件季号；search_term → 纠正词重搜取首条（单轮优先）；仍失败 → 回退命名。
resolve_pending_matches() {
  local video
  for video in "${AI_BATCH_KEYS_MATCH[@]}"; do
    [[ -n "${PENDING_AI_MATCH[$video]:-}" ]] || continue
    # AI 漏了该条目 → 留待下一批
    [[ -n "${AI_RESPONDED_MATCH[$video]:-}" ]] || continue
    _log 信息 "AI 匹配: $(basename "$video")"
    push_indent

    local m_type m_year m_season m_episode m_endpoint m_key
    IFS=$'\t' read -r m_type m_year m_season m_episode m_endpoint m_key <<<"${PENDING_AI_MATCH[$video]}"
    local base ext
    base="${video##*/}"
    base="${base%.*}"
    ext="${video##*.}"
    local dest="" rc=0
    local choice="${AI_MATCH_CHOICE[$video]:-}"
    local shift="${AI_MATCH_SHIFT[$video]:-}"
    local term="${AI_MATCH_TERM[$video]:-}"

    if [[ -n "$choice" ]]; then
      # AI 选中候选 → 脚本构建命名
      local eff_season="${m_season:-1}"
      if [[ -n "$shift" ]] && [[ "$shift" =~ ^[0-9]+$ ]]; then
        eff_season=$((10#$eff_season + 10#$shift))
        _log 信息 "AI 季映射: S${m_season} → S${eff_season}"
      fi
      if [[ "$m_type" == "movie" ]]; then
        dest=$(build_movie_dest "$choice" "$ext" "" "") || rc=$?
      else
        dest=$(build_tv_dest "$choice" "$eff_season" "${m_episode:-1}" "" "" "$base" "$ext" "$video" "") || rc=$?
      fi
    fi
    # AI 无匹配 + 纠正词 → 重搜取首条（单轮优先，不给 AI 第二轮）；
    # identify 在命令替换中执行——经临时 emit 文件回传 MATCH/SPECIAL 副作用
    if [[ -z "$dest" ]] && [[ -n "$term" ]]; then
      _log 搜索 "AI 纠正词重搜: $term"
      local tmp_emit
      tmp_emit=$(mktemp)
      POOL_EMIT_FILE="$tmp_emit"
      if [[ "$m_type" == "movie" ]]; then
        dest=$(identify_movie "$base" "$ext" "$video" "$term" "") || rc=$?
      else
        dest=$(identify_tv_show "$term" "${m_season:-1}" "${m_episode:-0}" "" "$base" "$ext" "" "$video") || rc=$?
      fi
      unset POOL_EMIT_FILE
      merge_emit_lines "$tmp_emit"
      rm -f "$tmp_emit"
    fi

    # 记录结果或回退命名
    local destination_subdir destination_filename
    if [[ $rc -eq 0 && -n "$dest" ]]; then
      IFS='|' read -r destination_subdir destination_filename <<<"$dest"
      register_identified "$video" "$destination_subdir" "$destination_filename"
    elif [[ $rc -eq 2 ]]; then
      register_request_failed "$video"
    elif [[ $rc -eq 3 ]]; then
      : # identify 已重新登记 MATCH（下一批处理）
    else
      # AI 判断无解 → 回退命名（降级成功）
      local info type title year season episode episode_end special_fragment
      info=$(parse_media_filename "$video")
      IFS='|' read -r type title year season episode episode_end special_fragment <<<"$info"
      _log 错误 "AI 匹配无解，使用回退命名"
      local fallback_dest
      fallback_dest=$(fallback_naming "$type" "$title" "$year" "${season:-1}" "${episode:-0}" "${episode_end:-}" "$special_fragment" "$ext")
      IFS='|' read -r destination_subdir destination_filename <<<"$fallback_dest"
      register_fallback "$video" "$destination_subdir" "$destination_filename"
      _log 信息 "回退命名: ${destination_subdir}/${destination_filename}"
    fi

    pop_indent
    unset "PENDING_AI_MATCH[$video]"
    PENDING_MATCH_COUNT=$((PENDING_MATCH_COUNT - 1))
  done
}

# 第二阶段：AI 批处理（纠正搜索词、学习特典映射、判定艺术家、匹配甄别、重处理待定文件）。
# 分批循环：每批 AI_BATCH_SIZE 条；AI_MAX_CALLS 为批次上限；消费端只处理响应覆盖的条目。
run_ai_batch() {
  # 无 AI 密钥：搜索/匹配待定显式登记跳过（可逆——下次运行自动重试）；多艺术家直接拼接
  if [[ -z "${AI_API_KEY:-}" ]]; then
    local f
    for f in "${!PENDING_AI_SEARCH[@]}"; do
      _log 警告 "未识别跳过（无 AI 密钥）: $(basename "$f")"
      register_skip "$f" "skip_unidentified"
    done
    for f in "${!PENDING_AI_MATCH[@]}"; do
      _log 警告 "需甄别跳过（无 AI 密钥）: $(basename "$f")"
      register_skip "$f" "skip_unidentified"
    done
    PENDING_AI_SEARCH=()
    PENDING_SEARCH_COUNT=0
    PENDING_AI_MATCH=()
    PENDING_MATCH_COUNT=0
    resolve_pending_artists force
    return 0
  fi
  if [[ $PENDING_SEARCH_COUNT -eq 0 ]] &&
    [[ $PENDING_SPECIAL_COUNT -eq 0 ]] &&
    [[ $PENDING_ARTIST_COUNT -eq 0 ]] &&
    [[ $PENDING_MATCH_COUNT -eq 0 ]]; then
    return 0
  fi

  _log 信息 "开始 AI 批量处理..."
  local ai_failed=false
  while ((PENDING_SEARCH_COUNT > 0 || PENDING_SPECIAL_COUNT > 0 || \
    PENDING_ARTIST_COUNT > 0 || PENDING_MATCH_COUNT > 0)); do
    if [[ "$AI_CALL_COUNT" -ge "${AI_MAX_CALLS}" ]]; then
      _log 警告 "AI 调用次数已达上限（$AI_MAX_CALLS），剩余条目显式跳过"
      ai_failed=true
      break
    fi
    if ! ai_batch_request; then
      ai_failed=true
      break
    fi
    # 特典映射学习已由 ai_batch_request 完成（写回映射文件与内存映射）
    PENDING_AI_SPECIAL=()
    PENDING_SPECIAL_COUNT=0
    resolve_pending_artists
    reprocess_pending_searches
    resolve_pending_matches
  done
  # AI 失败（网络/非 JSON/干运行/上限）：剩余搜索/匹配待定显式跳过（可逆，与无 AI 语义统一）
  if $ai_failed; then
    local f
    for f in "${!PENDING_AI_SEARCH[@]}"; do
      register_skip "$f" "skip_unidentified"
    done
    for f in "${!PENDING_AI_MATCH[@]}"; do
      register_skip "$f" "skip_unidentified"
    done
    PENDING_AI_SEARCH=()
    PENDING_SEARCH_COUNT=0
    PENDING_AI_MATCH=()
    PENDING_MATCH_COUNT=0
    # 艺术家走拼接（信息不丢，优于跳过）
    resolve_pending_artists force
  fi
}

# 第三阶段：创建硬链接及处理伴随文件。
# 幂等：same_inode 跳过已链接；撞名（不同 inode 占用）按官方多版本格式去重（- 2 后缀）；
# 同源旧链接（回退→正确识别的迁移）按 inode 清理。计数写入 LINK_SUCCESS_COUNT/LINK_FAIL_COUNT 供汇总。
link_media() {
  _log 信息 "开始创建硬链接..."
  LINK_SUCCESS_COUNT=0
  LINK_FAIL_COUNT=0

  local video dest_info destination_subdir destination_filename
  for video in "${!MEDIA_DESTINATION_MAP[@]}"; do
    dest_info="${MEDIA_DESTINATION_MAP[$video]}"
    IFS='|' read -r destination_subdir destination_filename <<<"$dest_info"

    # 目标路径无效（防御：register 层保证可链接条目必有目的信息）
    if [[ -z "$destination_subdir" || -z "$destination_filename" ]]; then
      _log 警告 "目标路径无效，跳过: ${video##*/}"
      LINK_FAIL_COUNT=$((LINK_FAIL_COUNT + 1))
      continue
    fi

    local destination_dir destination_file
    destination_dir="${DESTINATION_DIR}/${destination_subdir}"
    destination_file="${destination_dir}/${destination_filename}"

    _log 信息 "处理: $(basename "$video")"
    push_indent

    if ! mkdir -p "$destination_dir"; then
      _log 错误 "无法创建目的目录: $destination_dir"
      LINK_FAIL_COUNT=$((LINK_FAIL_COUNT + 1))
      pop_indent
      continue
    fi

    local already_linked=false
    if [[ -e "$destination_file" ]] && same_inode "$video" "$destination_file"; then
      # 幂等：目标已存在且同 inode（上次运行已链接）
      already_linked=true
      LINK_SUCCESS_COUNT=$((LINK_SUCCESS_COUNT + 1))
      _log 跳过 "硬链接已存在: $destination_file"
    else
      # 撞名去重：目标被其他文件占用（inode 不同）→ 追加 " - 2" 后缀（官方多版本格式，
      # 前缀=文件夹名；Jellyfin 会把它们识别为一个条目的多个版本）
      local dedup_suffix=2
      while [[ -e "$destination_file" ]]; do
        local stem dext
        stem="${destination_filename%.*}"
        dext="${destination_filename##*.}"
        destination_filename="${stem} - ${dedup_suffix}.${dext}"
        destination_file="${destination_dir}/${destination_filename}"
        dedup_suffix=$((dedup_suffix + 1))
      done

      # 同源迁移清理：本次目标位置是新的（旧链接可能在回退名等位置）→ 按 inode 找旧链接删除。
      # 仅非干运行执行（干运行零持久化副作用）。
      if [[ "${DRY_RUN:-false}" != "true" ]]; then
        local src_inode old_link
        src_inode=$(get_file_inode "$video")
        if [[ -n "$src_inode" ]]; then
          while IFS= read -r -d '' old_link; do
            [[ "$old_link" == "$destination_file" ]] && continue
            _log 信息 "清理旧链接: $old_link"
            rm -f "$old_link"
          done < <(find "$DESTINATION_DIR" -type f -inum "$src_inode" -print0 2>/dev/null)
        fi
      fi

      if hardlink_or_dryrun "$video" "$destination_file"; then
        LINK_SUCCESS_COUNT=$((LINK_SUCCESS_COUNT + 1))
      else
        LINK_FAIL_COUNT=$((LINK_FAIL_COUNT + 1))
        if $AUTOMATED && [[ "${DRY_RUN:-false}" != "true" ]]; then
          echo "$(date '+%Y-%m-%d %H:%M:%S') | $video | 硬链接失败" >>"$SKIP_LOG_FILE"
        fi
        pop_indent
        continue
      fi
    fi

    # 处理伴随文件（字幕、音轨等；主文件已链接时也执行——新伴随文件需补链）
    link_companions "$video" "$destination_file"

    pop_indent
  done
}

# 链接主视频的伴随文件（字幕/音轨等）：目标名保留语言后缀（如 .zh、.zh-tw），
# 避免多个伴随文件（.ass/.zh.ass/.zh-tw.ass）互相覆盖产生 .bak 堆积。
link_companions() {
  local video="$1" destination_file="$2"
  local base_name companion companion_ext dest_companion
  base_name="${video%.*}"
  for companion in "$base_name".*; do
    [[ ! -f "$companion" ]] && continue
    [[ "$companion" == "$video" ]] && continue

    companion_ext="${companion##*.}"
    if is_companion "$companion" "${video%.*}"; then
      # 用字符串截取而非 ${var#pat}：base_name 含 [] 等 glob 特殊字符，
      # ${var#pat} 的 pattern 是 glob，含 [ 时匹配不可靠。
      local comp_suffix="${companion:${#base_name}}"
      comp_suffix="${comp_suffix%.*}"
      dest_companion="${destination_file%.*}${comp_suffix}.${companion_ext}"
      _log 信息 "处理伴随文件: $(basename "$companion")"
      if ! hardlink_or_dryrun "$companion" "$dest_companion"; then
        _log 警告 "伴随文件硬链接失败: $(basename "$companion")"
      fi
    fi
  done
}

# 运行级汇总：按结局账本分类计数并列出文件清单（每类前 10 条，其余折叠；
# 自动化模式同时向日志文件写入全量清单）。
print_summary() {
  local -A counts=()
  local -A lists=()
  local key outcome
  for key in "${!MEDIA_OUTCOME_MAP[@]}"; do
    outcome="${MEDIA_OUTCOME_MAP[$key]}"
    counts["$outcome"]=$((${counts[$outcome]:-0} + 1))
    if ((${counts[$outcome]} <= 10)); then
      lists["$outcome"]+="$(basename "$key")"$'\n'
    fi
  done

  local -a categories=(identified fallback skip_type skip_unidentified request_failed)
  local -a labels=("识别成功" "回退命名（降级成功）" "类型跳过（电影特典）" "未识别跳过" "请求失败")
  local i
  for i in "${!categories[@]}"; do
    local cat="${categories[$i]}"
    [[ -z "${counts[$cat]:-}" ]] && continue
    _log 成功 "${labels[$i]}：${counts[$cat]} 个"
    local line
    while IFS= read -r line; do
      [[ -n "$line" ]] && _log 信息 "    - $line"
    done <<<"${lists[$cat]:-}"
    if ((${counts[$cat]} > 10)); then
      _log 信息 "    ... 其余 $((${counts[$cat]} - 10)) 条（automated 模式日志文件含全量清单）"
    fi
  done
  _log 成功 "链接：成功 $LINK_SUCCESS_COUNT，失败 $LINK_FAIL_COUNT"

  # 自动化模式：全量清单写入日志文件（干运行不写，零持久化副作用）
  if [[ "${AUTOMATED:-false}" == "true" ]] && [[ "${DRY_RUN:-false}" != "true" ]] &&
    [[ -n "${LOG_FILE:-}" ]] && [[ ${#MEDIA_OUTCOME_MAP[@]} -gt 0 ]]; then
    {
      echo "=== 运行汇总（全量清单）==="
      for key in "${!MEDIA_OUTCOME_MAP[@]}"; do
        printf '%s\t%s\n' "$key" "${MEDIA_OUTCOME_MAP[$key]}"
      done
    } >>"$LOG_FILE"
  fi
}

################################################################################
# 入口函数
################################################################################

# 主入口：参数解析 → 配置加载 → 认证 → 初始化 → 三阶段流水线。
main() {
  parse_args "$@"

  # list 形状：无需配置认证，直接列出后退出
  if [[ "$LIST_CACHE" == "true" ]]; then
    init_cache_dir
    cache_list "$LIST_CACHE_FILTER"
    exit 0
  fi

  load_config
  init_colors
  select_auth
  check_dependencies
  init_special_map "$SPECIAL_MAP_FILE"
  init_special_words "$SPECIAL_WORDS_FILE"
  init_skip_dirs "$SKIP_DIRS_FILE"
  init_season_offset

  # cache-only 形状：仅更新缓存后退出（无整理步骤，不做硬链接检查）
  if [[ "$UPDATE_CACHE" == "true" && -z "$DESTINATION_DIR" ]]; then
    validate_directories
    init_cache_dir
    update_cache
    exit 0
  fi

  # organize 形状（可叠加 --update-cache 修饰）：入口校验 + 硬链接检查（干运行跳过）
  validate_directories
  if [[ "${DRY_RUN:-false}" != "true" ]]; then
    check_hardlink_support
  fi
  init_cache_dir

  # 注册信号处理
  trap '_handle_error $LINENO' ERR

  # 启动信息
  _log 信息 "=== Jellyfin 媒体库整理脚本 v${SCRIPT_VERSION} ==="
  _log 信息 "源目录：$SOURCE_DIR"
  _log 信息 "目的目录：$DESTINATION_DIR"
  [[ "$DRY_RUN" == "true" ]] && _log 信息 "运行模式：[干运行] - 不创建链接、不写缓存与日志"
  [[ "$AUTOMATED" == "true" ]] && _log 信息 "运行模式：[自动化] - 将写入日志文件"
  [[ "$UPDATE_CACHE" == "true" ]] && _log 信息 "运行模式：[更新缓存] - 整理时强制重取对应缓存条目"

  # 流水线：扫描 → 识别池 → AI 批处理 → 链接 → 汇总
  scan_files
  process_video
  process_audio
  run_ai_batch
  link_media
  print_summary

  # 退出码分级：0=全部成功；3=部分失败（非预期跳过/请求失败/链接失败 > 0）
  local fail_count=0 key outcome
  for key in "${!MEDIA_OUTCOME_MAP[@]}"; do
    outcome="${MEDIA_OUTCOME_MAP[$key]}"
    if [[ "$outcome" == "skip_unidentified" || "$outcome" == "request_failed" ]]; then
      fail_count=$((fail_count + 1))
    fi
  done
  if ((fail_count > 0 || LINK_FAIL_COUNT > 0)); then
    exit 3
  fi
}

# 脚本唯一入口
main "$@"
