/**
 * 图片预览的手势簿记：单指拖拽、双指缩放、指针捕获。
 * 不触碰 DOM，视框坐标由调用方以纯数据传入，便于单测。
 */

import {
  centerOf,
  distanceBetween,
  panBy,
  pinchedViewport,
  toCenterOffset,
} from './geometry';
import type { Point, Size, Viewport } from './geometry';

export interface Sizes {
  image: Size;
  frame: Size;
}

/** 视框几何：左上角 client 坐标 + 内容尺寸。 */
export interface FrameBox {
  origin: Point;
  size: Size;
}

interface DragStart {
  point: Point;
  view: Viewport;
}

interface PinchStart {
  distance: number;
  view: Viewport;
}

export interface GestureState {
  pointers: Map<number, Point>;
  drag: DragStart | null;
  pinch: PinchStart | null;
}

export function createGestures(): GestureState {
  return { pointers: new Map(), drag: null, pinch: null };
}

export function resetGestures(state: GestureState): void {
  state.pointers.clear();
  state.drag = null;
  state.pinch = null;
}

export function cursorIn(frame: FrameBox, point: Point): Point {
  return toCenterOffset(point, frame.origin, frame.size);
}

function startPinch(state: GestureState, view: Viewport): void {
  const points = [...state.pointers.values()];

  if (points.length < 2) return;

  state.pinch = { distance: distanceBetween(points[0], points[1]), view };
  state.drag = null;
}

export function press(
  state: GestureState,
  id: number,
  point: Point,
  view: Viewport,
): void {
  state.pointers.set(id, point);

  if (state.pointers.size >= 2) {
    startPinch(state, view);

    return;
  }

  state.drag = { point, view };
}

/** 返回新的视框状态；指针未注册或无需更新时返回 null。 */
export function move(
  state: GestureState,
  id: number,
  point: Point,
  view: Viewport,
  sizes: Sizes,
  frame: FrameBox,
): Viewport | null {
  if (!state.pointers.has(id)) return null;

  state.pointers.set(id, point);

  const points = [...state.pointers.values()];
  const pinch = state.pinch;

  if (pinch && points.length >= 2) {
    return pinchedViewport(
      pinch.view,
      pinch.distance,
      distanceBetween(points[0], points[1]),
      cursorIn(frame, centerOf(points[0], points[1])),
      sizes.image,
      sizes.frame,
    );
  }

  const drag = state.drag;

  if (!drag) return null;

  return panBy(
    drag.view,
    { x: point.x - drag.point.x, y: point.y - drag.point.y },
    sizes.image,
    sizes.frame,
  );
}

export function release(state: GestureState, id: number, view: Viewport): void {
  state.pointers.delete(id);

  const points = [...state.pointers.values()];

  if (points.length >= 2) {
    startPinch(state, view);

    return;
  }

  state.pinch = null;
  state.drag = points.length === 0 ? null : { point: points[0], view };
}
