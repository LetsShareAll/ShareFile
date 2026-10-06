import { describe, expect, it } from 'vitest';

import {
  MAX_SCALE,
  MIN_SCALE,
  anchoredOffset,
  applyZoom,
  clampOffset,
  clampScale,
  computeFitScale,
  distanceBetween,
  fitViewport,
  panBy,
  pinchScale,
  pinchedViewport,
  toggleFitScale,
  toggleViewport,
  toCenterOffset,
} from '@/features/preview/renderers/image/geometry';
import {
  createGestures,
  cursorIn,
  move,
  press,
  release,
  resetGestures,
} from '@/features/preview/renderers/image/interaction';
import type { Viewport } from '@/features/preview/renderers/image/geometry';

const FRAME = { origin: { x: 0, y: 0 }, size: { width: 1000, height: 600 } };

function view(scale: number, x = 0, y = 0): Viewport {
  return { scale, offset: { x, y } };
}

describe('clampScale', () => {
  it('钳制到 0.1×–8×', () => {
    expect(clampScale(0.05)).toBe(MIN_SCALE);
    expect(clampScale(12)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('非法值退回最小比例', () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MIN_SCALE);
  });
});

describe('computeFitScale', () => {
  it('大图按较紧的一边缩小，并留出空隙', () => {
    // 可用区域 1000-48 × 600-48 = 952 × 552
    expect(
      computeFitScale({ width: 4000, height: 2000 }, FRAME.size),
    ).toBeCloseTo(952 / 4000, 6);
  });

  it('小图不放大，保持 100% 居中', () => {
    expect(computeFitScale({ width: 100, height: 100 }, FRAME.size)).toBe(1);
  });

  it('尺寸缺失时退回 1', () => {
    expect(computeFitScale({ width: 0, height: 0 }, FRAME.size)).toBe(1);
    expect(
      computeFitScale({ width: 100, height: 100 }, { width: 0, height: 0 }),
    ).toBe(1);
  });
});

describe('clampOffset', () => {
  it('图片小于视框时居中', () => {
    expect(clampOffset(120, 400, 1000)).toBe(0);
    expect(clampOffset(-120, 400, 1000)).toBe(0);
  });

  it('图片大于视框时限制在溢出范围内', () => {
    expect(clampOffset(999, 1600, 1000)).toBe(300);
    expect(clampOffset(-999, 1600, 1000)).toBe(-300);
    expect(clampOffset(120, 1600, 1000)).toBe(120);
  });
});

describe('anchoredOffset', () => {
  it('光标下的图像点在缩放前后停在原处', () => {
    const cursor = 200;
    const before = 40;
    const from = 1;
    const to = 2;
    const after = anchoredOffset(before, cursor, from, to);
    // 光标处对应的图像点：p = (cursor - before) / from
    const point = (cursor - before) / from;

    expect(after + point * to).toBeCloseTo(cursor, 6);
  });

  it('锚点在中心时等价于按比例平移', () => {
    expect(anchoredOffset(50, 0, 1, 2)).toBe(100);
  });

  it('起始比例非法时保持原值', () => {
    expect(anchoredOffset(50, 10, 0, 2)).toBe(50);
  });
});

describe('pinchScale', () => {
  it('按双指距离比换算比例', () => {
    expect(pinchScale(1, 100, 250)).toBeCloseTo(2.5, 6);
    expect(pinchScale(2, 200, 100)).toBeCloseTo(1, 6);
  });

  it('结果同样钳制在范围内', () => {
    expect(pinchScale(4, 100, 1000)).toBe(MAX_SCALE);
    expect(pinchScale(0.2, 100, 1)).toBe(MIN_SCALE);
  });

  it('起始距离为 0 时保持原比例', () => {
    expect(pinchScale(1.5, 0, 300)).toBe(1.5);
  });
});

describe('toCenterOffset 与 distanceBetween', () => {
  it('把 client 坐标换算成相对视框中心的偏移', () => {
    expect(
      toCenterOffset({ x: 520, y: 310 }, { x: 20, y: 10 }, FRAME.size),
    ).toEqual({ x: 0, y: 0 });
  });

  it('计算双指距离', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('视框状态转换', () => {
  it('fitViewport 居中且按窗口缩放', () => {
    expect(fitViewport({ width: 4000, height: 2000 }, FRAME.size)).toEqual({
      scale: 952 / 4000,
      offset: { x: 0, y: 0 },
    });
  });

  it('applyZoom 以光标为锚点并钳制平移', () => {
    const next = applyZoom(
      view(1),
      2,
      { x: 300, y: 0 },
      { width: 800, height: 600 },
      FRAME.size,
    );

    expect(next.scale).toBe(2);
    // 光标在中心右侧 300，放大后图片左移，正好贴到可平移边界
    expect(next.offset.x).toBe(-300);
    expect(next.offset.y).toBe(0);
  });

  it('panBy 在起始状态上叠加位移并限制在边界', () => {
    const panned = panBy(
      view(2, 0, 0),
      { x: 500, y: -900 },
      { width: 800, height: 600 },
      FRAME.size,
    );

    // 宽 800×2=1600 溢出 600 → ±300；高 600×2=1200 溢出 600 → ±300
    expect(panned.offset).toEqual({ x: 300, y: -300 });
  });

  it('pinchedViewport 用双指距离比缩放', () => {
    const zoomed = pinchedViewport(
      view(1),
      100,
      200,
      { x: 0, y: 0 },
      { width: 800, height: 600 },
      FRAME.size,
    );

    expect(zoomed.scale).toBe(2);
  });

  it('双击在适应窗口与 1:1 之间切换', () => {
    const image = { width: 4000, height: 2000 };

    expect(toggleFitScale(952 / 4000, 952 / 4000)).toBe(1);
    expect(toggleFitScale(1, 952 / 4000)).toBe(952 / 4000);
    expect(toggleViewport(view(3, 120, 80), image, FRAME.size)).toEqual({
      scale: 952 / 4000,
      offset: { x: 0, y: 0 },
    });
  });
});

describe('手势簿记', () => {
  const sizes = { image: { width: 800, height: 600 }, frame: FRAME.size };

  it('单指拖拽产生平移', () => {
    const state = createGestures();

    press(state, 1, { x: 500, y: 300 }, view(2));
    const next = move(state, 1, { x: 560, y: 300 }, view(2), sizes, FRAME);

    expect(next?.offset).toEqual({ x: 60, y: 0 });
  });

  it('未注册的指针不产生更新', () => {
    const state = createGestures();

    press(state, 1, { x: 500, y: 300 }, view(2));

    expect(
      move(state, 9, { x: 560, y: 300 }, view(2), sizes, FRAME),
    ).toBeNull();
  });

  it('第二根手指落下后按双指缩放', () => {
    const state = createGestures();

    press(state, 1, { x: 400, y: 300 }, view(1));
    press(state, 2, { x: 600, y: 300 }, view(1));
    const next = move(state, 2, { x: 800, y: 300 }, view(1), sizes, FRAME);

    // 距离 200 → 400，比例 1 → 2
    expect(next?.scale).toBe(2);
  });

  it('抬起一根手指后回到拖拽', () => {
    const state = createGestures();

    press(state, 1, { x: 400, y: 300 }, view(1));
    press(state, 2, { x: 600, y: 300 }, view(1));
    release(state, 2, view(2));
    const next = move(state, 1, { x: 440, y: 300 }, view(2), sizes, FRAME);

    expect(next?.scale).toBe(2);
    expect(next?.offset).toEqual({ x: 40, y: 0 });
  });

  it('resetGestures 清空所有状态', () => {
    const state = createGestures();

    press(state, 1, { x: 400, y: 300 }, view(1));
    resetGestures(state);

    expect(state.pointers.size).toBe(0);
    expect(state.drag).toBeNull();
    expect(state.pinch).toBeNull();
  });

  it('cursorIn 换算相对视框中心的锚点', () => {
    expect(cursorIn(FRAME, { x: 500, y: 300 })).toEqual({ x: 0, y: 0 });
  });
});
