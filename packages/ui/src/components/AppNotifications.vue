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
  border-radius: 4px;
  border-left: 4px solid transparent;
  box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
  pointer-events: auto;
  animation: notification-slide-in 0.3s ease-out;
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
  background: #e3f2fd;
  border-left-color: #2196f3;
  color: #1565c0;
}

.notification-success {
  background: #e8f5e9;
  border-left-color: #4caf50;
  color: #2e7d32;
}

.notification-warning {
  background: #fff3e0;
  border-left-color: #ff9800;
  color: #e65100;
}

.notification-error {
  background: #ffebee;
  border-left-color: #f44336;
  color: #c62828;
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
