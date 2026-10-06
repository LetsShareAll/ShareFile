import { describe, expect, it } from 'vitest';

import { getTrackDisplay } from '@/features/music/trackDisplay';

describe('getTrackDisplay', () => {
  it('拆出「艺术家 - 标题」', () => {
    expect(getTrackDisplay({ name: '周杰伦 - 晴天.flac' })).toEqual({
      title: '晴天',
      artist: '周杰伦',
    });
  });

  it('带序号前缀时艺术家去掉 `102. `，标题不受影响', () => {
    expect(
      getTrackDisplay({ name: '102. HOYO-MiX - 使一颗心免于哀伤.flac' }),
    ).toEqual({ title: '使一颗心免于哀伤', artist: 'HOYO-MiX' });
  });

  it('分号分隔的多艺术家合成一个展示串', () => {
    expect(
      getTrackDisplay({
        name: '101. 知更鸟;HOYO-MiX;Chevy - 在银河中孤独摇摆.flac',
      }),
    ).toEqual({
      title: '在银河中孤独摇摆',
      artist: '知更鸟 / HOYO-MiX / Chevy',
    });
  });

  it('没有分隔符时回退为去扩展名的文件名，不带艺术家', () => {
    expect(getTrackDisplay({ name: '无分隔符的作品.mp3' })).toEqual({
      title: '无分隔符的作品',
    });
  });

  it('只去掉最后一段扩展名', () => {
    expect(getTrackDisplay({ name: 'Artist - Title.with.dots.flac' })).toEqual({
      title: 'Title.with.dots',
      artist: 'Artist',
    });
  });

  it('本来就没有扩展名时原样返回', () => {
    expect(getTrackDisplay({ name: '没有扩展名' })).toEqual({
      title: '没有扩展名',
    });
  });
});
