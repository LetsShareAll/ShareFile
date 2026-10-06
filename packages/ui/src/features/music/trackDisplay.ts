import { parseAudioTitle } from '../preview/players/audio/format';

export interface TrackDisplay {
  title: string;
  artist?: string;
}

/**
 * 列表与悬浮卡共用的显示名：复用音频预览的「艺术家 - 标题」解析
 * （序号前缀、分号分隔的多艺术家都在那里处理），
 * 没有分隔符时回落成去掉扩展名的文件名。
 */
export function getTrackDisplay(track: { name: string }): TrackDisplay {
  const { name, artist } = parseAudioTitle(track.name);

  return artist ? { title: name, artist } : { title: name };
}
