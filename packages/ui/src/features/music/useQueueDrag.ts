import { onUnmounted, ref, type Ref } from 'vue';

import { resolveMoveTarget } from './queueOrder';

/** 起拖阈值：位移小于它算点按，触摸才不会一碰就换位。 */
const DRAG_SLOP = 6;

export interface QueueDragOptions {
  /** 队列的 <ul>：落点用它的子项中线算。 */
  list: Ref<HTMLUListElement | null>;
  count: () => number;
  onMove: (from: number, to: number) => void;
}

/**
 * 队列拖拽排序：指针事件挂在 window 上（列表自身照常滚动），
 * 状态与命中计算都在这里，组件只负责把类名和手柄接上。
 */
export function useQueueDrag(options: QueueDragOptions) {
  const dragFrom = ref(-1);
  const dropIndex = ref(-1);
  const dragging = ref(false);

  let pointerId = -1;
  let startY = 0;
  let moved = false;

  function midpoints(): number[] {
    const items = options.list.value?.children;

    if (!items) return [];

    return Array.from(items, item => {
      const rect = item.getBoundingClientRect();

      return rect.top + rect.height / 2;
    });
  }

  function finish(): void {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    pointerId = -1;
    moved = false;
    dragging.value = false;
    dragFrom.value = -1;
    dropIndex.value = -1;
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    if (!moved && Math.abs(event.clientY - startY) < DRAG_SLOP) return;

    moved = true;
    dragging.value = true;
    dropIndex.value = resolveMoveTarget(
      midpoints(),
      event.clientY,
      dragFrom.value,
    );
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;

    const from = dragFrom.value;
    const to = dropIndex.value;
    // finish() 会把 moved 清掉，先留一份再收尾。
    const dropped = moved;

    finish();

    if (dropped && to >= 0 && to !== from) options.onMove(from, to);
  }

  /** 拖动只在手柄上启动：列表本身照常滚动（手柄的 touch-action 见样式）。 */
  function onPointerDown(event: PointerEvent, index: number): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointerId = event.pointerId;
    startY = event.clientY;
    moved = false;
    dragFrom.value = index;
    dropIndex.value = index;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onKeydown(event: KeyboardEvent, index: number): void {
    if (!event.altKey) return;

    const to =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : -1;

    if (to < 0 || to >= options.count()) return;

    event.preventDefault();
    options.onMove(index, to);
  }

  onUnmounted(finish);

  return { dragging, dragFrom, dropIndex, onPointerDown, onKeydown };
}
