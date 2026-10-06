"""
外挂挂载源的准入清单：allow_paths / deny_paths

构建期（files.jsonl）与前端运行时共用同一套语义：

- 清单元素是「以 / 开头的路径前缀」，匹配对象是**外挂索引里节点 ID 对应的路径**
  （外挂源自身坐标系，含 `sub_path` 前缀）；挂载点在本地树里的位置不参与匹配。
- 命中判定：``path == prefix`` 或 ``path.startswith(prefix + "/")``，前缀天然覆盖整棵子树。
- ``deny_paths`` 优先于 ``allow_paths``；两个清单都为空表示不限制。
- 命中 deny、或声明了非空 allow 但未命中的节点，连子树一起被拒绝。
"""

from typing import Any, Dict, List, Optional

ALLOW_PATHS_KEY = "allow_paths"
DENY_PATHS_KEY = "deny_paths"


def normalize_path_prefix(value: Any) -> Optional[str]:
    """把配置项规范成以 / 开头、无尾斜杠的前缀；非字符串或空串返回 None。"""
    if not isinstance(value, str):
        return None

    trimmed = value.strip()

    if not trimmed:
        return None

    if not trimmed.startswith("/"):
        trimmed = f"/{trimmed}"

    return trimmed.rstrip("/") or "/"


def get_path_prefixes(mount_source: Optional[Dict[str, Any]], key: str) -> List[str]:
    """读取单个准入清单；缺失、非数组或非法元素按空清单处理。"""
    if not isinstance(mount_source, dict):
        return []

    raw = mount_source.get(key)

    if not isinstance(raw, list):
        return []

    prefixes: List[str] = []

    for item in raw:
        prefix = normalize_path_prefix(item)

        if prefix is not None and prefix not in prefixes:
            prefixes.append(prefix)

    return prefixes


def matches_path_prefix(path: str, prefix: str) -> bool:
    """
    前缀命中判定：路径等于前缀，或路径在前缀的下一层。

    特例：``/``（规范化后的根前缀）视为**整个源**——写 ``deny_paths: ["/"]``
    的意图显然是"这个源什么都不放行"，若按字面公式只命中根节点自身，会变成
    一个"写了根路径却什么都没拦"的坑。
    """
    if prefix == "/":
        return True

    if path == prefix:
        return True

    return path.startswith(f"{prefix}/")


def is_external_path_allowed(
    relative_path: str,
    mount_source: Optional[Dict[str, Any]],
) -> bool:
    """
    判断外挂源内的相对路径是否准入。

    Args:
        relative_path: 外挂索引里节点 ID 对应的路径（以 / 开头）
        mount_source: 挂载点节点上的 mount_source 配置
    """
    deny_prefixes = get_path_prefixes(mount_source, DENY_PATHS_KEY)

    if any(matches_path_prefix(relative_path, prefix) for prefix in deny_prefixes):
        return False

    allow_prefixes = get_path_prefixes(mount_source, ALLOW_PATHS_KEY)

    if allow_prefixes and not any(
        matches_path_prefix(relative_path, prefix) for prefix in allow_prefixes
    ):
        return False

    return True
