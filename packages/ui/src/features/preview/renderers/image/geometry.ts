/**
 * 图片预览的纯几何计算：缩放钳制、光标锚点平移、适应窗口、双指比例。
 * 全部为纯函数，组件只负责把结果写回样式。
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Offset {
  x: number;
  y: number;
}

/** 视框状态：当前比例与相对视框中心的平移量。 */
export interface Viewport {
  scale: number;
  offset: Offset;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
/** 适应窗口时四周留出的空隙（CSS 像素）。 */
export const FIT_PADDING = 24;
/** 判断“当前是否停留在适应窗口比例”的容差。 */
export const SCALE_EPSILON = 0.01;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return MIN_SCALE;

  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** 适应窗口：整幅图刚好放进视框，且最多放大到 100%（小图保持原尺寸居中）。 */
export function computeFitScale(
  image: Size,
  viewport: Size,
  padding: number = FIT_PADDING,
): number {
  if (image.width <= 0 || image.height <= 0) return 1;
  if (viewport.width <= 0 || viewport.height <= 0) return 1;

  const availableWidth = Math.max(viewport.width - padding * 2, 1);
  const availableHeight = Math.max(viewport.height - padding * 2, 1);
  const ratio = Math.min(
    availableWidth / image.width,
    availableHeight / image.height,
  );

  return clampScale(Math.min(1, ratio));
}

/** 图片小于视框时回到居中（偏移 0），否则限制在可平移范围内。 */
export function clampOffset(
  offset: number,
  scaledSize: number,
  viewportSize: number,
): number {
  if (!Number.isFinite(offset)) return 0;

  const overflow = scaledSize - viewportSize;

  if (overflow <= 0) return 0;

  const limit = overflow / 2;

  return Math.min(limit, Math.max(-limit, offset));
}

/**
 * 以光标为锚点缩放：光标下的图像点在缩放前后停在同一屏幕位置。
 * `current` / `cursor` 都是相对视框中心的偏移量。
 */
export function anchoredOffset(
  current: number,
  cursor: number,
  from: number,
  to: number,
): number {
  if (from <= 0 || !Number.isFinite(to)) return current;

  return cursor - (to / from) * (cursor - current);
}

export function centerOf(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 双指距离换算目标比例。 */
export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (startDistance <= 0 || !Number.isFinite(currentDistance)) {
    return clampScale(startScale);
  }

  return clampScale(startScale * (currentDistance / startDistance));
}

/** 双击在“适应窗口”与 1:1 之间切换。 */
export function toggleFitScale(current: number, fit: number): number {
  return Math.abs(current - fit) < SCALE_EPSILON ? 1 : fit;
}

/** 视框内的 client 坐标 → 相对视框中心的偏移。 */
export function toCenterOffset(
  point: Point,
  origin: Point,
  viewport: Size,
): Point {
  return {
    x: point.x - origin.x - viewport.width / 2,
    y: point.y - origin.y - viewport.height / 2,
  };
}

/** 适应窗口状态：缩放到位且居中。 */
export function fitViewport(image: Size, viewport: Size): Viewport {
  return { scale: computeFitScale(image, viewport), offset: { x: 0, y: 0 } };
}

/** 双击复位：在适应窗口与 1:1 之间切换，并回到居中。 */
export function toggleViewport(
  state: Viewport,
  image: Size,
  viewport: Size,
): Viewport {
  const fit = computeFitScale(image, viewport);

  return { scale: toggleFitScale(state.scale, fit), offset: { x: 0, y: 0 } };
}

/** 以锚点为基准缩放到 `next`，两个方向都按可平移范围钳制。 */
export function applyZoom(
  state: Viewport,
  next: number,
  cursor: Point,
  image: Size,
  viewport: Size,
): Viewport {
  const scale = clampScale(next);

  return {
    scale,
    offset: {
      x: clampOffset(
        anchoredOffset(state.offset.x, cursor.x, state.scale, scale),
        image.width * scale,
        viewport.width,
      ),
      y: clampOffset(
        anchoredOffset(state.offset.y, cursor.y, state.scale, scale),
        image.height * scale,
        viewport.height,
      ),
    },
  };
}

/** 拖拽平移：在起始状态上叠加位移。 */
export function panBy(
  state: Viewport,
  delta: Point,
  image: Size,
  viewport: Size,
): Viewport {
  return {
    scale: state.scale,
    offset: {
      x: clampOffset(
        state.offset.x + delta.x,
        image.width * state.scale,
        viewport.width,
      ),
      y: clampOffset(
        state.offset.y + delta.y,
        image.height * state.scale,
        viewport.height,
      ),
    },
  };
}

/** 双指缩放：距离比换算比例，双指中点为锚点。 */
export function pinchedViewport(
  state: Viewport,
  startDistance: number,
  currentDistance: number,
  cursor: Point,
  image: Size,
  viewport: Size,
): Viewport {
  const next = pinchScale(state.scale, startDistance, currentDistance);

  return applyZoom(state, next, cursor, image, viewport);
}
