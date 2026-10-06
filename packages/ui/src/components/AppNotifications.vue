<script setup lang="ts">
import { useNotificationsStore } from '../stores/notifications';

const notifications = useNotificationsStore();

const icons = {
  info: 'fas fa-info-circle',
  success: 'fas fa-check-circle',
  warning: 'fas fa-exclamation-triangle',
  error: 'fas fa-times-circle',
} as const;
</script>

<template>
  <div id="notification-container" class="notification-container">
    <div
      v-for="notification in notifications.items"
      :id="`notification-${notification.id}`"
      :key="notification.id"
      class="notification"
      :class="`notification-${notification.type}`"
      role="status"
      aria-live="polite"
    >
      <i :class="icons[notification.type]" aria-hidden="true" />
      <span class="notification-message">{{ notification.message }}</span>
      <button
        v-if="notification.dismissible"
        type="button"
        class="notification-close"
        aria-label="关闭通知"
        @click="notifications.dismiss(notification.id)"
      >
        <i class="fas fa-times" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  /* 玻璃表面 / sheen / 描边 / 阴影来自 styles/base.css 的 .notification 组；
     这里只叠状态色 tint（压在 sheen 之下，降级为不透明底时仍带状态色）。 */
  --notification-tint: linear-gradient(transparent, transparent);
  background-image: var(--glass-sheen), var(--notification-tint);
  border-left: 4px solid var(--notification-accent, var(--primary));
  color: var(--notification-text, var(--text));
  pointer-events: auto;
  animation: notification-slide-in var(--duration-normal) var(--ease-standard);
}

.notification-message {
  flex: 1;
}

.notification-close {
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
}

.notification-close:hover {
  opacity: 1;
}

.notification-info {
  --notification-tint: linear-gradient(
    var(--status-info-tint),
    var(--status-info-tint)
  );
  --notification-accent: var(--status-info-accent);
  --notification-text: var(--status-info-text);
}

.notification-success {
  --notification-tint: linear-gradient(
    var(--status-success-tint),
    var(--status-success-tint)
  );
  --notification-accent: var(--status-success-accent);
  --notification-text: var(--status-success-text);
}

.notification-warning {
  --notification-tint: linear-gradient(
    var(--status-warning-tint),
    var(--status-warning-tint)
  );
  --notification-accent: var(--status-warning-accent);
  --notification-text: var(--status-warning-text);
}

.notification-error {
  --notification-tint: linear-gradient(
    var(--status-error-tint),
    var(--status-error-tint)
  );
  --notification-accent: var(--status-error-accent);
  --notification-text: var(--status-error-text);
}

@keyframes notification-slide-in {
  from {
    opacity: 0;
    transform: translateY(-16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
