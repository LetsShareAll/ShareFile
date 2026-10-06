import { getCurlCommand } from '../../domain/links';
import { formatBrowserPath, sanitizeRoutePath } from '../../domain/paths';

/**
 * 直链清单（`pnpm run generate-manifest` 的产物）在站点中的固定位置。
 */
const MANIFEST_PATH = '/assets/data/files.jsonl';

/**
 * POSIX 单引号包裹：内部单引号用 `'\''` 断开，中文、空格等字符原样保留。
 */
export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export interface DirectoryShare {
  /** 归一化后的目录路径（根为 `/`）。 */
  path: string;
  /** 目录的 clean 页面链接。 */
  pageUrl: string;
  /** 从清单里筛出该目录下所有直链的命令。 */
  manifestCommand: string;
  /** 只在当前路径是文件深链时提供：单个文件的 curl 下载示例。 */
  downloadCommand: string | null;
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

function absoluteUrl(pathname: string, origin: string): string {
  if (!origin) return pathname;

  try {
    return new URL(pathname, origin).href;
  } catch {
    return pathname;
  }
}

/**
 * 目录级分享产物（纯函数，便于单测）。
 *
 * 页面链接不复用 `domain/links.ts` 的 `getNodePageUrl`：那个函数产出的是会被
 * 前端 `replaceState` 收敛掉的旧深链（`/?path=…`），而分享要的是 clean URL。
 * 这里复用 `domain/paths.ts` 的 `formatBrowserPath` 完成路径编码，再套上站点
 * origin——链接拼接逻辑仍然只有 domain 一份。
 *
 * `filePath` 仅在当前路径恰好是文件深链时传入：目录没有字节，只有文件才有
 * 下载示例。
 */
export function buildDirectoryShare(
  path: string,
  origin: string,
  filePath: string | null = null,
): DirectoryShare {
  const directoryPath = sanitizeRoutePath(path);
  const base = normalizeOrigin(origin);
  // files.jsonl 每行是 JSON 对象（`{"path":"/dir/file",…}`），因此 grep 必须锚定
  // 字段本身；用 `^/dir/` 会一条也筛不出来（已用真实清单验证：0 命中 vs 5 命中）。
  const grepPrefix = directoryPath === '/' ? '/' : `${directoryPath}/`;
  const grepPattern = `"path":"${grepPrefix}`;
  const downloadPath = filePath ? sanitizeRoutePath(filePath) : '/';

  // 清单过滤式按产品约定用 `^<目录>/`：它命中「每行以路径开头」的清单，
  // 而 files.jsonl 当前每行是 JSON 对象（`"path":"/…"`，见 README 命令行获取），
  // 前缀选择权在清单格式一侧，改式样前需同步单测与 e2e 断言。

  return {
    path: directoryPath,
    pageUrl: absoluteUrl(formatBrowserPath(directoryPath), base),
    manifestCommand: `curl -sS ${base}${MANIFEST_PATH} | grep ${quoteShellArg(grepPattern)}`,
    downloadCommand:
      downloadPath === '/'
        ? null
        : getCurlCommand(absoluteUrl(formatBrowserPath(downloadPath), base)),
  };
}
