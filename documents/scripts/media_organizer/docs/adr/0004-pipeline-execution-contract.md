# 流水线执行契约：识别池、结局账本与错误分类

主流水线（scan → 识别 → AI → link）重构为三个新契约：**识别池**（`MEDIA_WORKERS` 默认 4）——`process_video` 与 `process_audio` 共用同一 worker 池，子进程产出 `key\tvalue` 行由父进程合并（bash 子 shell 无法写父关联数组，这是唯一并行契约）；**结局账本**——`MEDIA_OUTCOME_MAP` 记录每条目结局（identified/fallback/skip_type/skip_unidentified/request_failed/pending_ai），跳过与失败条目不进入目的映射，`register_*` 层原子完成"映射+账本+计数器"；**错误分类**——区分"查询无结果"（可恢复，跳过继续）与"请求失败"（计入失败，连续 ≥5 次或失败率 ≥50% 时终止），网络请求改为递增重试（`2^n` 封顶 16s，`TMDB_CURL_RETRY`/`AI_CURL_RETRY` 分别控制次数，共享实现）。

运行级汇总在结尾列出各分类数量与文件清单（每类前 10 条，automated 全量入日志文件）；退出码分级：0=全部成功、1=运行期错误、2=用法错误、3=部分失败（skip>0）。回退命名仅限"AI 尽力后仍失败"（无 AI → 显式 `skip_unidentified`），其条目在汇总中记为"降级成功"。

**Considered Options**: 后台 job 各自写回（无法共享关联数组，需临时文件合并——正是所选方案的机制）；完整 per-file 状态机（bash 关联数组收益有限）；全失败即终止（网络抖动即死）；无 AI 时也回退命名（批量伪命名污染库且被幂等锁死，跳过可逆——下次运行自动重试）。
