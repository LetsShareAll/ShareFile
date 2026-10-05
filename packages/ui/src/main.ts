import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { bootstrapRouter } from './router';
import { useLibraryStore } from './stores/library';
import { useUiStore } from './stores/ui';

async function main(): Promise<void> {
  const app = createApp(App);

  app.use(createPinia());

  const router = await bootstrapRouter();
  app.use(router);

  const ui = useUiStore();
  ui.hydrate();

  // 索引与外部源在后台加载，视图自行呈现 loading / error 状态。
  void useLibraryStore().loadIndex();

  app.mount('#app');
}

void main();
