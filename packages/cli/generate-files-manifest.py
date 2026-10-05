#!/usr/bin/env python3
"""
generate-files-manifest.py - 根据 share-file.json / share-file.cdn.json 生成 files.jsonl 清单

支持：
- 汇总本地索引中的物理文件直链（优先取 CDN 版本索引的 url）
- 抓取外部挂载源索引，按前端规则重写 id 与直链
- --offline 只输出本地节点（无网环境与测试可用）
"""

import argparse
import json
import os
import re
import sys
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

# 添加 lib 目录到 Python 路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "lib"))

from lib.file_scanner import get_mount_source
from lib.logger import Logger

GITHUB_RAW_HOST = "raw.githubusercontent.com"
GITHUB_RAW_BASE_URL = f"https://{GITHUB_RAW_HOST}"
JSDELIVR_BASE_URL = "https://cdn.jsdelivr.net"
FETCH_TIMEOUT_SECONDS = 20
BRANCH_FALLBACK = ("main", "master")


# ────────────── 地址拼接（与前端 domain/external/url.ts 逐字一致）──────────────


def trim_url_segment(segment: str) -> str:
    """去掉片段首尾的斜杠。"""
    return segment.strip("/")


def join_url(base_url: str, *segments: str) -> str:
    """按前端的 joinUrl 规则拼接地址。"""
    normalized_base = base_url.rstrip("/")
    normalized_segments = [trim_url_segment(item) for item in segments]
    normalized_segments = [item for item in normalized_segments if item]

    return "/".join([normalized_base, *normalized_segments])


def get_access_cdn(mount_source: Dict[str, Any]) -> Optional[str]:
    """读取 access_cdn 配置。"""
    value = mount_source.get("access_cdn")

    return value if isinstance(value, str) else None


def is_custom_cdn(access_cdn: Optional[str]) -> bool:
    """判断 access_cdn 是否为自定义 CDN 地址。"""
    return bool(access_cdn) and access_cdn not in ("jsdelivr", "raw")


def build_custom_github_cdn_url(
    access_cdn: str,
    repository: str,
    branch: str,
    file_path: str,
) -> str:
    """自定义 CDN 走 raw.githubusercontent.com 回源。"""
    return join_url(access_cdn, GITHUB_RAW_HOST, repository, branch, file_path)


def get_mount_repository(mount_source: Dict[str, Any]) -> str:
    """读取仓库标识。"""
    repository = mount_source.get("repository")

    return repository if isinstance(repository, str) else ""


def get_mount_branch(mount_source: Dict[str, Any]) -> str:
    """读取分支名，缺省为 main。"""
    branch = mount_source.get("branch")

    return branch if isinstance(branch, str) and branch else "main"


def build_external_index_url(
    mount_source: Dict[str, Any],
    use_cdn_index: bool,
) -> str:
    """构建外部仓库索引地址。"""
    if mount_source.get("provider") != "github":
        raise ValueError(f"不支持的存储提供商: {mount_source.get('provider')}")

    repository = get_mount_repository(mount_source)
    branch = get_mount_branch(mount_source)
    access_cdn = get_access_cdn(mount_source)
    file_name = "share-file.cdn.json" if use_cdn_index else "share-file.json"

    if is_custom_cdn(access_cdn):
        return build_custom_github_cdn_url(access_cdn, repository, branch, file_name)

    if access_cdn == "raw":
        return join_url(GITHUB_RAW_BASE_URL, repository, branch, file_name)

    return f"{JSDELIVR_BASE_URL}/gh/{repository}@{branch}/{file_name}"


def build_external_file_url(
    mount_source: Dict[str, Any],
    node_id: str,
) -> str:
    """按挂载配置构建外部文件直链。"""
    if mount_source.get("provider") != "github":
        raise ValueError(f"不支持的存储提供商: {mount_source.get('provider')}")

    repository = get_mount_repository(mount_source)
    branch = get_mount_branch(mount_source)
    access_cdn = get_access_cdn(mount_source)

    if is_custom_cdn(access_cdn):
        return build_custom_github_cdn_url(access_cdn, repository, branch, node_id)

    if access_cdn == "raw":
        return join_url(GITHUB_RAW_BASE_URL, repository, branch, node_id)

    return f"{JSDELIVR_BASE_URL}/gh/{repository}@{branch}/{trim_url_segment(node_id)}"


def get_expected_file_url_prefix(mount_source: Dict[str, Any]) -> str:
    """该挂载源下合法文件地址应有的前缀。"""
    repository = get_mount_repository(mount_source)
    branch = get_mount_branch(mount_source)
    access_cdn = get_access_cdn(mount_source)

    if is_custom_cdn(access_cdn):
        return f"{join_url(access_cdn, GITHUB_RAW_HOST, repository, branch)}/"

    if access_cdn == "raw":
        return f"{join_url(GITHUB_RAW_BASE_URL, repository, branch)}/"

    return f"{JSDELIVR_BASE_URL}/gh/{repository}@{branch}/"


def is_usable_external_file_url(value: Any, mount_source: Dict[str, Any]) -> bool:
    """校验外部索引里的文件地址：必须是绝对地址且命中期望前缀。"""
    if not isinstance(value, str):
        return False

    url = value.strip()

    if not url or url in ("undefined", "null"):
        return False

    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if not parsed.scheme:
        return False

    return url.startswith(get_expected_file_url_prefix(mount_source))


def get_node_path_from_id(node_id: str) -> str:
    """节点 ID → 路径（与前端 getNodePathFromId 一致）。"""
    if node_id == "root":
        return "/"

    return re.sub(r"/+", "/", f"/{node_id}")


def get_relative_external_node_id(old_id: str, external_root_id: str) -> str:
    """去掉外部索引根节点前缀。"""
    if old_id == external_root_id:
        return ""

    if external_root_id != "root" and old_id.startswith(f"{external_root_id}/"):
        return old_id[len(external_root_id) + 1 :]

    return old_id


def join_mounted_node_id(mount_point_path: str, relative_id: str) -> str:
    """把外部相对 ID 拼到挂载点 ID 上。"""
    if not relative_id:
        return mount_point_path
    if mount_point_path == "root":
        return relative_id

    return re.sub(r"/+", "/", f"{mount_point_path}/{relative_id}")


# ────────────── 索引读取与抓取 ──────────────


def read_json_file(path: str) -> Any:
    """读取 JSON 文件。"""
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def fetch_external_index(
    mount_source: Dict[str, Any],
    use_cdn_index: bool,
) -> Dict[str, Any]:
    """
    抓取外部挂载源索引（分支回退 main → master）。

    所有网络访问集中在本函数，便于测试替换。
    """
    branch = mount_source.get("branch")
    branches = [branch] if isinstance(branch, str) and branch else list(BRANCH_FALLBACK)
    errors: List[str] = []

    for candidate in branches:
        url = build_external_index_url({**mount_source, "branch": candidate}, use_cdn_index)

        try:
            request = Request(
                url,
                headers={"User-Agent": "share-file-files-manifest"},
            )
            with urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # 单个分支失败继续尝试下一个
            errors.append(f"{candidate}: {error}")

    raise RuntimeError(f"无法从任何分支加载外部索引: {', '.join(errors)}")


def read_cdn_nodes(cdn_path: str, logger: Logger) -> Dict[str, Any]:
    """读取 CDN 索引的节点表（缺失时返回空表）。"""
    if not os.path.exists(cdn_path):
        logger.warning(f"未找到 CDN 索引，本地文件直链将为空: {cdn_path}")
        return {}

    cdn_data = read_json_file(cdn_path)
    nodes = cdn_data.get("nodes") if isinstance(cdn_data, dict) else None

    if not isinstance(nodes, dict):
        logger.warning(f"CDN 索引结构异常，本地文件直链将为空: {cdn_path}")
        return {}

    return nodes


def read_existing_rows(
    output_path: Optional[str],
    logger: Logger,
) -> List[Dict[str, Any]]:
    """读取既有清单行（输出文件缺失或损坏时返回空表，视为没有可保留的行）。"""
    if not output_path or not os.path.exists(output_path):
        return []

    rows: List[Dict[str, Any]] = []

    try:
        with open(output_path, "r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue

                row = json.loads(line)

                if isinstance(row, dict):
                    rows.append(row)
    except (OSError, ValueError) as error:
        logger.warning(f"既有清单不可读，本次不做失败保护: {output_path}: {error}")
        return []

    return rows


def group_rows_by_mount_point(
    rows: List[Dict[str, Any]],
) -> Dict[str, List[Dict[str, Any]]]:
    """按 mount_point 字段归类既有行（本地行的 mount_point 为 None，天然不参与保留）。"""
    grouped: Dict[str, List[Dict[str, Any]]] = {}

    for row in rows:
        mount_point = row.get("mount_point")

        if isinstance(mount_point, str) and mount_point:
            grouped.setdefault(mount_point, []).append(row)

    return grouped


def collect_retainable_rows(
    existing_rows: List[Dict[str, Any]],
    emitted_ids: Set[str],
) -> List[Dict[str, Any]]:
    """
    从既有行中挑出可保留的行：按 mount_point 匹配，ID 与已生成行冲突时以新生成的行为准。

    命中的 ID 会写入 emitted_ids，避免同一节点被后续挂载源重复输出。
    """
    retained: List[Dict[str, Any]] = []

    for row in existing_rows:
        row_id = row.get("id")

        if not isinstance(row_id, str) or not isinstance(row.get("path"), str):
            continue

        if row_id in emitted_ids:
            continue

        emitted_ids.add(row_id)
        retained.append(row)

    return retained


def iter_mount_points(
    local_nodes: Dict[str, Any],
) -> Iterator[Tuple[str, Dict[str, Any]]]:
    """按节点 ID 顺序遍历本地索引中的外部挂载点。"""
    for node_id in sorted(local_nodes):
        node = local_nodes[node_id]

        if not isinstance(node, dict) or node.get("type") != "folder":
            continue

        mount_source = get_mount_source(node)

        if mount_source:
            yield node_id, mount_source


def collect_subtree_ids(nodes: Dict[str, Any], root_id: str) -> List[str]:
    """收集子树内的全部节点 ID。"""
    collected: List[str] = []
    visited = set()
    pending = [root_id]

    while pending:
        node_id = pending.pop()

        if node_id in visited:
            continue

        node = nodes.get(node_id)

        if not isinstance(node, dict):
            continue

        visited.add(node_id)
        collected.append(node_id)

        children = node.get("children")

        if isinstance(children, list):
            pending.extend(child for child in children if isinstance(child, str))

    return collected


def select_external_nodes(
    external_data: Any,
    sub_path: str,
) -> Tuple[Dict[str, Any], List[str], str]:
    """按 sub_path 过滤外部索引，返回（节点表, 选中节点 ID, 外部根节点 ID）。"""
    if not isinstance(external_data, dict):
        raise ValueError("外部索引不是 JSON 对象")

    nodes = external_data.get("nodes")

    if not isinstance(nodes, dict):
        raise ValueError("外部索引缺少 nodes")

    if sub_path == "/":
        return nodes, list(nodes.keys()), external_data.get("root_id") or "root"

    clean_sub_path = sub_path if sub_path.startswith("/") else f"/{sub_path}"
    path_index = external_data.get("path_index")
    external_root_id = (
        path_index.get(clean_sub_path) if isinstance(path_index, dict) else None
    )

    if not isinstance(external_root_id, str) or external_root_id not in nodes:
        raise ValueError(f"外部源中不存在路径: {clean_sub_path}")

    return nodes, collect_subtree_ids(nodes, external_root_id), external_root_id


# ────────────── 清单构建 ──────────────


def is_manifest_file_node(node: Any) -> bool:
    """物理文件节点（虚拟重定向节点不进清单）。"""
    return (
        isinstance(node, dict)
        and node.get("type") == "file"
        and not node.get("redirect_url")
    )


def build_row(
    node_id: str,
    node: Dict[str, Any],
    path: str,
    url: Optional[str],
    source: str,
    mount_point: Optional[str],
) -> Dict[str, Any]:
    """构建清单行（字段固定）。"""
    name = node.get("name")

    if not isinstance(name, str) or not name:
        name = node_id.rsplit("/", 1)[-1]

    return {
        "id": node_id,
        "name": name,
        "path": path,
        "size": node.get("size"),
        "url": url,
        "source": source,
        "mount_point": mount_point,
    }


def resolve_local_url(
    node_id: str,
    cdn_nodes: Dict[str, Any],
    cdn_base_url: Optional[str],
) -> Optional[str]:
    """本地文件直链：优先取 CDN 索引，其次按显式 CDN 基址兜底。"""
    cdn_node = cdn_nodes.get(node_id)
    url = cdn_node.get("url") if isinstance(cdn_node, dict) else None

    if isinstance(url, str) and url.strip():
        return url

    if not cdn_base_url:
        return None

    encoded_path = "/".join(quote(part, safe="") for part in node_id.split("/"))

    return f"{cdn_base_url}/{encoded_path}"


def build_external_rows(
    mount_point_id: str,
    mount_source: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """抓取并重写单个外部挂载源的文件行。"""
    use_cdn_index = bool(mount_source.get("use_cdn_index"))
    sub_path = mount_source.get("sub_path")

    if not isinstance(sub_path, str) or not sub_path:
        sub_path = "/"

    external_data = fetch_external_index(mount_source, use_cdn_index)
    nodes, selected_ids, external_root_id = select_external_nodes(external_data, sub_path)
    rows: List[Dict[str, Any]] = []

    for old_id in selected_ids:
        node = nodes.get(old_id)

        if not is_manifest_file_node(node):
            continue

        new_id = join_mounted_node_id(
            mount_point_id,
            get_relative_external_node_id(old_id, external_root_id),
        )
        url = node.get("url")

        if not is_usable_external_file_url(url, mount_source):
            url = build_external_file_url(mount_source, old_id)

        rows.append(
            build_row(
                new_id,
                node,
                get_node_path_from_id(new_id),
                url,
                "external",
                mount_point_id,
            )
        )

    return rows


def build_manifest_rows(
    data_dir: str,
    cdn_base_url: Optional[str],
    offline: bool,
    logger: Logger,
    output_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    构建 files.jsonl 行：本地节点在前，外部挂载节点按挂载点 ID 顺序追加。

    非离线模式下某个挂载源抓取失败（含 sub_path 缺失）时，保留输出文件里属于该
    mount_point 的既有行，避免一次 CDN 抖动就把整源的文件从清单里删掉。
    """
    local_path = os.path.join(data_dir, "share-file.json")
    cdn_path = os.path.join(data_dir, "share-file.cdn.json")

    local_data = read_json_file(local_path)
    local_nodes = local_data.get("nodes") if isinstance(local_data, dict) else None

    if not isinstance(local_nodes, dict):
        raise ValueError(f"share-file.json 结构异常: {local_path}")

    cdn_nodes = read_cdn_nodes(cdn_path, logger)
    path_index = local_data.get("path_index")
    path_by_id = (
        {
            node_id: path
            for path, node_id in path_index.items()
            if isinstance(path, str) and isinstance(node_id, str)
        }
        if isinstance(path_index, dict)
        else {}
    )

    rows: List[Dict[str, Any]] = []
    # 本地节点优先：与前端 mergeExternalNodes 的 ID 冲突规则一致
    emitted_ids = set(local_nodes.keys())

    for node_id, node in local_nodes.items():
        if not is_manifest_file_node(node):
            continue

        rows.append(
            build_row(
                node_id,
                node,
                path_by_id.get(node_id) or get_node_path_from_id(node_id),
                resolve_local_url(node_id, cdn_nodes, cdn_base_url),
                "local",
                None,
            )
        )

    existing_by_mount_point: Dict[str, List[Dict[str, Any]]] = {}

    if offline:
        logger.info("离线模式：跳过外部挂载源")
    else:
        existing_by_mount_point = group_rows_by_mount_point(
            read_existing_rows(output_path, logger)
        )

    if not offline:
        for mount_point_id, mount_source in iter_mount_points(local_nodes):
            try:
                external_rows = build_external_rows(mount_point_id, mount_source)
            except Exception as error:  # 单个挂载源失败不影响整体产出
                retained_rows = collect_retainable_rows(
                    existing_by_mount_point.get(mount_point_id, []),
                    emitted_ids,
                )

                if retained_rows:
                    rows.extend(retained_rows)
                    logger.warning(
                        f"外部挂载源 {mount_point_id} 本轮抓取失败，"
                        f"保留既有清单中的 {len(retained_rows)} 行: {error}"
                    )
                else:
                    logger.warning(f"跳过外部挂载源 {mount_point_id}: {error}")

                continue

            logger.debug(f"外部挂载源 {mount_point_id}: {len(external_rows)} 个文件")

            for row in external_rows:
                if row["id"] in emitted_ids:
                    continue

                emitted_ids.add(row["id"])
                rows.append(row)

    return sorted(rows, key=lambda row: (row["path"], row["id"]))


def write_manifest(output_path: str, rows: List[Dict[str, Any]]) -> None:
    """写入 JSONL，保证同一份数据两次运行字节一致。"""
    directory = os.path.dirname(output_path)

    if directory:
        os.makedirs(directory, exist_ok=True)

    with open(output_path, "w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(
                json.dumps(
                    row,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )
            handle.write("\n")


def normalize_cdn_base_url(value: str) -> str:
    """校验并规范化 CDN 基础 URL。"""
    trimmed = value.strip()

    if not trimmed:
        raise ValueError("CDN URL 不能为空。")

    parsed = urlparse(trimmed)

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(f"CDN URL 不是合法 URL: {trimmed}")

    return trimmed.rstrip("/")


def main() -> int:
    """主函数"""
    parser = argparse.ArgumentParser(
        description="根据 share-file.json / share-file.cdn.json 生成 files.jsonl 清单",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "data_dir",
        nargs="?",
        default=".",
        help="数据目录（含 share-file.json 与 share-file.cdn.json，默认: .）",
    )
    parser.add_argument(
        "output_file",
        nargs="?",
        help="输出文件路径（默认: {data_dir}/files.jsonl）",
    )
    parser.add_argument(
        "--cdn-url",
        help="CDN 基础 URL（仅在 CDN 索引缺少直链时兜底，也可用 SHARE_FILE_CDN_URL）",
    )
    parser.add_argument("--offline", action="store_true", help="只输出本地节点，不访问网络")
    parser.add_argument("--verbose", action="store_true", help="输出详细日志")

    args = parser.parse_args()

    logger = Logger(args.verbose)
    data_dir = os.path.abspath(args.data_dir)

    if not os.path.isdir(data_dir):
        logger.error(f"数据目录不存在: {data_dir}")
        return 1

    cdn_base_url = args.cdn_url or os.environ.get("SHARE_FILE_CDN_URL", "")

    if cdn_base_url:
        try:
            cdn_base_url = normalize_cdn_base_url(cdn_base_url)
        except ValueError as error:
            print(f"错误: {error}", file=sys.stderr)
            return 1
    else:
        cdn_base_url = None

    output_path = os.path.abspath(
        args.output_file or os.path.join(data_dir, "files.jsonl")
    )

    try:
        rows = build_manifest_rows(
            data_dir,
            cdn_base_url=cdn_base_url,
            offline=args.offline,
            logger=logger,
            output_path=output_path,
        )
        write_manifest(output_path, rows)
    except Exception as error:
        logger.error(f"发生错误: {error}")

        if args.verbose:
            import traceback

            traceback.print_exc()

        return 1

    logger.success(f"已生成: {output_path}（{len(rows)} 行）")

    return 0


if __name__ == "__main__":
    sys.exit(main())
