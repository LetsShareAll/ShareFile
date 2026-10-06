import { describe, expect, it } from 'vitest';

import {
  insertQueueItem,
  moveQueueItem,
  removeQueueItem,
  resolveMoveTarget,
} from '@/features/music/queueOrder';
import type { MusicTrack } from '@/features/music/track';

function track(id: string): MusicTrack {
  return { id, name: `${id}.mp3`, path: `/${id}.mp3`, url: `/cdn/${id}.mp3` };
}

function ids(tracks: readonly MusicTrack[]): string[] {
  return tracks.map(item => item.id);
}

const queue = ['a', 'b', 'c', 'd'].map(track);

describe('moveQueueItem', () => {
  it('中间往后挪：跨越当前下标时当前项 -1', () => {
    // 当前是 b(1)，把 a(0) 挪到 2 → [b, c, a, d]，b 落到 0。
    const result = moveQueueItem(queue, 0, 2, 1);

    expect(ids(result.queue)).toEqual(['b', 'c', 'a', 'd']);
    expect(result.currentIndex).toBe(0);
  });

  it('向下挪到队尾：只影响当前项之后的位置', () => {
    const result = moveQueueItem(queue, 1, 3, 0);

    expect(ids(result.queue)).toEqual(['a', 'c', 'd', 'b']);
    expect(result.currentIndex).toBe(0);
  });

  it('向上挪：跨越当前下标时当前项 +1', () => {
    // 当前是 b(1)，把 d(3) 挪到 0 → [d, a, b, c]，b 落到 2。
    const result = moveQueueItem(queue, 3, 0, 1);

    expect(ids(result.queue)).toEqual(['d', 'a', 'b', 'c']);
    expect(result.currentIndex).toBe(2);
  });

  it('移动的就是当前项：当前下标跟着走', () => {
    const result = moveQueueItem(queue, 1, 3, 1);

    expect(ids(result.queue)).toEqual(['a', 'c', 'd', 'b']);
    expect(result.currentIndex).toBe(3);
  });

  it('跨过当前项：当前项保持同一首', () => {
    const result = moveQueueItem(queue, 3, 1, 2);

    expect(ids(result.queue)).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(result.queue)[result.currentIndex]).toBe('c');
    expect(result.currentIndex).toBe(3);
  });

  it('原地不动返回原队列引用', () => {
    const result = moveQueueItem(queue, 2, 2, 1);

    expect(result.queue).toBe(queue);
    expect(result.currentIndex).toBe(1);
  });

  it('越界或空队列是 no-op', () => {
    expect(moveQueueItem(queue, -1, 2, 1).queue).toBe(queue);
    expect(moveQueueItem(queue, 0, 9, 1).queue).toBe(queue);
    expect(moveQueueItem([], 0, 0, -1)).toEqual({
      queue: [],
      currentIndex: -1,
    });
  });

  it('没有当前曲目时下标保持 -1', () => {
    const result = moveQueueItem(queue, 0, 3, -1);

    expect(ids(result.queue)).toEqual(['b', 'c', 'd', 'a']);
    expect(result.currentIndex).toBe(-1);
  });
});

describe('resolveMoveTarget', () => {
  // 四项中线在 10 / 30 / 50 / 70。
  const midpoints = [10, 30, 50, 70];

  it('指针在某一项上半区：落在该 slot 之前', () => {
    expect(resolveMoveTarget(midpoints, 5, 2)).toBe(0);
    expect(resolveMoveTarget(midpoints, 25, 0)).toBe(0);
  });

  it('指针在中间项下半区：折算成移动后的最终下标', () => {
    // 拖着 a(0)，指针在 b 下半区（30 之后、c 中线之前）→ 最终落在 1。
    expect(resolveMoveTarget(midpoints, 35, 0)).toBe(1);
    expect(resolveMoveTarget(midpoints, 65, 0)).toBe(2);
  });

  it('指针在队尾之下：落在最后一项', () => {
    expect(resolveMoveTarget(midpoints, 999, 1)).toBe(3);
  });

  it('向上拖：指针在首项上半区落在 0，原地不动不产生位移', () => {
    expect(resolveMoveTarget(midpoints, 0, 3)).toBe(0);
    // 指针压在 d 自己的下半区（slot 4）→ 最终下标仍是 3。
    expect(resolveMoveTarget(midpoints, 75, 3)).toBe(3);
  });

  it('空列表回退到起点', () => {
    expect(resolveMoveTarget([], 42, 1)).toBe(1);
  });
});

describe('insertQueueItem / removeQueueItem', () => {
  it('插入位置越界时夹到队首队尾', () => {
    expect(ids(insertQueueItem(queue, 2, track('x')))).toEqual([
      'a',
      'b',
      'x',
      'c',
      'd',
    ]);
    expect(ids(insertQueueItem(queue, -3, track('x')))[0]).toBe('x');
    expect(ids(insertQueueItem(queue, 99, track('x'))).at(-1)).toBe('x');
  });

  it('移除当前项：下标顺延，标记 wasCurrent', () => {
    const removal = removeQueueItem(queue, 'c', 2);

    expect(removal && ids(removal.queue)).toEqual(['a', 'b', 'd']);
    expect(removal?.currentIndex).toBe(2);
    expect(removal?.wasCurrent).toBe(true);
  });

  it('移除当前项之前的一项：下标 -1', () => {
    const removal = removeQueueItem(queue, 'a', 2);

    expect(removal?.currentIndex).toBe(1);
    expect(removal?.wasCurrent).toBe(false);
  });

  it('移除最后一项且它就是当前项：下标回到队尾', () => {
    const removal = removeQueueItem([track('a'), track('b')], 'b', 1);

    expect(removal?.currentIndex).toBe(0);
  });

  it('移除不存在的 id 返回 null', () => {
    expect(removeQueueItem(queue, 'zzz', 0)).toBeNull();
  });
});
