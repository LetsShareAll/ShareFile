/**
 * @fileoverview 通知和错误处理模块
 *
 * 提供全局通知条、错误提示等用户反馈功能
 */

// ────────────── 类型定义 ──────────────

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  dismissible: boolean;
  autoClose?: number;
}

// ────────────── 全局状态 ──────────────

const notifications: Map<string, Notification> = new Map();
let notificationContainer: HTMLElement | null = null;

// ────────────── 初始化 ──────────────

/**
 * 初始化通知容器
 */
function initNotificationContainer(): HTMLElement {
  if (notificationContainer) {
    return notificationContainer;
  }

  notificationContainer = document.createElement('div');
  notificationContainer.id = 'notification-container';
  notificationContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 600px;
    width: 90%;
  `;

  document.body.appendChild(notificationContainer);
  return notificationContainer;
}

// ────────────── 通知管理 ──────────────

/**
 * 显示通知
 */
export function showNotification(
  message: string,
  type: NotificationType = 'info',
  options: { dismissible?: boolean; autoClose?: number; id?: string } = {},
): string {
  const container = initNotificationContainer();
  const id = options.id || `notification-${Date.now()}-${Math.random()}`;

  // 如果已存在相同 ID 的通知，先移除
  if (notifications.has(id)) {
    dismissNotification(id);
  }

  const notification: Notification = {
    id,
    type,
    message,
    dismissible: options.dismissible ?? true,
    autoClose: options.autoClose,
  };

  notifications.set(id, notification);

  // 创建通知元素
  const notificationEl = createNotificationElement(notification);
  container.appendChild(notificationEl);

  // 自动关闭
  if (notification.autoClose) {
    setTimeout(() => {
      dismissNotification(id);
    }, notification.autoClose);
  }

  return id;
}

/**
 * 创建通知元素
 */
function createNotificationElement(notification: Notification): HTMLElement {
  const el = document.createElement('div');
  el.id = `notification-${notification.id}`;
  el.className = `notification notification-${notification.type}`;

  // 图标映射
  const icons: Record<NotificationType, string> = {
    info: 'fa-info-circle',
    success: 'fa-check-circle',
    warning: 'fa-exclamation-triangle',
    error: 'fa-times-circle',
  };

  // 颜色映射
  const colors: Record<NotificationType, { bg: string; border: string; text: string }> = {
    info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
    success: { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' },
    warning: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
    error: { bg: '#ffebee', border: '#f44336', text: '#c62828' },
  };

  const color = colors[notification.type];

  el.style.cssText = `
    background: ${color.bg};
    border-left: 4px solid ${color.border};
    color: ${color.text};
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn 0.3s ease-out;
  `;

  // 图标
  const icon = document.createElement('i');
  icon.className = `fas ${icons[notification.type]}`;
  icon.style.fontSize = '18px';
  el.appendChild(icon);

  // 消息
  const messageEl = document.createElement('span');
  messageEl.style.flex = '1';
  messageEl.innerHTML = notification.message;
  el.appendChild(messageEl);

  // 关闭按钮
  if (notification.dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: ${color.text};
      cursor: pointer;
      padding: 4px;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;
    closeBtn.onmouseover = () => (closeBtn.style.opacity = '1');
    closeBtn.onmouseout = () => (closeBtn.style.opacity = '0.7');
    closeBtn.onclick = () => dismissNotification(notification.id);
    el.appendChild(closeBtn);
  }

  return el;
}

/**
 * 关闭通知
 */
export function dismissNotification(id: string): void {
  const notificationEl = document.getElementById(`notification-${id}`);
  if (notificationEl) {
    notificationEl.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      notificationEl.remove();
      notifications.delete(id);
    }, 300);
  }
}

/**
 * 关闭所有通知
 */
export function dismissAllNotifications(): void {
  notifications.forEach((_, id) => dismissNotification(id));
}

// ────────────── 便捷方法 ──────────────

export function showInfo(message: string, autoClose: number = 5000): string {
  return showNotification(message, 'info', { autoClose });
}

export function showSuccess(message: string, autoClose: number = 3000): string {
  return showNotification(message, 'success', { autoClose });
}

export function showWarning(message: string, autoClose: number = 5000): string {
  return showNotification(message, 'warning', { autoClose });
}

export function showError(message: string, dismissible: boolean = true): string {
  return showNotification(message, 'error', { dismissible });
}

// ────────────── 外部源加载状态 ──────────────

interface ExternalSourceStatus {
  total: number;
  loaded: number;
  failed: number;
  errors: Array<{ mountPoint: string; error: string }>;
}

let externalSourceStatus: ExternalSourceStatus | null = null;
let statusNotificationId: string | null = null;

/**
 * 初始化外部源加载状态
 */
export function initExternalSourceStatus(total: number): void {
  externalSourceStatus = {
    total,
    loaded: 0,
    failed: 0,
    errors: [],
  };

  if (total > 0) {
    statusNotificationId = showNotification(
      `正在加载外部源 (0/${total})...`,
      'info',
      { dismissible: false, id: 'external-source-loading' },
    );
  }
}

/**
 * 更新外部源加载状态
 */
export function updateExternalSourceStatus(
  mountPoint: string,
  status: 'success' | 'error',
  error?: string,
): void {
  if (!externalSourceStatus) return;

  if (status === 'success') {
    externalSourceStatus.loaded++;
  } else {
    externalSourceStatus.failed++;
    externalSourceStatus.errors.push({ mountPoint, error: error || '未知错误' });
  }

  const { total, loaded, failed } = externalSourceStatus;
  const completed = loaded + failed;

  // 更新进度通知
  if (statusNotificationId && completed < total) {
    dismissNotification(statusNotificationId);
    statusNotificationId = showNotification(
      `正在加载外部源 (${completed}/${total})...`,
      'info',
      { dismissible: false, id: 'external-source-loading' },
    );
  }

  // 加载完成
  if (completed === total) {
    if (statusNotificationId) {
      dismissNotification(statusNotificationId);
      statusNotificationId = null;
    }

    if (failed === 0) {
      showSuccess(`所有外部源加载成功 (${loaded}/${total})`);
    } else if (loaded === 0) {
      const errorList = externalSourceStatus.errors
        .map(e => `<li><strong>${e.mountPoint}</strong>: ${e.error}</li>`)
        .join('');
      showError(
        `所有外部源加载失败 (${failed}/${total})<br><ul style="margin: 8px 0 0 0; padding-left: 20px;">${errorList}</ul>`,
      );
    } else {
      const errorList = externalSourceStatus.errors
        .map(e => `<li><strong>${e.mountPoint}</strong>: ${e.error}</li>`)
        .join('');
      showWarning(
        `部分外部源加载失败 (成功: ${loaded}, 失败: ${failed})<br><ul style="margin: 8px 0 0 0; padding-left: 20px;">${errorList}</ul>`,
      );
    }

    externalSourceStatus = null;
  }
}

// ────────────── 挂载点错误卡片 ──────────────

/**
 * 创建挂载点错误卡片
 */
export function createMountPointErrorCard(
  mountPoint: string,
  error: string,
  onRetry?: () => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'file-item error-card';
  card.style.cssText = `
    background: #ffebee;
    border: 1px solid #f44336;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
  `;

  const icon = document.createElement('i');
  icon.className = 'fas fa-exclamation-triangle';
  icon.style.cssText = 'color: #f44336; font-size: 24px; margin-right: 12px;';

  const content = document.createElement('div');
  content.style.flex = '1';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight: 600; color: #c62828; margin-bottom: 4px;';
  title.textContent = `外部源加载失败: ${mountPoint}`;

  const errorMsg = document.createElement('div');
  errorMsg.style.cssText = 'color: #d32f2f; font-size: 14px;';
  errorMsg.textContent = error;

  content.appendChild(title);
  content.appendChild(errorMsg);

  card.appendChild(icon);
  card.appendChild(content);

  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.innerHTML = '<i class="fas fa-redo"></i> 重试';
    retryBtn.style.cssText = `
      background: #f44336;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    `;
    retryBtn.onmouseover = () => (retryBtn.style.background = '#d32f2f');
    retryBtn.onmouseout = () => (retryBtn.style.background = '#f44336');
    retryBtn.onclick = onRetry;
    card.appendChild(retryBtn);
  }

  return card;
}

// ────────────── CSS 动画 ──────────────

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(-20px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
