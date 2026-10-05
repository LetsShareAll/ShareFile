import type { AudioPreviewMetadata } from './metadata';

export interface MetaRow {
  label: string;
  value: string | number;
}

function toMetaRow(label: string, value?: string | number): MetaRow | null {
  if (value === undefined || value === '') return null;

  return { label, value };
}

export function buildMetaRows(metadata: AudioPreviewMetadata): MetaRow[] {
  return [
    toMetaRow('专辑', metadata.album),
    toMetaRow('专辑艺术家', metadata.albumArtist),
    toMetaRow('年份', metadata.year),
    toMetaRow('流派', metadata.genre),
    toMetaRow('音轨', metadata.track),
    toMetaRow('碟片', metadata.disk),
    toMetaRow('格式', metadata.format),
    toMetaRow('时长', metadata.duration),
    toMetaRow('采样率', metadata.sampleRate),
    toMetaRow('声道', metadata.channels),
    toMetaRow('比特率', metadata.bitrate),
  ].filter((row): row is MetaRow => row !== null);
}
