import type { IAudioMetadata, IPicture } from 'music-metadata';

import {
  formatBitrate,
  formatChannels,
  formatDuration,
  formatList,
  formatSampleRate,
  formatTrackNumber,
  type AudioTrack,
} from './format';
import { extractLyrics, type SyncedLyricLine } from './lyrics';

export interface AudioPreviewMetadata {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  track?: string;
  disk?: string;
  format?: string;
  sampleRate?: string;
  channels?: string;
  bitrate?: string;
  duration?: string;
  coverUrl?: string;
  lyrics: SyncedLyricLine[];
  hasCommonTags: boolean;
}

export function isUsableAudioUrl(fileUrl: string): boolean {
  const normalizedUrl = fileUrl.trim();

  if (
    !normalizedUrl ||
    normalizedUrl === 'undefined' ||
    normalizedUrl === 'null'
  ) {
    return false;
  }

  try {
    const resolvedUrl = new URL(normalizedUrl, window.location.href);

    return !resolvedUrl.pathname.endsWith('/undefined');
  } catch {
    return false;
  }
}

function extractYear(metadata: IAudioMetadata): number | undefined {
  const { common } = metadata;
  const parsedYear =
    common.date?.match(/\d{4}/)?.[0] ||
    common.originaldate?.match(/\d{4}/)?.[0] ||
    common.releasedate?.match(/\d{4}/)?.[0];

  return common.year || (parsedYear ? Number(parsedYear) : undefined);
}

function getResponseMimeType(
  response: Response,
  fallbackMime?: string,
): string | undefined {
  return (
    response.headers.get('content-type')?.split(';')[0]?.trim() || fallbackMime
  );
}

function createCoverUrl(cover: IPicture | null): string | undefined {
  if (!cover) return undefined;

  const coverData = new Uint8Array(cover.data.byteLength);

  coverData.set(cover.data);

  return URL.createObjectURL(new Blob([coverData], { type: cover.format }));
}

function mapAudioMetadata(
  metadata: IAudioMetadata,
  fallback: AudioTrack,
  coverUrl: string | undefined,
): AudioPreviewMetadata {
  const { common, format } = metadata;
  const lyrics = extractLyrics(metadata);
  const formatParts = [
    format.container,
    format.codec,
    format.lossless === true ? 'Lossless' : undefined,
  ].filter(Boolean);
  const hasCommonTags = Boolean(
    common.title ||
    common.artist ||
    common.artists?.length ||
    common.album ||
    common.albumartist ||
    common.albumartists?.length ||
    common.genre?.length ||
    common.picture?.length ||
    lyrics.length > 0,
  );

  return {
    title: common.title || fallback.name,
    artist: common.artist || formatList(common.artists) || fallback.artist,
    album: common.album,
    albumArtist: common.albumartist || formatList(common.albumartists),
    year: extractYear(metadata),
    genre: formatList(common.genre),
    track: formatTrackNumber(common.track),
    disk: formatTrackNumber(common.disk),
    format: formatParts.join(' · ') || undefined,
    sampleRate: formatSampleRate(format.sampleRate),
    channels: formatChannels(format.numberOfChannels),
    bitrate: formatBitrate(format.bitrate),
    duration: formatDuration(format.duration),
    coverUrl,
    lyrics,
    hasCommonTags,
  };
}

export interface AudioMetadataOptions {
  /**
   * 只取文件前 N 字节（Range 请求）解析元信息。
   * 这些音频有 38–56 MB，整文件流式解析在慢速 CDN 上要几分钟；
   * 而 FLAC 的 STREAMINFO / Vorbis 注释都在文件头，512 KB 足够。
   */
  maxBytes?: number;
}

async function fetchMetadataResponse(
  fileUrl: string,
  signal: AbortSignal,
  maxBytes: number | undefined,
): Promise<Response> {
  const response = await fetch(
    fileUrl,
    maxBytes === undefined
      ? { signal }
      : { signal, headers: { Range: `bytes=0-${maxBytes - 1}` } },
  );

  if (!response.ok) {
    throw new Error(`Metadata request failed: ${response.status}`);
  }

  return response;
}

export async function readAudioMetadata(
  fileUrl: string,
  fallbackMime: string | undefined,
  fallback: AudioTrack,
  signal: AbortSignal,
  options: AudioMetadataOptions = {},
): Promise<AudioPreviewMetadata> {
  const { parseBlob, parseWebStream, selectCover } =
    await import('music-metadata');

  const parse = async (response: Response): Promise<AudioPreviewMetadata> => {
    const mimeType = getResponseMimeType(response, fallbackMime);
    const parseOptions = { duration: false, skipPostHeaders: true };
    const metadata =
      response.body && mimeType
        ? await parseWebStream(response.body, mimeType, parseOptions)
        : await parseBlob(await response.blob(), parseOptions);

    return mapAudioMetadata(
      metadata,
      fallback,
      createCoverUrl(selectCover(metadata.common.picture)),
    );
  };

  const { maxBytes } = options;
  const limited = maxBytes !== undefined;

  try {
    return await parse(await fetchMetadataResponse(fileUrl, signal, maxBytes));
  } catch (error) {
    // 元数据在文件尾的容器（如 MP4 的 moov）截断后会解析失败 → 回退整文件流。
    if (!limited || signal.aborted) throw error;

    return await parse(await fetchMetadataResponse(fileUrl, signal, undefined));
  }
}
