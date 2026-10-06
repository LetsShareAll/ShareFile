/** 队列排序的纯计算：拖拽 / 键盘移动都走这里，store 只负责落库与广播。 */

import type { MusicTrack } from './track';

export interface QueueOrder {
  queue: MusicTrack[];
  currentIndex: number;
}

/**
 * 移动队列中的一项：`to` 是移动后的最终下标（和列表 slot 一一对应）。
 * - 被移动项正是当前曲目 → 当前下标跟着它走；
 * - 否则跨越当前下标时 ±1 补偿，当前曲目本身不动；
 * - 越界 / 原地不动 → 返回原队列引用，调用方可据此跳过写入与广播。
 */
export function moveQueueItem(
  queue: MusicTrack[],
  from: number,
  to: number,
  currentIndex: number,
): QueueOrder {
  const last = queue.length - 1;

  if (from === to || from < 0 || to < 0 || from > last || to > last) {
    return { queue, currentIndex };
  }

  const next = [...queue];
  const [moved] = next.splice(from, 1);

  next.splice(to, 0, moved);

  let index = currentIndex;

  if (from === currentIndex) {
    index = to;
  } else if (from < to && currentIndex > from && currentIndex <= to) {
    index -= 1;
  } else if (from > to && currentIndex >= to && currentIndex < from) {
    index += 1;
  }

  return { queue: next, currentIndex: index };
}

/** 在 `at` 处插入一项（at 超过队尾时落在末尾）。 */
export function insertQueueItem(
  queue: MusicTrack[],
  at: number,
  track: MusicTrack,
): MusicTrack[] {
  const position = Math.min(Math.max(at, 0), queue.length);

  return [...queue.slice(0, position), track, ...queue.slice(position)];
}

export interface QueueRemoval {
  queue: MusicTrack[];
  /** 移除后的当前下标：被移除项正是当前曲目时顺延到下一首。 */
  currentIndex: number;
  /** 被移除的正是当前曲目：调用方要停播并把进度归零。 */
  wasCurrent: boolean;
}

/** 按 id 移除一项；不在队列里返回 null（调用方据此跳过写入）。 */
export function removeQueueItem(
  queue: MusicTrack[],
  id: string,
  currentIndex: number,
): QueueRemoval | null {
  const index = queue.findIndex(track => track.id === id);

  if (index < 0) return null;

  const rest = queue.filter((_, position) => position !== index);
  const wasCurrent = index === currentIndex;

  return {
    queue: rest,
    currentIndex: wasCurrent
      ? Math.min(index, rest.length - 1)
      : index < currentIndex
        ? currentIndex - 1
        : currentIndex,
    wasCurrent,
  };
}

/**
 * 拖拽落点：`midpoints` 是各列表项中线的纵坐标，返回移动后的最终下标。
 * 先算「插到第几个原始 slot 之前」，再按 moveQueueItem 的下标语义折算。
 */
export function resolveMoveTarget(
  midpoints: readonly number[],
  clientY: number,
  from: number,
): number {
  if (midpoints.length === 0) return from;

  let slot = midpoints.length;

  for (let position = 0; position < midpoints.length; position += 1) {
    if (clientY < midpoints[position]) {
      slot = position;

      break;
    }
  }

  const target = slot <= from ? slot : slot - 1;

  return Math.min(Math.max(target, 0), midpoints.length - 1);
}
