import { getMountSourceAccessCdn } from '../share-file/accessors';
import type { MountSourceInfo, ShareFile } from '../share-file/schema';

export const GITHUB_RAW_HOST = 'raw.githubusercontent.com';
export const GITHUB_RAW_BASE_URL = `https://${GITHUB_RAW_HOST}`;

export function trimUrlSegment(segment: string): string {
  return segment.replace(/^\/+|\/+$/g, '');
}

export function joinUrl(baseUrl: string, ...segments: string[]): string {
  const normalizedBase = baseUrl.replace(/\/+$/g, '');
  const normalizedSegments = segments.map(trimUrlSegment).filter(Boolean);

  return [normalizedBase, ...normalizedSegments].join('/');
}

function buildCustomGithubCdnUrl(
  accessCdn: string,
  repository: string,
  branch: string,
  filePath: string,
): string {
  return joinUrl(accessCdn, GITHUB_RAW_HOST, repository, branch, filePath);
}

function isCustomCdn(accessCdn?: string): accessCdn is string {
  return Boolean(accessCdn && accessCdn !== 'jsdelivr' && accessCdn !== 'raw');
}

/**
 * 外部仓库索引文件地址（share-file.json / share-file.cdn.json）。
 */
export function buildExternalIndexUrl(
  mountSource: MountSourceInfo,
  useCdnIndex: boolean,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  const fileName = useCdnIndex ? 'share-file.cdn.json' : 'share-file.json';

  if (isCustomCdn(accessCdn)) {
    return buildCustomGithubCdnUrl(accessCdn, repository, branch, fileName);
  }

  if (accessCdn === 'raw') {
    return joinUrl(GITHUB_RAW_BASE_URL, repository, branch, fileName);
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${fileName}`;
}

/**
 * 外部文件地址：按挂载配置拼装 jsDelivr / raw / 自定义 CDN 直链。
 */
export function buildExternalFileUrl(
  mountSource: MountSourceInfo,
  nodeId: string,
): string {
  const { provider, repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (provider !== 'github') {
    throw new Error(`不支持的存储提供商: ${provider}`);
  }

  if (isCustomCdn(accessCdn)) {
    return buildCustomGithubCdnUrl(accessCdn, repository, branch, nodeId);
  }

  if (accessCdn === 'raw') {
    return joinUrl(GITHUB_RAW_BASE_URL, repository, branch, nodeId);
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/${trimUrlSegment(
    nodeId,
  )}`;
}

/**
 * 该挂载源下合法文件地址应有的前缀。
 */
export function getExpectedFileUrlPrefix(mountSource: MountSourceInfo): string {
  const { repository, branch = 'main' } = mountSource;
  const accessCdn = getMountSourceAccessCdn(mountSource);

  if (isCustomCdn(accessCdn)) {
    return `${joinUrl(accessCdn, GITHUB_RAW_HOST, repository, branch)}/`;
  }

  if (accessCdn === 'raw') {
    return `${joinUrl(GITHUB_RAW_BASE_URL, repository, branch)}/`;
  }

  return `https://cdn.jsdelivr.net/gh/${repository}@${branch}/`;
}

/**
 * 校验外部索引里的文件地址：必须是绝对地址且命中期望前缀，避免把第三方地址当直链用。
 */
export function isUsableExternalFileUrl(
  value: unknown,
  mountSource: MountSourceInfo,
): value is string {
  if (typeof value !== 'string') return false;

  const url = value.trim();

  if (!url || url === 'undefined' || url === 'null') return false;

  try {
    new URL(url);
  } catch {
    return false;
  }

  return url.startsWith(getExpectedFileUrlPrefix(mountSource));
}

/**
 * 使用 CDN 索引时，要求所有文件节点都带可用的 CDN 直链（虚拟重定向节点除外）。
 */
export function hasRequiredCdnFileUrls(
  data: ShareFile,
  mountSource: MountSourceInfo,
): boolean {
  return Object.values(data.nodes).every(node => {
    if (node.type !== 'file' || node.redirect_url) return true;

    return isUsableExternalFileUrl(node.url, mountSource);
  });
}
