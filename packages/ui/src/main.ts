import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { confirmDialog } from './composables/useConfirmDialog';
import { bootstrapRouter } from './router';
import { useLibraryStore } from './stores/library';
import { useNotificationsStore } from './stores/notifications';
import { useUiStore } from './stores/ui';

declare global {
  interface Window {
    /** 仅开发环境暴露，便于用浏览器逐个验证通知与确认弹窗。 */
    __shareFileDev?: {
      notifications: ReturnType<typeof useNotificationsStore>;
      confirmDialog: typeof confirmDialog;
    };
  }
}

async function main(): Promise<void> {
  const app = createApp(App);

  app.use(createPinia());

  const router = await bootstrapRouter();
  app.use(router);

  const ui = useUiStore();
  ui.hydrate();

  if (import.meta.env.DEV) {
    window.__shareFileDev = {
      notifications: useNotificationsStore(),
      confirmDialog,
    };
  }

  // 索引与外部源在后台加载，视图自行呈现 loading / error 状态。
  void useLibraryStore().loadIndex();

  app.mount('#app');
}

void main();
