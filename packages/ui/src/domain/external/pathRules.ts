import { getNodePathFromId } from '../paths';
import type { ShareNode } from '../share-file/schema';

/**
 * 挂载源准入清单（`allow_paths` / `deny_paths`）的匹配语义，与构建期
 * `packages/cli/lib/mount_filter.py` 逐条对齐。
 *
 * 匹配对象是**外挂索引里节点 ID 对应的路径**（外挂源自身坐标系，含 `sub_path`
 * 前缀）；挂载点在本地树里的位置不参与匹配。命中判定为
 * `path === rule || path.startsWith(rule + '/')`：`/a` 命中 `/a` 与 `/a/b`，
 * 但不命中 `/ab`。
 *
 * 特例：规范化后的 `/` 视为整个源——`deny_paths: ['/']` 的意图显然是「这个源
 * 什么都不放行」，若按字面公式只命中根节点自身，就成了「写了根路径却什么都没拦」
 * 的坑。规则先做与 `normalize_path_prefix` 相同的规范化（补前导 `/`、去尾斜杠），
 * 因此 `docs/` 这类宽松写法在两侧得到同一结果。
 */
export function matchesPathRule(
  path: string,
  rules: readonly string[] | undefined,
): boolean {
  if (!rules?.length) return false;

  return rules.some(rule => {
    const prefix = normalizePathPrefix(rule);

    if (!prefix) return false;
    if (prefix === '/') return true;

    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/** 规范化路径前缀：补前导 `/`、去尾斜杠；空白串返回 null（与构建期一致）。 */
export function normalizePathPrefix(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

/**
 * 准入判定：deny 优先于 allow；allow 为空表示不限制，非空时必须命中。
 */
export function isExternalPathAllowed(
  path: string,
  allowPaths?: readonly string[],
  denyPaths?: readonly string[],
): boolean {
  if (matchesPathRule(path, denyPaths)) return false;

  return !allowPaths?.length || matchesPathRule(path, allowPaths);
}

/**
 * 按准入清单剔除节点：命中即剔除该节点及其整棵子树（返回新映射，不改入参）。
 *
 * 入参是外挂源自身坐标系下的节点映射（ID 即源内路径）。挂载根本身不参与判定
 * ——它对应本地索引里声明挂载点的节点，挂不挂由本地决定——但它的 children 会被
 * 剪成放行后的结果，因此被剔除的子树不会以任何形式残留。
 *
 * 过滤只影响前端呈现，**不是安全边界**：被剔除的节点在外挂源上依旧公开可达。
 */
export function filterExternalChildren(
  nodes: Record<string, ShareNode>,
  rootNodeId: string,
  allowPaths?: readonly string[],
  denyPaths?: readonly string[],
): Record<string, ShareNode> {
  const rootNode = nodes[rootNodeId];

  if (!rootNode || (!allowPaths?.length && !denyPaths?.length)) return nodes;

  const keptChildren = new Map<string, string[]>();
  const keptNodeIds: string[] = [];

  function visit(nodeId: string): void {
    const node = nodes[nodeId];

    if (!node) return;

    keptNodeIds.push(nodeId);

    const children = (node.children ?? []).filter(childId => {
      if (!nodes[childId]) return false;

      if (
        !isExternalPathAllowed(
          getNodePathFromId(childId),
          allowPaths,
          denyPaths,
        )
      ) {
        return false;
      }

      visit(childId);

      return true;
    });

    keptChildren.set(nodeId, children);
  }

  visit(rootNodeId);

  return Object.fromEntries(
    keptNodeIds.map(nodeId => [
      nodeId,
      { ...nodes[nodeId], children: keptChildren.get(nodeId) ?? [] },
    ]),
  );
}
