export interface FileTypeInfo {
  iconClass: string;
  className: string;
  mime?: string;
}

export interface FileTypePlugin {
  supports(name: string, type: 'file' | 'folder'): boolean;
  getInfo(name: string, type: 'file' | 'folder'): FileTypeInfo;
}

const fileTypeMap: Record<string, FileTypeInfo> = {
  jpg: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/jpeg',
  },
  jpeg: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/jpeg',
  },
  png: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/png',
  },
  gif: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/gif',
  },
  svg: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/svg+xml',
  },
  webp: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/webp',
  },
  bmp: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/bmp',
  },
  ico: {
    iconClass: 'fas fa-file-image',
    className: 'image',
    mime: 'image/x-icon',
  },
  mp4: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/mp4',
  },
  mkv: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/x-matroska',
  },
  webm: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/webm',
  },
  avi: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/x-msvideo',
  },
  mov: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/quicktime',
  },
  flv: {
    iconClass: 'fas fa-file-video',
    className: 'video',
    mime: 'video/x-flv',
  },
  mp3: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/mpeg',
  },
  flac: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/flac',
  },
  wav: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/wav',
  },
  ogg: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/ogg',
  },
  aac: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/aac',
  },
  wma: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/x-ms-wma',
  },
  m4a: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
    mime: 'audio/mp4',
  },
  pdf: {
    iconClass: 'fas fa-file-pdf',
    className: 'document',
    mime: 'application/pdf',
  },
  doc: {
    iconClass: 'fas fa-file-word',
    className: 'document',
    mime: 'application/msword',
  },
  docx: {
    iconClass: 'fas fa-file-word',
    className: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  xls: {
    iconClass: 'fas fa-file-excel',
    className: 'document',
    mime: 'application/vnd.ms-excel',
  },
  xlsx: {
    iconClass: 'fas fa-file-excel',
    className: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  ppt: {
    iconClass: 'fas fa-file-powerpoint',
    className: 'document',
    mime: 'application/vnd.ms-powerpoint',
  },
  pptx: {
    iconClass: 'fas fa-file-powerpoint',
    className: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  odt: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
    mime: 'application/vnd.oasis.opendocument.text',
  },
  ods: {
    iconClass: 'fas fa-file-excel',
    className: 'document',
    mime: 'application/vnd.oasis.opendocument.spreadsheet',
  },
  odp: {
    iconClass: 'fas fa-file-powerpoint',
    className: 'document',
    mime: 'application/vnd.oasis.opendocument.presentation',
  },
  epub: {
    iconClass: 'fas fa-book',
    className: 'document',
    mime: 'application/epub+zip',
  },
  mobi: {
    iconClass: 'fas fa-book',
    className: 'document',
    mime: 'application/x-mobipocket-ebook',
  },
  txt: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
    mime: 'text/plain',
  },
  md: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
    mime: 'text/markdown',
  },
  json: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'application/json',
  },
  xml: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'application/xml',
  },
  html: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/html',
  },
  htm: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/html',
  },
  css: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/css',
  },
  js: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/javascript',
  },
  mjs: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/javascript',
  },
  cjs: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/javascript',
  },
  ts: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/typescript',
  },
  tsx: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/typescript-jsx',
  },
  jsx: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/javascript-jsx',
  },
  yaml: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/yaml',
  },
  yml: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/yaml',
  },
  toml: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/toml',
  },
  ini: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/plain',
  },
  cfg: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/plain',
  },
  conf: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/plain',
  },
  list: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/plain',
  },
  log: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
    mime: 'text/plain',
  },
  csv: {
    iconClass: 'fas fa-file-csv',
    className: 'document',
    mime: 'text/csv',
  },
  tsv: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
    mime: 'text/tab-separated-values',
  },
  reg: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/plain',
  },
  ps1: {
    iconClass: 'fas fa-terminal',
    className: 'code',
    mime: 'text/plain',
  },
  sh: {
    iconClass: 'fas fa-terminal',
    className: 'code',
    mime: 'text/plain',
  },
  bash: {
    iconClass: 'fas fa-terminal',
    className: 'code',
    mime: 'text/plain',
  },
  zsh: {
    iconClass: 'fas fa-terminal',
    className: 'code',
    mime: 'text/plain',
  },
  bat: {
    iconClass: 'fas fa-terminal',
    className: 'code',
    mime: 'text/plain',
  },
  py: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-python',
  },
  rb: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-ruby',
  },
  php: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-php',
  },
  java: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-java',
  },
  c: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-c',
  },
  cpp: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-c++',
  },
  h: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-c',
  },
  hpp: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-c++',
  },
  rs: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-rust',
  },
  go: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-go',
  },
  swift: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-swift',
  },
  kt: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-kotlin',
  },
  scala: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-scala',
  },
  lua: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-lua',
  },
  r: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-r',
  },
  sql: {
    iconClass: 'fas fa-database',
    className: 'code',
    mime: 'text/x-sql',
  },
  graphql: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'application/graphql',
  },
  vue: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-vue',
  },
  svelte: {
    iconClass: 'fas fa-file-code',
    className: 'code',
    mime: 'text/x-svelte',
  },
  zip: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/zip',
  },
  rar: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/vnd.rar',
  },
  '7z': {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/x-7z-compressed',
  },
  tar: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/x-tar',
  },
  gz: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/gzip',
  },
  bz2: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/x-bzip2',
  },
  xz: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/x-xz',
  },
  tgz: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
    mime: 'application/gzip',
  },
  exe: {
    iconClass: 'fas fa-cog',
    className: 'executable',
    mime: 'application/x-msdownload',
  },
  msi: {
    iconClass: 'fas fa-cog',
    className: 'executable',
    mime: 'application/x-msi',
  },
  app: {
    iconClass: 'fas fa-cog',
    className: 'executable',
  },
  apk: {
    iconClass: 'fas fa-cog',
    className: 'executable',
    mime: 'application/vnd.android.package-archive',
  },
  deb: {
    iconClass: 'fas fa-cog',
    className: 'executable',
    mime: 'application/x-debian-package',
  },
  rpm: {
    iconClass: 'fas fa-cog',
    className: 'executable',
    mime: 'application/x-rpm',
  },
  iso: {
    iconClass: 'fas fa-compact-disc',
    className: 'disk-image',
    mime: 'application/x-iso9660-image',
  },
  dmg: {
    iconClass: 'fas fa-compact-disc',
    className: 'disk-image',
    mime: 'application/x-apple-diskimage',
  },
  vhd: {
    iconClass: 'fas fa-compact-disc',
    className: 'disk-image',
    mime: 'application/octet-stream',
  },
  vmdk: {
    iconClass: 'fas fa-compact-disc',
    className: 'disk-image',
    mime: 'application/octet-stream',
  },
  ttf: {
    iconClass: 'fas fa-font',
    className: 'font',
    mime: 'font/ttf',
  },
  otf: {
    iconClass: 'fas fa-font',
    className: 'font',
    mime: 'font/otf',
  },
  woff: {
    iconClass: 'fas fa-font',
    className: 'font',
    mime: 'font/woff',
  },
  woff2: {
    iconClass: 'fas fa-font',
    className: 'font',
    mime: 'font/woff2',
  },
};

export const defaultFileTypePlugin: FileTypePlugin = {
  supports: () => true,
  getInfo(name, type) {
    if (type === 'folder') {
      return { iconClass: 'fas fa-folder', className: 'folder' };
    }

    if (name.toLowerCase().endsWith('.tar.gz')) {
      return { iconClass: 'fas fa-file-archive', className: 'archive' };
    }

    const ext = name.toLowerCase().split('.').pop() || '';
    return (
      fileTypeMap[ext] || { iconClass: 'fas fa-file', className: 'unknown' }
    );
  },
};
