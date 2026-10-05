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

export function formatFileSizeUnit(bytes: number): string {
  if (bytes < 1024) return 'B';
  if (bytes < 1024 * 1024) return 'KB';
  if (bytes < 1024 * 1024 * 1024) return 'MB';
  if (bytes < 1024 * 1024 * 1024 * 1024) return 'GB';

  return 'TB';
}

/**
 * 相对时间：当天内给出「刚刚 / N分钟前 / N小时前」，更早给出 zh-CN 完整日期。
 */
export function getRelativeTime(
  dateString?: string,
  now: Date = new Date(),
): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      if (diffMinutes === 0) return '刚刚';

      return `${diffMinutes}分钟前`;
    }

    return `${diffHours}小时前`;
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
