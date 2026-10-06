<script setup lang="ts">
import AppNotifications from './components/AppNotifications.vue';
import ConfirmDialogHost from './components/ConfirmDialogHost.vue';
import MusicBar from './features/music/MusicBar.vue';
import MusicPanel from './features/music/MusicPanel.vue';
import { useMusicStore } from './stores/music';

// App 在 pinia 之后创建：这里恢复上次的队列与曲目（暂停态）。
useMusicStore().hydrate();
</script>

<template>
  <router-view />
  <AppNotifications />
  <MusicBar />
  <MusicPanel />
  <ConfirmDialogHost />
</template>
