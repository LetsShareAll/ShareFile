import { beforeEach, describe, expect, it } from 'vitest';

import {
  DOCK_THRESHOLD,
  FLOATER_EDGE_OFFSET,
  FLOATER_MARGIN,
  FLOATER_STORAGE_KEY,
  clampFloaterPosition,
  defaultFloaterState,
  detectDockSide,
  getDockedPosition,
  parseFloaterState,
  readFloaterState,
  serializeFloaterState,
  writeFloaterState,
  type FloaterSize,
  type Viewport,
} from '@/features/music/floater';

const VIEWPORT: Viewport = { width: 1280, height: 800 };
const SIZE: FloaterSize = { width: 340, height: 140 };
/** 右下角默认落点：视口减卡片再减 16px 留白。 */
const DEFAULT_X = VIEWPORT.width - SIZE.width - FLOATER_EDGE_OFFSET;
const DEFAULT_Y = VIEWPORT.height - SIZE.height - FLOATER_EDGE_OFFSET;

describe('defaultFloaterState', () => {
  it('默认落点在右下角，留 16px 边距', () => {
    expect(defaultFloaterState(SIZE, VIEWPORT)).toEqual({
      x: DEFAULT_X,
      y: DEFAULT_Y,
      docked: null,
    });
  });

  it('视口比卡片还小时不返回负坐标', () => {
    expect(defaultFloaterState(SIZE, { width: 200, height: 100 })).toEqual({
      x: 0,
      y: 0,
      docked: null,
    });
  });
});

describe('clampFloaterPosition', () => {
  const clamp = (x: number, y: number) =>
    clampFloaterPosition({ x, y, docked: null }, SIZE, VIEWPORT);

  it('左侧越界夹回左边距', () => {
    expect(clamp(-500, 300)).toEqual({
      x: FLOATER_MARGIN,
      y: 300,
      docked: null,
    });
  });

  it('上侧越界夹回上边距', () => {
    expect(clamp(300, -500).y).toBe(FLOATER_MARGIN);
  });

  it('右侧越界夹回右边距', () => {
    expect(clamp(9999, 300).x).toBe(
      VIEWPORT.width - SIZE.width - FLOATER_MARGIN,
    );
  });

  it('下侧越界夹回下边距', () => {
    expect(clamp(300, 9999).y).toBe(
      VIEWPORT.height - SIZE.height - FLOATER_MARGIN,
    );
  });

  it('超大与负坐标同时出现时两个轴都夹住', () => {
    expect(clamp(1e9, -1e9)).toEqual({
      x: VIEWPORT.width - SIZE.width - FLOATER_MARGIN,
      y: FLOATER_MARGIN,
      docked: null,
    });
  });

  it('非有限值回落默认落点', () => {
    expect(clamp(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      x: DEFAULT_X,
      y: DEFAULT_Y,
      docked: null,
    });
  });

  it('视口装不下卡片时退化为起始边距', () => {
    const tiny = clampFloaterPosition({ x: 40, y: 40, docked: null }, SIZE, {
      width: 200,
      height: 100,
    });

    expect(tiny).toEqual({
      x: FLOATER_MARGIN,
      y: FLOATER_MARGIN,
      docked: null,
    });
  });

  it('保留停靠侧不动', () => {
    const state = clampFloaterPosition(
      { x: 900, y: 300, docked: 'right' },
      SIZE,
      VIEWPORT,
    );

    expect(state.docked).toBe('right');
  });

  it('自定义边距生效', () => {
    expect(clamp(-5, -5).x).toBe(FLOATER_MARGIN);
    expect(
      clampFloaterPosition({ x: -5, y: -5, docked: null }, SIZE, VIEWPORT, 0),
    ).toEqual({ x: 0, y: 0, docked: null });
  });
});

describe('detectDockSide', () => {
  it('距离左边缘不超过阈值判左', () => {
    expect(detectDockSide(0, SIZE, VIEWPORT)).toBe('left');
    expect(detectDockSide(DOCK_THRESHOLD, SIZE, VIEWPORT)).toBe('left');
  });

  it('刚越过阈值就不停靠', () => {
    expect(detectDockSide(DOCK_THRESHOLD + 1, SIZE, VIEWPORT)).toBeNull();
  });

  it('距离右边缘不超过阈值判右', () => {
    expect(detectDockSide(VIEWPORT.width - SIZE.width, SIZE, VIEWPORT)).toBe(
      'right',
    );
    expect(
      detectDockSide(
        VIEWPORT.width - SIZE.width - DOCK_THRESHOLD,
        SIZE,
        VIEWPORT,
      ),
    ).toBe('right');
  });

  it('右侧刚越过阈值就不停靠', () => {
    expect(
      detectDockSide(
        VIEWPORT.width - SIZE.width - DOCK_THRESHOLD - 1,
        SIZE,
        VIEWPORT,
      ),
    ).toBeNull();
  });

  it('视口正中不停靠', () => {
    expect(detectDockSide(470, SIZE, VIEWPORT)).toBeNull();
  });

  it('两侧同时命中时取更近的一侧', () => {
    const narrow: Viewport = { width: 360, height: 800 };
    const size: FloaterSize = { width: 320, height: 140 };

    expect(detectDockSide(10, size, narrow)).toBe('left');
    expect(detectDockSide(25, size, narrow)).toBe('right');
  });
});

describe('getDockedPosition', () => {
  it('左侧贴死 x=0，y 原样保留', () => {
    expect(getDockedPosition('left', 320, SIZE, VIEWPORT)).toEqual({
      x: 0,
      y: 320,
      docked: 'left',
    });
  });

  it('右侧贴死 x = 视口宽 - 卡片宽', () => {
    expect(getDockedPosition('right', 320, SIZE, VIEWPORT)).toEqual({
      x: VIEWPORT.width - SIZE.width,
      y: 320,
      docked: 'right',
    });
  });

  it('y 超出下边界时夹到视口内', () => {
    expect(getDockedPosition('right', 5000, SIZE, VIEWPORT).y).toBe(
      VIEWPORT.height - SIZE.height,
    );
  });

  it('y 为负时夹到 0', () => {
    expect(getDockedPosition('left', -80, SIZE, VIEWPORT).y).toBe(0);
  });
});

describe('parseFloaterState', () => {
  it('合法坐标夹进视口并保留精度', () => {
    expect(
      parseFloaterState(
        JSON.stringify({ x: 120.5, y: 240, docked: null }),
        VIEWPORT,
        SIZE,
      ),
    ).toEqual({ x: 120.5, y: 240, docked: null });
  });

  it('合法停靠存档还原到贴边位置', () => {
    expect(
      parseFloaterState(
        JSON.stringify({ x: 940, y: 200, docked: 'right' }),
        VIEWPORT,
        SIZE,
      ),
    ).toEqual({ x: VIEWPORT.width - SIZE.width, y: 200, docked: 'right' });
  });

  it('空存档回落默认右下角', () => {
    expect(parseFloaterState(null, VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
  });

  it('坏 JSON 回落默认', () => {
    expect(parseFloaterState('{oops', VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
  });

  it('非对象 JSON 回落默认', () => {
    expect(parseFloaterState('42', VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
    expect(parseFloaterState('"left"', VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
  });

  it('缺字段或类型不对回落默认', () => {
    expect(parseFloaterState('{"x":10}', VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
    expect(
      parseFloaterState('{"x":"10","y":10,"docked":null}', VIEWPORT, SIZE),
    ).toEqual(defaultFloaterState(SIZE, VIEWPORT));
  });

  it('停靠侧非法回落默认', () => {
    expect(
      parseFloaterState('{"x":10,"y":10,"docked":"top"}', VIEWPORT, SIZE),
    ).toEqual(defaultFloaterState(SIZE, VIEWPORT));
  });

  it('完全落在视口外的坐标回落默认（换过显示器 / 改过缩放）', () => {
    expect(
      parseFloaterState(
        JSON.stringify({ x: 4000, y: 200, docked: null }),
        VIEWPORT,
        SIZE,
      ),
    ).toEqual(defaultFloaterState(SIZE, VIEWPORT));
    expect(
      parseFloaterState(
        JSON.stringify({ x: -2000, y: -2000, docked: null }),
        VIEWPORT,
        SIZE,
      ),
    ).toEqual(defaultFloaterState(SIZE, VIEWPORT));
  });

  it('只是部分出界时夹回视口而不是丢弃', () => {
    expect(
      parseFloaterState(
        JSON.stringify({ x: -40, y: 10, docked: null }),
        VIEWPORT,
        SIZE,
      ),
    ).toEqual({ x: FLOATER_MARGIN, y: FLOATER_MARGIN, docked: null });
  });
});

describe('serializeFloaterState', () => {
  it('往返后状态不变', () => {
    const state = { x: 120, y: 240, docked: null } as const;

    expect(
      parseFloaterState(serializeFloaterState(state), VIEWPORT, SIZE),
    ).toEqual(state);
  });

  it('停靠态往返后仍在同一侧', () => {
    const state = getDockedPosition('left', 300, SIZE, VIEWPORT);

    expect(
      parseFloaterState(serializeFloaterState(state), VIEWPORT, SIZE),
    ).toEqual(state);
  });

  it('小数落成整数后再往返稳定', () => {
    const serialized = serializeFloaterState({
      x: 20.4,
      y: 20.6,
      docked: null,
    });
    const parsed = parseFloaterState(serialized, VIEWPORT, SIZE);

    expect(parsed.x).toBe(20);
    expect(parsed.y).toBe(21);
    expect(serializeFloaterState(parsed)).toBe(serialized);
  });
});

describe('悬浮卡存档读写', () => {
  beforeEach(() => window.localStorage.clear());

  it('写进去能原样读回来', () => {
    writeFloaterState({ x: 300, y: 180, docked: 'left' });

    expect(readFloaterState(VIEWPORT, SIZE)).toEqual(
      getDockedPosition('left', 180, SIZE, VIEWPORT),
    );
  });

  it('没写过时读默认右下角', () => {
    expect(readFloaterState(VIEWPORT, SIZE)).toEqual(
      defaultFloaterState(SIZE, VIEWPORT),
    );
  });

  it('存档键固定为 music-floater', () => {
    writeFloaterState({ x: 1, y: 2, docked: null });

    expect(window.localStorage.getItem(FLOATER_STORAGE_KEY)).toBe(
      '{"x":1,"y":2,"docked":null}',
    );
  });
});
