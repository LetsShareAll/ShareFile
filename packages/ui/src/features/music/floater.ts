/**
 * 悬浮播放器的纯几何 / 存档逻辑：拖动落点、贴边判定、位置回落。
 * 只吃数字与字符串、只吐状态对象，不碰 DOM，边界值（视口极小 / 坐标越界 / 存档损坏）
 * 才能在单测里穷举。
 */

import type { KeyValueStorage } from '../../domain/external';
import { createLocalStorage } from '../../platform/storage';

export type DockSide = 'left' | 'right' | null;

export interface FloaterState {
  x: number;
  y: number;
  docked: DockSide;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface FloaterSize {
  width: number;
  height: number;
}

export const FLOATER_STORAGE_KEY = 'music-floater';
/** 默认落点贴右下角时的留白。 */
export const FLOATER_EDGE_OFFSET = 16;
/** 拖动 / 缩窗时保证卡片留在视口内的边距。 */
export const FLOATER_MARGIN = 12;
/** 松手时距左 / 右边缘不超过该值即收起为贴边把手。 */
export const DOCK_THRESHOLD = 32;
/** 首帧还没测量到真实尺寸时的兜底（卡片挂载后立刻纠正）。 */
export const FLOATER_FALLBACK_SIZE: FloaterSize = { width: 340, height: 140 };

// createLocalStorage 只在读写时访问 window，模块加载阶段不会抛错。
const storage: KeyValueStorage = createLocalStorage();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 视口装不下整个卡片时上限退化为起始边距，保证坐标永远不小于边距。 */
function clampAxis(
  value: number,
  viewportSize: number,
  size: number,
  margin: number,
): number {
  return clamp(value, margin, Math.max(margin, viewportSize - size - margin));
}

export function defaultFloaterState(
  size: FloaterSize,
  viewport: Viewport,
): FloaterState {
  return {
    x: Math.max(0, viewport.width - size.width - FLOATER_EDGE_OFFSET),
    y: Math.max(0, viewport.height - size.height - FLOATER_EDGE_OFFSET),
    docked: null,
  };
}

export function clampFloaterPosition(
  state: FloaterState,
  size: FloaterSize,
  viewport: Viewport,
  margin: number = FLOATER_MARGIN,
): FloaterState {
  const fallback = defaultFloaterState(size, viewport);

  return {
    x: clampAxis(
      Number.isFinite(state.x) ? state.x : fallback.x,
      viewport.width,
      size.width,
      margin,
    ),
    y: clampAxis(
      Number.isFinite(state.y) ? state.y : fallback.y,
      viewport.height,
      size.height,
      margin,
    ),
    docked: state.docked,
  };
}

/** 距左 / 右边缘不超过阈值即停靠；两侧同时命中时取更近的一侧。 */
export function detectDockSide(
  x: number,
  size: FloaterSize,
  viewport: Viewport,
  threshold: number = DOCK_THRESHOLD,
): DockSide {
  const leftGap = x;
  const rightGap = viewport.width - (x + size.width);

  if (leftGap <= threshold && leftGap <= rightGap) return 'left';
  if (rightGap <= threshold) return 'right';

  return null;
}

/**
 * 停靠态：x 贴死到达边（左 0 / 右 视口宽 - 卡片宽），y 沿用松手高度并夹在视口内。
 * 渲染时贴边侧走 CSS 的 left/right 定位，x 只作为取消停靠时的还原原点。
 */
export function getDockedPosition(
  side: Exclude<DockSide, null>,
  y: number,
  size: FloaterSize,
  viewport: Viewport,
): FloaterState {
  const x = side === 'left' ? 0 : Math.max(0, viewport.width - size.width);

  return clampFloaterPosition({ x, y, docked: side }, size, viewport, 0);
}

function normalizeDockSide(value: unknown): DockSide | undefined {
  if (value === undefined || value === null) return null;

  return value === 'left' || value === 'right' ? value : undefined;
}

export function serializeFloaterState(state: FloaterState): string {
  return JSON.stringify({
    x: Math.round(state.x),
    y: Math.round(state.y),
    docked: state.docked,
  });
}

/**
 * 存档解析：形状不对 / 坐标非有限值 / 整个卡片落在视口外（换过显示器、改过缩放）
 * 一律回落默认右下角；只是部分出界的坐标仍然夹回视口。
 */
export function parseFloaterState(
  raw: string | null,
  viewport: Viewport,
  size: FloaterSize,
): FloaterState {
  const fallback = defaultFloaterState(size, viewport);

  if (!raw) return fallback;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (!parsed || typeof parsed !== 'object') return fallback;

  const record = parsed as Record<string, unknown>;
  const { x, y } = record;
  const docked = normalizeDockSide(record.docked);

  if (typeof x !== 'number' || typeof y !== 'number') return fallback;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  if (docked === undefined) return fallback;
  if (x + size.width < 0 || x > viewport.width) return fallback;
  if (y + size.height < 0 || y > viewport.height) return fallback;

  return docked === null
    ? clampFloaterPosition({ x, y, docked: null }, size, viewport)
    : getDockedPosition(docked, y, size, viewport);
}

export function readFloaterState(
  viewport: Viewport,
  size: FloaterSize,
): FloaterState {
  return parseFloaterState(
    storage.getItem(FLOATER_STORAGE_KEY),
    viewport,
    size,
  );
}

export function writeFloaterState(state: FloaterState): void {
  storage.setItem(FLOATER_STORAGE_KEY, serializeFloaterState(state));
}
