export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function formatSize(bytes?: number | null): string {
  if (bytes === undefined || bytes === null) {
    return '未知大小';
  }

  if (bytes === 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes < 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

/**
 * 格式化文件大小单位
 */
export function formatFileSizeUnit(bytes: number): string {
  if (bytes < 1024) return 'B';
  if (bytes < 1024 * 1024) return 'KB';
  if (bytes < 1024 * 1024 * 1024) return 'MB';
  if (bytes < 1024 * 1024 * 1024 * 1024) return 'GB';
  return 'TB';
}

/**
 * 获取相对时间字符串
 */
export function getRelativeTime(dateString?: string): string {
  if (!dateString) return '';

  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // 今天
  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMinutes === 0) return '刚刚';
      return `${diffMinutes}分钟前`;
    }

    return `${diffHours}小时前`;
  }

  // 超过今天，显示完整日期
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function createIcon(iconClass: string): HTMLElement {
  const icon = document.createElement('i');
  icon.className = iconClass;
  return icon;
}

export function getBadgeLabel(
  className: string,
  mime?: string,
  description?: string,
): string {
  // 优先显示描述（如果提供）
  if (description && description.trim()) {
    return truncateText(description, 12);
  }

  // 优先显示 MIME 子类型（例如 'image/jpeg' -> 'jpeg'），并为常见复杂 MIME 提供映射
  if (mime) {
    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/epub+zip': 'epub',
      'application/vnd.rar': 'rar',
      'application/zip': 'zip',
      'application/x-7z-compressed': '7z',
      'application/x-tar': 'tar',
      'application/gzip': 'gz',
      'application/x-bzip2': 'bz2',
      'application/vnd.android.package-archive': 'apk',
      'application/x-debian-package': 'deb',
      'application/x-rpm': 'rpm',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        'pptx',
      'application/vnd.oasis.opendocument.text': 'odt',
      'application/vnd.oasis.opendocument.spreadsheet': 'ods',
      'application/vnd.oasis.opendocument.presentation': 'odp',
      'application/x-iso9660-image': 'iso',
      'application/x-apple-diskimage': 'dmg',
    };

    if (mimeMap[mime]) return mimeMap[mime];

    // 通用处理：取 '/' 之后的子类型，去掉 + 后缀
    let subtype = mime.split('/')[1] || '';
    subtype = subtype.split('+')[0];
    // 去掉前缀 vnd. 并把点替换为短横以保证短标签
    subtype = subtype.replace(/^vnd\./, '').replace(/\./g, '-');
    if (!subtype) return '?';
    // 限制长度，避免占位过大
    if (subtype.length > 8) subtype = subtype.slice(0, 8);
    return subtype.toLowerCase();
  }

  // 回退到基于 className 的短标签
  switch (className) {
    case 'image':
      return 'img';
    case 'video':
      return 'vid';
    case 'audio':
      return 'aud';
    case 'document':
      return 'doc';
    case 'code':
      return 'code';
    case 'archive':
      return 'arc';
    case 'font':
      return 'fnt';
    case 'executable':
      return 'exe';
    case 'disk-image':
      return 'iso';
    case 'folder':
      return 'dir';
    default:
      return '?';
  }
}

/**
 * 截断文本并在超过指定长度时添加省略号
 */
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text.trim();
  return text.trim().slice(0, maxLength - 3) + '...';
}
