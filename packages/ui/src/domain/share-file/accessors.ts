import { MountSourceInfo, ShareFile } from './schema';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getNodeMountSource(node: unknown): MountSourceInfo | undefined {
  if (!isRecord(node)) return undefined;
  return node.mount_source as MountSourceInfo | undefined;
}

export function getShareFileRootId(shareFile: ShareFile): string {
  return shareFile.root_id;
}

export function getShareFilePathIndex(
  shareFile: ShareFile,
): Record<string, string> {
  return shareFile.path_index;
}

export function getMountSourceSubPath(
  mountSource: MountSourceInfo,
): string | undefined {
  return mountSource.sub_path;
}

export function getMountSourceAccessCdn(
  mountSource: MountSourceInfo,
): string | undefined {
  return mountSource.access_cdn;
}

export function getMountSourceUseCdnIndex(
  mountSource: MountSourceInfo,
): boolean | undefined {
  return mountSource.use_cdn_index;
}
