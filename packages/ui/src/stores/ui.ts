import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  formatSortPreference,
  getDefaultSortDirection,
  parseSortPreference,
  type SortDirection,
  type SortKey,
} from '../domain/sort';
import { createLocalStorage } from '../platform/storage';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ViewMode = 'icon' | 'detail';

const THEME_STORAGE_KEY = 'theme';
const VIEW_STORAGE_KEY = 'view';
const SORT_STORAGE_KEY = 'sort';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function isViewMode(value: string | null): value is ViewMode {
  return value === 'icon' || value === 'detail';
}

/**
 * 应用偏好（主题 / 视图模式 / 搜索词），存储键与旧实现保持一致。
 */
export const useUiStore = defineStore('ui', () => {
  const storage = createLocalStorage();

  const theme = ref<ThemeMode>('auto');
  const view = ref<ViewMode>('icon');
  const query = ref('');
  const sortKey = ref<SortKey>('default');
  const sortDirection = ref<SortDirection>('asc');

  const isDarkResolved = computed(() => {
    if (theme.value !== 'auto') return theme.value === 'dark';

    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  function applyTheme(): void {
    const root = document.documentElement;
    const resolved =
      theme.value === 'auto'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme.value;

    root.setAttribute('data-theme', theme.value);
    root.setAttribute('data-resolved-theme', resolved);
  }

  function hydrate(): void {
    const storedTheme = storage.getItem(THEME_STORAGE_KEY);
    const storedView = storage.getItem(VIEW_STORAGE_KEY);

    if (isThemeMode(storedTheme)) theme.value = storedTheme;
    if (isViewMode(storedView)) view.value = storedView;

    const storedSort = parseSortPreference(storage.getItem(SORT_STORAGE_KEY));

    sortKey.value = storedSort.key;
    sortDirection.value = storedSort.direction;

    applyTheme();
  }

  function setTheme(next: ThemeMode): void {
    theme.value = next;
    storage.setItem(THEME_STORAGE_KEY, next);
    applyTheme();
  }

  function setView(next: ViewMode): void {
    view.value = next;
    storage.setItem(VIEW_STORAGE_KEY, next);
  }

  function persistSort(): void {
    storage.setItem(
      SORT_STORAGE_KEY,
      formatSortPreference({
        key: sortKey.value,
        direction: sortDirection.value,
      }),
    );
  }

  /** 切换排序键时采用该键的语义默认方向（大小/时间默认降序）。 */
  function setSortKey(next: SortKey): void {
    sortKey.value = next;
    sortDirection.value = getDefaultSortDirection(next);
    persistSort();
  }

  function toggleSortDirection(): void {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    persistSort();
  }

  function setQuery(next: string): void {
    query.value = next;
  }

  function clearQuery(): void {
    query.value = '';
  }

  return {
    theme,
    view,
    query,
    sortKey,
    sortDirection,
    isDarkResolved,
    hydrate,
    setTheme,
    setView,
    setQuery,
    clearQuery,
    setSortKey,
    toggleSortDirection,
  };
});
