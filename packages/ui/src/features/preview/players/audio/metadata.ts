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

export async function readAudioMetadata(
  fileUrl: string,
  fallbackMime: string | undefined,
  fallback: AudioTrack,
  signal: AbortSignal,
): Promise<AudioPreviewMetadata> {
  const { parseBlob, parseWebStream, selectCover } =
    await import('music-metadata');
  const response = await fetch(fileUrl, { signal });

  if (!response.ok) {
    throw new Error(`Metadata request failed: ${response.status}`);
  }

  const mimeType = getResponseMimeType(response, fallbackMime);
  const options = { duration: false, skipPostHeaders: true };
  const metadata =
    response.body && mimeType
      ? await parseWebStream(response.body, mimeType, options)
      : await parseBlob(await response.blob(), options);

  return mapAudioMetadata(
    metadata,
    fallback,
    createCoverUrl(selectCover(metadata.common.picture)),
  );
}
