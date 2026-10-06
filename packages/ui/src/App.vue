<script setup lang="ts">
import { defineAsyncComponent } from 'vue';

import AppNotifications from './components/AppNotifications.vue';
import ConfirmDialogHost from './components/ConfirmDialogHost.vue';
import MusicBar from './features/music/MusicBar.vue';
import { useMusicStore } from './stores/music';

const music = useMusicStore();

// App 在 pinia 之后创建：这里恢复上次的队列与曲目（暂停态）。
music.hydrate();

/**
 * 展开面板懒加载：只有真正展开时才拉取面板与歌词/队列/历史列表的 chunk。
 * 必须配合模板里的 `v-if`，否则挂载即加载，等于没有拆分。
 */
const MusicPanel = defineAsyncComponent(
  () => import('./features/music/MusicPanel.vue'),
);
</script>

<template>
  <router-view />
  <AppNotifications />
  <MusicBar />
  <MusicPanel v-if="music.expanded" />
  <ConfirmDialogHost />
</template>
