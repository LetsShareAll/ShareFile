<script setup lang="ts">
defineProps<{ src?: string; alt: string; variant: 'bar' | 'panel' }>();
</script>

<template>
  <div :class="`music-${variant}-artwork`">
    <img v-if="src" :src="src" :alt="alt" />
    <i v-else class="fas fa-music" aria-hidden="true" />
  </div>
</template>

<style scoped>
/* 只放展开面板这一档：悬浮卡的 .music-bar-artwork 留在全局样式里。 */
.music-panel-artwork {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 100%;
  max-width: 16rem;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background: var(--button-bg);
  color: var(--text-secondary);
  font-size: 3rem;
}
.music-panel-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (max-width: 720px) {
  .music-panel-artwork {
    max-width: 8rem;
  }
}
</style>
