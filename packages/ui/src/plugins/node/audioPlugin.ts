import Amplitude, { AmplitudeSong } from 'amplitudejs';
import {
  parseBlob,
  parseWebStream,
  selectCover,
  type IAudioMetadata,
} from 'music-metadata';
import { createNodePlugin } from '../../utils/nodePluginFactory';
import { NodePluginPreviewInput } from './types';

interface AudioPreviewMetadata {
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

interface TimedLyricText {
  time: number;
  text: string;
  order: number;
}

interface SyncedLyricLine {
  time: number;
  lyric: string;
  translation?: string;
}

function parseAudioTitle(
  fileName: string,
): Pick<AmplitudeSong, 'artist' | 'name'> {
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

function formatList(values?: string[]): string | undefined {
  return values?.filter(Boolean).join(' / ') || undefined;
}

function formatTrackNumber(value?: {
  no: number | null;
  of: number | null;
}): string | undefined {
  if (!value?.no) return undefined;
  return value.of ? `${value.no}/${value.of}` : String(value.no);
}

function formatDuration(seconds?: number): string | undefined {
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

function formatBitrate(bitsPerSecond?: number): string | undefined {
  if (!Number.isFinite(bitsPerSecond) || !bitsPerSecond) return undefined;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

function formatSampleRate(samplesPerSecond?: number): string | undefined {
  if (!Number.isFinite(samplesPerSecond) || !samplesPerSecond) return undefined;
  return `${(samplesPerSecond / 1000).toFixed(1).replace(/\.0$/, '')} kHz`;
}

function formatChannels(count?: number): string | undefined {
  if (!count) return undefined;
  if (count === 1) return '单声道';
  if (count === 2) return '立体声';
  return `${count} 声道`;
}

function parseLyricTimestamp(value: RegExpExecArray): number {
  const minutes = Number(value[1]);
  const seconds = Number(value[2]);
  const millisecondText = value[3] || '0';
  const milliseconds = Number(millisecondText.padEnd(3, '0').slice(0, 3));

  return minutes * 60 + seconds + milliseconds / 1000;
}

function getLyricOffsetSeconds(text: string): number {
  const offsetMatch = /^\s*\[offset:([+-]?\d+)\]/im.exec(text);

  return offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
}

function parseLrcText(text: string, startOrder: number): TimedLyricText[] {
  const lines: TimedLyricText[] = [];
  const offset = getLyricOffsetSeconds(text);
  let order = startOrder;

  for (const rawLine of text.split(/\r?\n/)) {
    const timestampRegex = /\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;
    const matches = Array.from(rawLine.matchAll(timestampRegex));
    const content = rawLine.replace(timestampRegex, '').trim();

    if (matches.length === 0 || !content) continue;

    for (const match of matches) {
      lines.push({
        time: Math.max(0, parseLyricTimestamp(match) + offset),
        text: content,
        order,
      });
    }

    order += 1;
  }

  return lines;
}

function toTextArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(item => toTextArray(item));

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return ['text', 'lyrics', 'description']
      .flatMap(key => toTextArray(record[key]))
      .filter(Boolean);
  }

  return [];
}

function getNativeLyricTexts(metadata: IAudioMetadata): string[] {
  const lyricTags = new Set([
    'lyrics',
    'unsyncedlyrics',
    'syncedlyrics',
    'uslt',
    'sylt',
  ]);
  const texts: string[] = [];

  for (const tags of Object.values(metadata.native)) {
    for (const tag of tags) {
      const tagId = tag.id.toLowerCase();

      if (!lyricTags.has(tagId) && !tagId.includes('lyric')) continue;

      texts.push(...toTextArray(tag.value));
    }
  }

  return texts;
}

function extractLyrics(metadata: IAudioMetadata): SyncedLyricLine[] {
  const timedTexts: TimedLyricText[] = [];
  let order = 0;

  for (const lyric of metadata.common.lyrics || []) {
    if (lyric.syncText?.length) {
      for (const item of lyric.syncText) {
        if (!item.text?.trim() || item.timestamp === undefined) continue;

        timedTexts.push({
          time: item.timestamp,
          text: item.text.trim(),
          order,
        });
        order += 1;
      }
    }

    if (lyric.text) {
      const parsed = parseLrcText(lyric.text, order);

      timedTexts.push(...parsed);
      order += parsed.length;
    }
  }

  for (const text of getNativeLyricTexts(metadata)) {
    const parsed = parseLrcText(text, order);

    timedTexts.push(...parsed);
    order += parsed.length;
  }

  const groupedLyrics = new Map<
    number,
    { time: number; order: number; texts: string[] }
  >();

  for (const item of timedTexts.sort(
    (left, right) => left.time - right.time || left.order - right.order,
  )) {
    const key = Math.round(item.time * 1000);
    const group = groupedLyrics.get(key) || {
      time: key / 1000,
      order: item.order,
      texts: [],
    };

    if (!group.texts.includes(item.text)) group.texts.push(item.text);
    group.order = Math.min(group.order, item.order);
    groupedLyrics.set(key, group);
  }

  return Array.from(groupedLyrics.values())
    .sort((left, right) => left.time - right.time || left.order - right.order)
    .map(group => ({
      time: group.time,
      lyric: group.texts[0],
      translation:
        group.texts.length > 1 ? group.texts.slice(1).join(' / ') : undefined,
    }))
    .filter(line => Boolean(line.lyric));
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
  input: NodePluginPreviewInput,
): string | undefined {
  return (
    response.headers.get('content-type')?.split(';')[0]?.trim() ||
    input.nodeTypeInfo.mime
  );
}

function isUsableAudioUrl(fileUrl: string): boolean {
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

function mapAudioMetadata(
  metadata: IAudioMetadata,
  fallback: Pick<AmplitudeSong, 'artist' | 'name'>,
): AudioPreviewMetadata {
  const { common, format } = metadata;
  const cover = selectCover(common.picture);
  const lyrics = extractLyrics(metadata);
  const coverData = cover ? new Uint8Array(cover.data.byteLength) : undefined;
  if (cover && coverData) coverData.set(cover.data);
  const coverUrl =
    cover && coverData
      ? URL.createObjectURL(new Blob([coverData], { type: cover.format }))
      : undefined;
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

async function readAudioMetadata(
  input: NodePluginPreviewInput,
  fallback: Pick<AmplitudeSong, 'artist' | 'name'>,
  signal: AbortSignal,
): Promise<AudioPreviewMetadata> {
  const response = await fetch(input.fileUrl, { signal });

  if (!response.ok) {
    throw new Error(`Metadata request failed: ${response.status}`);
  }

  const mimeType = getResponseMimeType(response, input);
  const options = { duration: false, skipPostHeaders: true };
  const metadata =
    response.body && mimeType
      ? await parseWebStream(response.body, mimeType, options)
      : await parseBlob(await response.blob(), options);

  return mapAudioMetadata(metadata, fallback);
}

function stopWhenDetached(element: HTMLElement, cleanup: () => void): void {
  const observer = new MutationObserver(() => {
    if (document.body.contains(element)) return;

    const audio = Amplitude.getAudio();

    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    cleanup();
    observer.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function createMetadataRow(
  label: string,
  value?: string | number,
): HTMLElement | null {
  if (value === undefined || value === '') return null;

  const row = document.createElement('div');
  const term = document.createElement('dt');
  const description = document.createElement('dd');

  row.className = 'amplitude-preview-meta-row';
  term.textContent = label;
  description.textContent = String(value);
  row.append(term, description);

  return row;
}

function getActiveLyricIndex(
  lines: SyncedLyricLine[],
  currentTime: number,
): number {
  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time > currentTime + 0.12) break;
    activeIndex = index;
  }

  return activeIndex;
}

function renderLyrics(
  lines: SyncedLyricLine[],
  container: HTMLElement,
): HTMLElement[] {
  const rows = lines.map(line => {
    const row = document.createElement('div');
    const lyric = document.createElement('span');

    row.className = 'amplitude-preview-lyric-row';
    row.dataset.time = String(line.time);
    lyric.className = 'amplitude-preview-lyric-text';
    lyric.textContent = line.lyric;
    row.appendChild(lyric);

    if (line.translation) {
      const translation = document.createElement('span');

      translation.className = 'amplitude-preview-lyric-translation';
      translation.textContent = line.translation;
      row.appendChild(translation);
    }

    return row;
  });

  container.replaceChildren(...rows);

  return rows;
}

function bindLyricsSync(
  lines: SyncedLyricLine[],
  rows: HTMLElement[],
  container: HTMLElement,
): () => void {
  const audio = Amplitude.getAudio();
  let activeIndex = -1;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let isDragging = false;
  let suppressClick = false;

  const updateActiveLyric = () => {
    const nextIndex = getActiveLyricIndex(lines, audio.currentTime);

    if (nextIndex === activeIndex) return;

    if (activeIndex >= 0) {
      rows[activeIndex]?.classList.remove('active');
    }

    activeIndex = nextIndex;

    if (activeIndex < 0) return;

    const activeRow = rows[activeIndex];

    activeRow.classList.add('active');

    if (!isDragging) {
      activeRow.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;

    isDragging = true;
    suppressClick = false;
    dragStartY = event.clientY;
    dragStartScrollTop = container.scrollTop;
    container.classList.add('dragging');
    container.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!isDragging) return;

    const deltaY = event.clientY - dragStartY;

    if (Math.abs(deltaY) > 4) suppressClick = true;
    container.scrollTop = dragStartScrollTop - deltaY;
  };

  const stopDragging = (event: PointerEvent) => {
    if (!isDragging) return;

    isDragging = false;
    container.classList.remove('dragging');

    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }

    if (suppressClick) {
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };

  const onClick = (event: MouseEvent) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    const row = (event.target as HTMLElement).closest<HTMLElement>(
      '.amplitude-preview-lyric-row',
    );
    const rowIndex = row ? rows.indexOf(row) : -1;

    if (rowIndex < 0) return;

    audio.currentTime = lines[rowIndex].time;
    updateActiveLyric();
  };

  audio.addEventListener('timeupdate', updateActiveLyric);
  audio.addEventListener('seeked', updateActiveLyric);
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', stopDragging);
  container.addEventListener('pointercancel', stopDragging);
  container.addEventListener('click', onClick);
  updateActiveLyric();

  return () => {
    audio.removeEventListener('timeupdate', updateActiveLyric);
    audio.removeEventListener('seeked', updateActiveLyric);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', stopDragging);
    container.removeEventListener('pointercancel', stopDragging);
    container.removeEventListener('click', onClick);
  };
}

function renderAudioPreview(input: NodePluginPreviewInput): HTMLElement {
  const wrapper = document.createElement('div');
  const main = document.createElement('div');
  const artwork = document.createElement('div');
  const artworkIcon = document.createElement('i');
  const details = document.createElement('div');
  const header = document.createElement('div');
  const title = document.createElement('strong');
  const artist = document.createElement('span');
  const status = document.createElement('span');
  const metadataList = document.createElement('dl');
  const controls = document.createElement('div');
  const playButton = document.createElement('button');
  const timeline = document.createElement('div');
  const currentTime = document.createElement('span');
  const slider = document.createElement('input');
  const duration = document.createElement('span');
  const lyricsPanel = document.createElement('section');
  const lyricsTitle = document.createElement('div');
  const lyricsList = document.createElement('div');
  const controller = new AbortController();
  let detached = false;
  let coverUrl: string | undefined;
  let cleanupLyricsSync: (() => void) | undefined;
  const fileUrl = input.fileUrl.trim();
  const song = {
    ...parseAudioTitle(input.name),
    url: fileUrl,
  };

  wrapper.className = 'amplitude-preview';
  main.className = 'amplitude-preview-main';
  artwork.className = 'amplitude-preview-artwork';
  artworkIcon.className = 'fas fa-music';
  artwork.appendChild(artworkIcon);
  details.className = 'amplitude-preview-details';
  header.className = 'amplitude-preview-header';
  title.className = 'amplitude-preview-title';
  title.textContent = song.name;
  artist.className = 'amplitude-preview-artist';
  artist.textContent = song.artist || '未知艺术家';
  status.className = 'amplitude-preview-status';
  status.textContent = '正在读取内嵌元数据...';
  metadataList.className = 'amplitude-preview-meta';
  header.append(title, artist, status);
  lyricsPanel.className = 'amplitude-preview-lyrics';
  lyricsPanel.hidden = true;
  lyricsTitle.className = 'amplitude-preview-lyrics-title';
  lyricsTitle.textContent = '歌词';
  lyricsList.className = 'amplitude-preview-lyrics-list';
  lyricsPanel.append(lyricsTitle, lyricsList);

  controls.className = 'amplitude-preview-controls';
  playButton.className = 'amplitude-play-pause amplitude-preview-play';
  playButton.type = 'button';
  playButton.dataset.amplitudeSongIndex = '0';
  playButton.innerHTML =
    '<i class="fas fa-play"></i><i class="fas fa-pause"></i>';

  timeline.className = 'amplitude-preview-timeline';
  currentTime.className = 'amplitude-current-time';
  currentTime.dataset.amplitudeSongIndex = '0';
  currentTime.textContent = '00:00';
  slider.className = 'amplitude-song-slider';
  slider.dataset.amplitudeSongIndex = '0';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  duration.className = 'amplitude-duration-time';
  duration.dataset.amplitudeSongIndex = '0';
  duration.textContent = '00:00';
  timeline.append(currentTime, slider, duration);
  controls.append(playButton, timeline);
  details.append(header, metadataList, controls);
  main.append(artwork, details);
  wrapper.append(main, lyricsPanel);

  if (!isUsableAudioUrl(fileUrl)) {
    status.textContent = '音频地址无效，无法加载播放器';
    playButton.disabled = true;
    slider.disabled = true;
    return wrapper;
  }

  readAudioMetadata({ ...input, fileUrl }, song, controller.signal)
    .then(metadata => {
      if (detached) {
        if (metadata.coverUrl) URL.revokeObjectURL(metadata.coverUrl);
        return;
      }

      title.textContent = metadata.title || song.name;
      artist.textContent = metadata.artist || '未知艺术家';
      metadataList.replaceChildren(
        ...[
          createMetadataRow('专辑', metadata.album),
          createMetadataRow('专辑艺术家', metadata.albumArtist),
          createMetadataRow('年份', metadata.year),
          createMetadataRow('流派', metadata.genre),
          createMetadataRow('音轨', metadata.track),
          createMetadataRow('碟片', metadata.disk),
          createMetadataRow('格式', metadata.format),
          createMetadataRow('时长', metadata.duration),
          createMetadataRow('采样率', metadata.sampleRate),
          createMetadataRow('声道', metadata.channels),
          createMetadataRow('比特率', metadata.bitrate),
        ].filter((row): row is HTMLElement => row !== null),
      );

      if (metadata.coverUrl) {
        coverUrl = metadata.coverUrl;
        const image = document.createElement('img');

        image.alt = metadata.album
          ? `${metadata.album} 封面`
          : `${metadata.title || input.name} 封面`;
        image.src = metadata.coverUrl;
        artwork.replaceChildren(image);
      }

      if (metadata.lyrics.length > 0) {
        const lyricRows = renderLyrics(metadata.lyrics, lyricsList);

        lyricsPanel.hidden = false;
        cleanupLyricsSync?.();
        requestAnimationFrame(() => {
          if (detached) return;
          cleanupLyricsSync = bindLyricsSync(
            metadata.lyrics,
            lyricRows,
            lyricsList,
          );
        });
      }

      status.textContent =
        metadata.lyrics.length > 0
          ? '已读取内嵌元数据和同步歌词'
          : metadata.hasCommonTags
            ? '已读取内嵌元数据'
            : '未找到内嵌标签，已读取音频流信息';
    })
    .catch(() => {
      if (controller.signal.aborted) return;
      status.textContent = '未能读取内嵌元数据';
    });

  requestAnimationFrame(() => {
    Amplitude.init({
      preload: 'metadata',
      songs: [song],
    });
    stopWhenDetached(wrapper, () => {
      detached = true;
      controller.abort();
      cleanupLyricsSync?.();
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    });
  });

  return wrapper;
}

export const audioPlugin = createNodePlugin({
  id: 'audio',
  defaultInfo: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
  },
  extensions: {
    mp3: { mime: 'audio/mpeg' },
    flac: { mime: 'audio/flac' },
    wav: { mime: 'audio/wav' },
    ogg: { mime: 'audio/ogg' },
    aac: { mime: 'audio/aac' },
    wma: { mime: 'audio/x-ms-wma' },
    m4a: { mime: 'audio/mp4' },
  },
  preview: input => renderAudioPreview(input),
});
