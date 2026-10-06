import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotificationsStore } from '@/stores/notifications';

describe('通知 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it('四类通知都能入队并带类型', () => {
    const store = useNotificationsStore();

    store.info('i');
    store.success('s');
    store.warning('w');
    store.error('e');

    expect(store.items.map(item => item.type)).toEqual([
      'info',
      'success',
      'warning',
      'error',
    ]);
  });

  it('沿用旧默认：info/warning 5s、success 3s 自动关闭，error 常驻', async () => {
    const store = useNotificationsStore();

    store.info('i');
    store.success('s');
    store.warning('w');
    store.error('e');

    expect(store.items.map(item => item.autoClose)).toEqual([
      5000,
      3000,
      5000,
      undefined,
    ]);

    vi.advanceTimersByTime(3000);
    expect(store.items.map(item => item.message)).toEqual(['i', 'w', 'e']);

    vi.advanceTimersByTime(2000);
    expect(store.items.map(item => item.message)).toEqual(['e']);
  });

  it('同 id 覆盖旧通知且不重复', () => {
    const store = useNotificationsStore();

    store.push('第一次', 'info', { id: 'external-source', autoClose: 0 });
    store.push('第二次', 'warning', { id: 'external-source', autoClose: 0 });

    expect(store.items).toHaveLength(1);
    expect(store.items[0]).toMatchObject({
      id: 'external-source',
      type: 'warning',
      message: '第二次',
    });
  });

  it('error 默认不可关闭，dismiss 显式传参可覆盖', () => {
    const store = useNotificationsStore();

    store.error('e');
    store.error('e2', false);

    expect(store.items.map(item => item.dismissible)).toEqual([true, false]);
  });

  it('dismiss 与 dismissAll 都能清空队列并取消计时', () => {
    const store = useNotificationsStore();

    store.info('a');
    store.info('b');
    store.dismissAll();

    expect(store.items).toHaveLength(0);

    store.info('c');
    const id = store.items[0].id;
    store.dismiss(id);
    expect(store.items).toHaveLength(0);

    vi.advanceTimersByTime(10_000);
    expect(store.items).toHaveLength(0);
  });
});
