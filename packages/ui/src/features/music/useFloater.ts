/**
 * 悬浮播放器的 DOM 侧行为：拖动、贴边收起、悬浮弹出、位置持久化。
 * 几何与存档规则全在 floater.ts，这里只负责指针事件与把状态接到模板上。
 */

import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type CSSProperties,
  type ComputedRef,
  type Ref,
} from 'vue';

import {
  FLOATER_FALLBACK_SIZE,
  OPEN_SUPPRESS_MS,
  clampFloaterPosition,
  defaultFloaterState,
  detectDockSide,
  getDockedPosition,
  isOpenSuppressed,
  readFloaterState,
  shouldStartDrag,
  writeFloaterState,
  type DockSide,
  type FloaterSize,
  type FloaterState,
  type Viewport,
} from './floater';

/** 起拖阈值：位移小于它算点击，不进入拖动（触摸点按才不会误拖）。 */
const DRAG_SLOP = 4;

interface DragSession {
  pointerId: number;
  fromHandle: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export interface FloaterApi {
  rootEl: Ref<HTMLElement | null>;
  cardEl: Ref<HTMLElement | null>;
  rootStyle: ComputedRef<CSSProperties>;
  docked: ComputedRef<DockSide>;
  dragging: Ref<boolean>;
  open: Ref<boolean>;
  onEnter: () => void;
  onLeave: () => void;
  onCardPointerDown: (event: PointerEvent) => void;
  onHandlePointerDown: (event: PointerEvent) => void;
  onHandleClick: (event: MouseEvent) => void;
}

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useFloater(): FloaterApi {
  const rootEl = ref<HTMLElement | null>(null);
  const cardEl = ref<HTMLElement | null>(null);
  const size = ref<FloaterSize>({ ...FLOATER_FALLBACK_SIZE });
  const state = ref<FloaterState>(
    defaultFloaterState(FLOATER_FALLBACK_SIZE, viewport()),
  );
  const dragging = ref(false);
  const open = ref(false);
  const docked = computed(() => state.value.docked);

  let session: DragSession | null = null;
  /** 最近一次按下用的指针类型：点击把手时用它区分鼠标 hover 与触摸切换。 */
  let pointerType = 'mouse';
  /** 拖完把手会补发一次 click，吞掉它，免得顺手把卡片又收回去。 */
  let suppressClick = false;
  /** 刚贴边停靠到此刻之前不响应 hover 展开（时间戳，0 表示不抑制）。 */
  let suppressOpenUntil = 0;

  const rootStyle = computed<CSSProperties>(() => {
    const { x, y, docked: side } = state.value;

    // 贴边侧交给 CSS 的 left / right 定位，拖动中切回内联坐标不会跳动。
    return side === null
      ? { left: `${x}px`, top: `${y}px` }
      : { top: `${y}px` };
  });

  function measure(): FloaterSize {
    const rect = cardEl.value?.getBoundingClientRect();

    return rect && rect.width > 1 && rect.height > 1
      ? { width: rect.width, height: rect.height }
      : size.value;
  }

  function restore(): void {
    size.value = measure();
    state.value = readFloaterState(viewport(), size.value);
    open.value = false;
  }

  function reclamp(): void {
    size.value = measure();

    const { x, y, docked: side } = state.value;
    const next = side
      ? getDockedPosition(side, y, size.value, viewport())
      : clampFloaterPosition({ x, y, docked: null }, size.value, viewport());

    // 拖窗口会连续触发 resize：位置没变就别刷 localStorage。
    if (next.x === x && next.y === y && next.docked === side) return;

    state.value = next;
    writeFloaterState(next);
  }

  function finishDrag(): void {
    const root = rootEl.value;

    if (session && root) {
      if (root.hasPointerCapture(session.pointerId)) {
        root.releasePointerCapture(session.pointerId);
      }

      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
    }

    session = null;
    dragging.value = false;
  }

  function beginDrag(event: PointerEvent, fromHandle: boolean): void {
    const root = rootEl.value;

    if (!root) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // 起拖门禁：抓手条与贴边把手带 [data-drag-handle]，卡片正文只认鼠标。
    if (
      !shouldStartDrag({ pointerType: event.pointerType, target: event.target })
    ) {
      return;
    }

    pointerType = event.pointerType;
    suppressClick = false;

    const rect = root.getBoundingClientRect();
    const side = state.value.docked;
    // 停靠时根盒只剩把手大小，还原成「展开后的卡片盒」当原点，卡片才不会跳。
    const originX =
      side === 'left'
        ? 0
        : side === 'right'
          ? viewport().width - size.value.width
          : rect.left;

    session = {
      pointerId: event.pointerId,
      fromHandle,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY: rect.top,
      moved: false,
    };

    // 卡片空白处按下：压掉默认行为，拖动期间就不会选中文字。
    if (!fromHandle) event.preventDefault();

    root.setPointerCapture(event.pointerId);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!session || event.pointerId !== session.pointerId) return;

    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;

    if (!session.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;

      session.moved = true;
      dragging.value = true;
      open.value = false;
      state.value = { ...state.value, docked: null };
    }

    state.value = clampFloaterPosition(
      { x: session.originX + dx, y: session.originY + dy, docked: null },
      size.value,
      viewport(),
    );
  }

  function settle(): void {
    const side = detectDockSide(state.value.x, size.value, viewport());

    state.value = side
      ? getDockedPosition(side, state.value.y, size.value, viewport())
      : clampFloaterPosition(state.value, size.value, viewport());
    // 刚贴边时指针往往还压在把手上：先抑制 400ms，免得松手就弹开。
    suppressOpenUntil = side ? Date.now() + OPEN_SUPPRESS_MS : 0;
    open.value = false;
    writeFloaterState(state.value);
  }

  function onPointerUp(event: PointerEvent): void {
    if (!session || event.pointerId !== session.pointerId) return;

    const { moved, fromHandle } = session;

    finishDrag();

    if (!moved) return;

    suppressClick = fromHandle;
    settle();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!session || event.pointerId !== session.pointerId) return;

    finishDrag();
  }

  function onEnter(): void {
    if (!state.value.docked) return;
    // 停靠抑制窗口内不展开：窗口过期或指针离开后重进都会恢复。
    if (isOpenSuppressed(Date.now(), suppressOpenUntil)) return;

    open.value = true;
  }

  function onLeave(): void {
    // 离开即解除抑制，指针再进来就能立刻展开。
    suppressOpenUntil = 0;
    open.value = false;
  }

  function onCardPointerDown(event: PointerEvent): void {
    beginDrag(event, false);
  }

  function onHandlePointerDown(event: PointerEvent): void {
    beginDrag(event, true);
  }

  function onHandleClick(event: MouseEvent): void {
    if (suppressClick) {
      suppressClick = false;

      return;
    }

    // 鼠标靠 hover 展开 / 收回，点击只服务触摸；键盘激活没有指针，detail 为 0。
    if (event.detail > 0 && pointerType === 'mouse') return;

    open.value = !open.value;
  }

  // 卡片跟着 v-if="currentTrack" 挂载：元素出现的同一帧就量尺寸并从存档恢复，
  // 避免先闪一下默认位置再跳过去。
  watch(
    cardEl,
    element => {
      if (element) restore();
    },
    { flush: 'sync' },
  );

  onMounted(() => window.addEventListener('resize', reclamp));
  onUnmounted(() => {
    window.removeEventListener('resize', reclamp);
    finishDrag();
  });

  return {
    rootEl,
    cardEl,
    rootStyle,
    docked,
    dragging,
    open,
    onEnter,
    onLeave,
    onCardPointerDown,
    onHandlePointerDown,
    onHandleClick,
  };
}
