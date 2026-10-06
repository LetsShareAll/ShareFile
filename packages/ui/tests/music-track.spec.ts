import { describe, expect, it } from 'vitest';

import {
  buildQueueFromDirectory,
  formatDuration,
  getNextIndex,
  getPrevIndex,
  isAudioNode,
  parseMusicState,
  serializeMusicState,
  type MusicState,
  type MusicTrack,
} from '@/features/music/track';
import { makeNode } from './helpers';

function track(id: string, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id,
    name: `${id}.mp3`,
    path: `/${id}.mp3`,
    url: `/cdn/${id}.mp3`,
    ...overrides,
  };
}

describe('isAudioNode', () => {
  it('音频扩展名判定为音频', () => {
    expect(isAudioNode(makeNode('/music/a.mp3', 'file'))).toBe(true);
    expect(isAudioNode(makeNode('/music/b.flac', 'file'))).toBe(true);
  });

  it('目录与其他类型文件不是音频', () => {
    expect(isAudioNode(makeNode('/music', 'folder'))).toBe(false);
    expect(isAudioNode(makeNode('/pic/a.png', 'file'))).toBe(false);
  });
});

describe('buildQueueFromDirectory', () => {
  const getPath = (nodeId: string) => `/${nodeId.replace(/^\//, '')}`;
  const getUrl = (node: ReturnType<typeof makeNode>) => node.url ?? '/fallback';

  it('只保留音频并保持传入顺序', () => {
    const nodes = [
      makeNode('/m/a.mp3', 'file'),
      makeNode('/m/b.png', 'file'),
      makeNode('/m/sub', 'folder'),
      makeNode('/m/c.flac', 'file'),
    ];

    expect(
      buildQueueFromDirectory(nodes, getPath, getUrl).map(item => item.name),
    ).toEqual(['a.mp3', 'c.flac']);
  });

  it('带上站内路径、直链与体积 / 更新时间', () => {
    const nodes = [
      makeNode('music/a.mp3', 'file', {
        url: 'https://cdn.example.com/a.mp3',
        size: 2048,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ];

    expect(buildQueueFromDirectory(nodes, getPath, getUrl)).toEqual([
      {
        id: 'music/a.mp3',
        name: 'a.mp3',
        path: '/music/a.mp3',
        url: 'https://cdn.example.com/a.mp3',
        size: 2048,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('空目录返回空队列', () => {
    expect(buildQueueFromDirectory([], getPath, getUrl)).toEqual([]);
  });
});

describe('getNextIndex', () => {
  it('sequence：顺序推进，队尾返回 null', () => {
    expect(getNextIndex(3, 0, 'sequence')).toBe(1);
    expect(getNextIndex(3, 1, 'sequence')).toBe(2);
    expect(getNextIndex(3, 2, 'sequence')).toBeNull();
    expect(getNextIndex(3, -1, 'sequence')).toBe(0);
  });

  it('loop-all：队尾接队首', () => {
    expect(getNextIndex(3, 1, 'loop-all')).toBe(2);
    expect(getNextIndex(3, 2, 'loop-all')).toBe(0);
    expect(getNextIndex(3, -1, 'loop-all')).toBe(0);
  });

  it('loop-one：始终返回当前下标', () => {
    expect(getNextIndex(3, 1, 'loop-one')).toBe(1);
    expect(getNextIndex(1, 0, 'loop-one')).toBe(0);
    expect(getNextIndex(2, -1, 'loop-one')).toBe(0);
  });

  it('shuffle：随机且不重复上一首', () => {
    expect(getNextIndex(4, 1, 'shuffle', () => 0.5)).toBe(2);
    expect(getNextIndex(4, 2, 'shuffle', () => 0.5)).toBe(3);
    expect(getNextIndex(4, 3, 'shuffle', () => 1)).toBe(0);
    expect(getNextIndex(1, 0, 'shuffle', () => 0.9)).toBe(0);
  });

  it('空队列返回 null', () => {
    expect(getNextIndex(0, -1, 'sequence')).toBeNull();
    expect(getNextIndex(0, 0, 'loop-all')).toBeNull();
    expect(getNextIndex(0, 0, 'shuffle')).toBeNull();
  });
});

describe('getPrevIndex', () => {
  it('sequence：回退，队首返回 null', () => {
    expect(getPrevIndex(3, 2, 'sequence')).toBe(1);
    expect(getPrevIndex(3, 0, 'sequence')).toBeNull();
    expect(getPrevIndex(3, -1, 'sequence')).toBeNull();
  });

  it('loop-all：队首回队尾', () => {
    expect(getPrevIndex(3, 1, 'loop-all')).toBe(0);
    expect(getPrevIndex(3, 0, 'loop-all')).toBe(2);
  });

  it('loop-one 与 shuffle 的行为与 next 一致', () => {
    expect(getPrevIndex(3, 1, 'loop-one')).toBe(1);
    expect(getPrevIndex(4, 2, 'shuffle', () => 0.5)).toBe(3);
    expect(getPrevIndex(0, 0, 'sequence')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('分秒与小时格式', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7)).toBe('0:07');
    expect(formatDuration(187)).toBe('3:07');
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('非法值回落占位符', () => {
    expect(formatDuration(-1)).toBe('--:--');
    expect(formatDuration(Number.NaN)).toBe('--:--');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('--:--');
  });
});

describe('播放状态持久化', () => {
  const state: MusicState = {
    queue: [track('a'), track('b')],
    currentIndex: 1,
    mode: 'shuffle',
    volume: 0.35,
    currentTime: 12.5,
  };

  it('serialize → parse 往返一致', () => {
    expect(parseMusicState(serializeMusicState(state))).toEqual(state);
  });

  it('非法输入返回 null', () => {
    expect(parseMusicState(null)).toBeNull();
    expect(parseMusicState('')).toBeNull();
    expect(parseMusicState('{')).toBeNull();
    expect(parseMusicState('[]')).toBeNull();
    expect(parseMusicState('{"queue":"nope"}')).toBeNull();
  });

  it('单字段非法时回落到默认值', () => {
    const raw = JSON.stringify({
      queue: [track('a'), { nope: true }],
      currentIndex: 9,
      mode: 'unknown',
      volume: 5,
      currentTime: -3,
    });

    expect(parseMusicState(raw)).toEqual({
      queue: [track('a')],
      currentIndex: 0,
      mode: 'sequence',
      volume: 1,
      currentTime: 0,
    });
  });

  it('下标越界时按队首兜底，空队列为 -1', () => {
    expect(parseMusicState('{"queue":[]}')).toEqual({
      queue: [],
      currentIndex: -1,
      mode: 'sequence',
      volume: 0.8,
      currentTime: 0,
    });
  });
});
