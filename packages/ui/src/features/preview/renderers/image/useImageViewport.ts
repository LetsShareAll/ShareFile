/**
 * 图片预览的视框交互：把 DOM 事件与尺寸测量接到 image/ 下的纯计算上。
 * 计算规则全部由 geometry / interaction 提供，这里只负责取尺寸与写状态。
 */

import { computed, ref } from 'vue';
import type { Ref } from 'vue';

import * as geometry from './geometry';
import * as gestures from './interaction';
import type { FrameBox } from './interaction';
import type { Point, Size, Viewport } from './geometry';

export interface ImageViewportOptions {
  frameEl: Ref<HTMLElement | null>;
  imageEl: Ref<HTMLImageElement | null>;
  /** 图片是否加载完成：未完成时忽略缩放交互。 */
  isReady: () => boolean;
}

const ZOOM_STEP = 1.25;
const WHEEL_SENSITIVITY = 0.0015;
const CENTER: Point = { x: 0, y: 0 };
const RESET_VIEW: Viewport = { scale: 1, offset: { x: 0, y: 0 } };

function pointOf(event: { clientX: number; clientY: number }): Point {
  return { x: event.clientX, y: event.clientY };
}

export function useImageViewport(options: ImageViewportOptions) {
  const { frameEl, imageEl, isReady } = options;
  const state = gestures.createGestures();
  const view = ref<Viewport>({ ...RESET_VIEW });

  const percent = computed(() => `${Math.round(view.value.scale * 100)}%`);
  const transform = computed(
    () =>
      `translate3d(${view.value.offset.x}px, ${view.value.offset.y}px, 0) scale(${view.value.scale})`,
  );

  /** 图片原始尺寸与视框几何；未加载完成时为零值，纯函数内部会兜底。 */
  function measure(): { image: Size; frame: FrameBox } {
    const frame = frameEl.value;
    const image = imageEl.value;
    const rect = frame?.getBoundingClientRect();

    return {
      image: {
        width: image?.naturalWidth ?? 0,
        height: image?.naturalHeight ?? 0,
      },
      frame: {
        origin: { x: rect?.left ?? 0, y: rect?.top ?? 0 },
        size: {
          width: frame?.clientWidth ?? 0,
          height: frame?.clientHeight ?? 0,
        },
      },
    };
  }

  function fit(): void {
    const { image, frame } = measure();

    view.value = geometry.fitViewport(image, frame.size);
  }

  function actualSize(): void {
    view.value = { ...RESET_VIEW };
  }

  function zoomTo(next: number, cursor: Point = CENTER): void {
    const { image, frame } = measure();

    view.value = geometry.applyZoom(
      view.value,
      next,
      cursor,
      image,
      frame.size,
    );
  }

  function zoomIn(): void {
    zoomTo(view.value.scale * ZOOM_STEP);
  }

  function zoomOut(): void {
    zoomTo(view.value.scale / ZOOM_STEP);
  }

  function onWheel(event: WheelEvent): void {
    if (!isReady()) return;

    const { image, frame } = measure();

    view.value = geometry.applyZoom(
      view.value,
      view.value.scale * Math.exp(-event.deltaY * WHEEL_SENSITIVITY),
      gestures.cursorIn(frame, pointOf(event)),
      image,
      frame.size,
    );
  }

  function onDoubleClick(): void {
    if (!isReady()) return;

    const { image, frame } = measure();

    view.value = geometry.toggleViewport(view.value, image, frame.size);
  }

  function onPointerDown(event: PointerEvent): void {
    if (!isReady()) return;

    frameEl.value?.setPointerCapture(event.pointerId);
    gestures.press(state, event.pointerId, pointOf(event), view.value);
  }

  function onPointerMove(event: PointerEvent): void {
    const { image, frame } = measure();
    const next = gestures.move(
      state,
      event.pointerId,
      pointOf(event),
      view.value,
      { image, frame: frame.size },
      frame,
    );

    if (next) view.value = next;
  }

  function onPointerUp(event: PointerEvent): void {
    gestures.release(state, event.pointerId, view.value);
  }

  /** 方向键留给弹窗切换文件，这里只处理 + / - / 0。 */
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      Boolean(target?.isContentEditable) ||
      ['INPUT', 'TEXTAREA'].includes(target?.tagName ?? '');

    if (!isReady() || typing) return;

    if (event.key === '+' || event.key === '=') zoomIn();
    else if (event.key === '-' || event.key === '_') zoomOut();
    else if (event.key === '0') fit();
  }

  function reset(): void {
    gestures.resetGestures(state);
    view.value = { ...RESET_VIEW };
  }

  return {
    percent,
    transform,
    fit,
    actualSize,
    zoomTo,
    zoomIn,
    zoomOut,
    onWheel,
    onDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onKeydown,
    reset,
  };
}
