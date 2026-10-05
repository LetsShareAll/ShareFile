// TODO(阶段⑤): 换成 domain/plugins 注册表，图标 / 类名 / MIME 全部由插件提供。
import { formatSize, getRelativeTime } from '../../domain/format';
import { getNodeFileUrl, getNodePageUrl } from '../../domain/links';
import type { ShareNode } from '../../domain/share-file';

export interface NodeDisplayInfo {
  iconClass: string;
  className: string;
  typeLabel: string;
  mime?: string;
}

export interface BrowseEmptyState {
  className: string;
  iconClass: string;
  text: string;
}

export const BROWSE_EMPTY_STATES: Record<
  'search' | 'missing' | 'directory',
  BrowseEmptyState
> = {
  search: {
    className: 'empty',
    iconClass: 'fas fa-search',
    text: '没有找到匹配项',
  },
  missing: {
    className: 'empty error',
    iconClass: 'fas fa-exclamation-triangle',
    text: '该路径不存在或已被移除',
  },
  directory: {
    className: 'empty',
    iconClass: 'fas fa-inbox',
    text: '此目录为空',
  },
};

type DisplayRule = readonly [string, string, string, string];

const DISPLAY_RULES: readonly DisplayRule[] = [
  ['image', 'fas fa-file-image', '图片', 'jpg jpeg png gif svg webp bmp ico'],
  ['video', 'fas fa-file-video', '视频', 'mp4 mkv webm avi mov flv'],
  ['audio', 'fas fa-file-audio', '音频', 'mp3 flac wav ogg aac wma m4a'],
  ['archive', 'fas fa-file-archive', '压缩包', 'zip rar 7z tar gz bz2 xz tgz'],
  ['disk-image', 'fas fa-compact-disc', '磁盘镜像', 'iso dmg vhd vmdk'],
  ['executable', 'fas fa-cog', '可执行文件', 'exe msi app apk deb rpm'],
  ['font', 'fas fa-font', '字体', 'ttf otf woff woff2'],
  [
    'document',
    'fas fa-file-alt',
    '文档',
    'doc docx xls xlsx ppt pptx odt ods odp epub mobi md pdf txt log csv tsv',
  ],
  [
    'code',
    'fas fa-file-code',
    '代码',
    'json xml html htm css js mjs cjs ts tsx jsx yaml yml toml ini cfg conf list reg ps1 sh bash zsh bat py rb php java c cpp h hpp rs go swift kt scala lua r sql graphql vue svelte',
  ],
];

const EXTENSION_ICON_OVERRIDES: Record<string, string> = {
  pdf: 'fas fa-file-pdf',
  md: 'fas fa-file-alt',
  doc: 'fas fa-file-word',
  docx: 'fas fa-file-word',
  xls: 'fas fa-file-excel',
  xlsx: 'fas fa-file-excel',
  ppt: 'fas fa-file-powerpoint',
  pptx: 'fas fa-file-powerpoint',
  csv: 'fas fa-file-csv',
  ps1: 'fas fa-terminal',
};

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/typescript',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  iso: 'application/x-iso9660-image',
};

const EXTENSION_RULES = new Map<string, DisplayRule>(
  DISPLAY_RULES.flatMap(rule =>
    rule[3].split(' ').map(extension => [extension, rule] as const),
  ),
);

export const DEFAULT_NODE_DESCRIPTION = '我也不知道这个文件是啥呢！(lll￢ω￢)';

export function resolveNodeDisplay(node: ShareNode): NodeDisplayInfo {
  if (node.type === 'folder') {
    return {
      iconClass: 'fas fa-folder',
      className: 'folder',
      typeLabel: '文件夹',
    };
  }

  const dot = node.name.lastIndexOf('.');
  const extension = dot > 0 ? node.name.slice(dot + 1).toLowerCase() : '';
  const [className, iconClass, typeLabel] = EXTENSION_RULES.get(extension) ?? [
    'unknown',
    'fas fa-file',
    '文件',
  ];

  return {
    iconClass: EXTENSION_ICON_OVERRIDES[extension] ?? iconClass,
    className,
    typeLabel,
    mime: EXTENSION_MIME[extension],
  };
}

export interface NodeRow {
  node: ShareNode;
  path: string;
  display: NodeDisplayInfo;
  pageUrl: string;
  fileUrl: string;
}

function toAbsolute(href: string): string {
  return new URL(href, window.location.origin).href;
}

export function createNodeRow(node: ShareNode, path: string): NodeRow {
  return {
    node,
    path,
    display: resolveNodeDisplay(node),
    pageUrl: toAbsolute(getNodePageUrl(path)),
    fileUrl: toAbsolute(getNodeFileUrl(node)),
  };
}

export function getNodeMetaText(
  row: NodeRow,
  mode: 'icon' | 'detail' = 'icon',
): string {
  const { node, display } = row;

  if (node.type === 'folder') return `${node.children.length} 项`;

  return [
    mode === 'detail' ? display.typeLabel : '',
    mode === 'detail' ? (display.mime ?? '') : '',
    formatSize(node.size),
    node.updated_at ? getRelativeTime(node.updated_at) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatHashPreview(value: string): string {
  if (value.length <= 18) return value;

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
