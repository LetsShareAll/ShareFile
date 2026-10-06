import { beforeEach, describe, expect, it } from 'vitest';

import {
  DOCK_THRESHOLD,
  FLOATER_EDGE_OFFSET,
  FLOATER_MARGIN,
  FLOATER_STORAGE_KEY,
  OPEN_SUPPRESS_MS,
  clampFloaterPosition,
  defaultFloaterState,
  detectDockSide,
  getDockedPosition,
  isOpenSuppressed,
  parseFloaterState,
  readFloaterState,
  serializeFloaterState,
  shouldStartDrag,
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

/** 从 HTML 造一个真实元素：判定依赖 closest()，字符串比对代替不了。 */
function element(html: string): Element {
  const host = document.createElement('div');

  host.innerHTML = html;

  const child = host.firstElementChild;

  if (!child) throw new Error(`造不出元素：${html}`);

  return child;
}

describe('shouldStartDrag', () => {
  const CARD_BODY = '<div class="music-bar-card"><span>标题</span></div>';

  it('鼠标设备：卡片正文（含内层元素）都能起拖', () => {
    expect(
      shouldStartDrag({
        pointerType: 'mouse',
        target: element(CARD_BODY).firstElementChild,
      }),
    ).toBe(true);
  });

  it('鼠标设备：控件上的按下不拖', () => {
    const controls = [
      '<button>播放</button>',
      '<input value="0.8" />',
      '<textarea>备注</textarea>',
      '<select><option>顺序</option></select>',
      '<a href="#">歌词</a>',
      '<div contenteditable="true">编辑</div>',
      '<div data-drag-ignore>忽略区</div>',
    ];

    for (const html of controls) {
      expect(
        shouldStartDrag({ pointerType: 'mouse', target: element(html) }),
        html,
      ).toBe(false);
    }

    // 控件内层（图标、文本）同样不拖。
    expect(
      shouldStartDrag({
        pointerType: 'mouse',
        target: element('<div><button>内层</button></div>').firstElementChild,
      }),
    ).toBe(false);
  });

  it('触摸 / 触控笔：卡片正文与控件都不拖', () => {
    for (const pointerType of ['touch', 'pen']) {
      expect(
        shouldStartDrag({
          pointerType,
          target: element(CARD_BODY).firstElementChild,
        }),
      ).toBe(false);
      expect(
        shouldStartDrag({
          pointerType,
          target: element('<button>下一首</button>'),
        }),
      ).toBe(false);
    }
  });

  it('触摸 / 触控笔：抓手条与贴边把手（含其子元素）能起拖', () => {
    const grip = '<span class="music-bar-grip" data-drag-handle></span>';
    const handle =
      '<button class="music-floater-handle" data-drag-handle><span><i class="fa"></i></span></button>';

    for (const pointerType of ['touch', 'pen', 'mouse']) {
      expect(shouldStartDrag({ pointerType, target: element(grip) })).toBe(
        true,
      );
      expect(shouldStartDrag({ pointerType, target: element(handle) })).toBe(
        true,
      );
      // 展开的把手是 button，但命中把手优先，内部的封面 / 角标照样能拖。
      expect(
        shouldStartDrag({
          pointerType,
          target: element(handle).firstElementChild?.firstElementChild ?? null,
        }),
      ).toBe(true);
    }
  });

  it('拿不到元素时不拖', () => {
    expect(shouldStartDrag({ pointerType: 'mouse', target: null })).toBe(false);
    expect(shouldStartDrag({ pointerType: 'mouse', target: document })).toBe(
      false,
    );
  });
});

describe('isOpenSuppressed', () => {
  it('窗口内抑制展开', () => {
    expect(isOpenSuppressed(1000, 1000 + OPEN_SUPPRESS_MS)).toBe(true);
    expect(isOpenSuppressed(1399, 1400)).toBe(true);
  });

  it('到期那一刻即恢复（左闭右开）', () => {
    expect(isOpenSuppressed(1400, 1400)).toBe(false);
    expect(isOpenSuppressed(1401, 1400)).toBe(false);
  });

  it('没有抑制窗口时不抑制', () => {
    expect(isOpenSuppressed(1000, 0)).toBe(false);
  });
});
