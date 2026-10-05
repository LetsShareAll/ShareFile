import type { IAudioMetadata } from 'music-metadata';

export interface SyncedLyricLine {
  time: number;
  lyric: string;
  translation?: string;
}

interface TimedLyricText {
  time: number;
  text: string;
  order: number;
}

const LYRIC_TAG_IDS = new Set([
  'lyrics',
  'unsyncedlyrics',
  'syncedlyrics',
  'uslt',
  'sylt',
]);

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
  const texts: string[] = [];

  for (const [tagId, values] of Object.entries(metadata.native)) {
    const id = tagId.toLowerCase();

    if (!LYRIC_TAG_IDS.has(id) && !id.includes('lyric')) continue;

    values.forEach(value => texts.push(...toTextArray(value)));
  }

  return texts;
}

export function extractLyrics(metadata: IAudioMetadata): SyncedLyricLine[] {
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

export function getActiveLyricIndex(
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
