import type { KeyValueStorage } from '../domain/external';

function createSafeStorage(getStorage: () => Storage): KeyValueStorage {
  return {
    getItem(key) {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      try {
        getStorage().setItem(key, value);
      } catch {
        // 隐私模式或配额耗尽时静默降级。
      }
    },

    removeItem(key) {
      try {
        getStorage().removeItem(key);
      } catch {
        // 同上。
      }
    },

    keys() {
      try {
        return Object.keys(getStorage());
      } catch {
        return [];
      }
    },
  };
}

export function createLocalStorage(): KeyValueStorage {
  return createSafeStorage(() => window.localStorage);
}

export function createSessionStorage(): KeyValueStorage {
  return createSafeStorage(() => window.sessionStorage);
}

export function readStorageValue(
  storage: KeyValueStorage,
  key: string,
): string | null {
  const value = storage.getItem(key);

  return value === null ? null : value;
}

export function writeStorageValue(
  storage: KeyValueStorage,
  key: string,
  value: string | null,
): void {
  if (value === null) {
    storage.removeItem(key);

    return;
  }

  storage.setItem(key, value);
}
