export interface AudioTrack {
  artist?: string;
  name: string;
}

/**
 * 从文件名解析「艺术家 - 标题」（与旧 audioPlugin 一致）。
 */
export function parseAudioTitle(fileName: string): AudioTrack {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const [artistPart, titlePart] = baseName.split(' - ');

  if (titlePart) {
    return {
      artist: artistPart
        .replace(/^\d+\.\s*/, '')
        .split(';')
        .filter(Boolean)
        .join(' / '),
      name: titlePart,
    };
  }

  return { name: baseName };
}

export function formatList(values?: string[]): string | undefined {
  return values?.filter(Boolean).join(' / ') || undefined;
}

export function formatTrackNumber(value?: {
  no: number | null;
  of: number | null;
}): string | undefined {
  if (!value?.no) return undefined;

  return value.of ? `${value.no}/${value.of}` : String(value.no);
}

export function formatDuration(seconds?: number): string | undefined {
  if (!Number.isFinite(seconds) || !seconds) return undefined;

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, remainingSeconds]
      .map((part, index) =>
        index === 0 ? String(part) : String(part).padStart(2, '0'),
      )
      .join(':');
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function formatBitrate(bitsPerSecond?: number): string | undefined {
  if (!Number.isFinite(bitsPerSecond) || !bitsPerSecond) return undefined;

  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

export function formatSampleRate(
  samplesPerSecond?: number,
): string | undefined {
  if (!Number.isFinite(samplesPerSecond) || !samplesPerSecond) return undefined;

  return `${(samplesPerSecond / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
}

export function formatChannels(count?: number): string | undefined {
  if (!count) return undefined;

  if (count === 1) return '单声道';

  if (count === 2) return '立体声';

  return `${count} 声道`;
}
