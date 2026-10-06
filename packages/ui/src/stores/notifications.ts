import { defineStore } from 'pinia';
import { ref } from 'vue';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  dismissible: boolean;
  autoClose?: number;
}

export interface NotificationOptions {
  id?: string;
  dismissible?: boolean;
  autoClose?: number;
}

let nextNotificationId = 0;

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearTimer(id: string): void {
    const timer = timers.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  function dismiss(id: string): void {
    clearTimer(id);
    items.value = items.value.filter(item => item.id !== id);
  }

  function scheduleAutoClose(notification: AppNotification): void {
    if (!notification.autoClose) return;

    timers.set(
      notification.id,
      setTimeout(() => dismiss(notification.id), notification.autoClose),
    );
  }

  function push(
    message: string,
    type: NotificationType,
    options: NotificationOptions = {},
  ): string {
    const id = options.id ?? `notification-${(nextNotificationId += 1)}`;

    clearTimer(id);
    items.value = items.value.filter(item => item.id !== id);

    const notification: AppNotification = {
      id,
      type,
      message,
      dismissible: options.dismissible ?? true,
      autoClose: options.autoClose,
    };

    items.value = [...items.value, notification];
    scheduleAutoClose(notification);

    return id;
  }

  const info = (message: string, autoClose = 5000) =>
    push(message, 'info', { autoClose });

  const success = (message: string, autoClose = 3000) =>
    push(message, 'success', { autoClose });

  const warning = (message: string, autoClose = 5000) =>
    push(message, 'warning', { autoClose });

  const error = (message: string, dismissible = true) =>
    push(message, 'error', { dismissible });

  function dismissAll(): void {
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
    items.value = [];
  }

  return {
    items,
    push,
    dismiss,
    dismissAll,
    info,
    success,
    warning,
    error,
  };
});
