<script setup lang="ts">
defineProps<{ src?: string; alt: string; variant: 'bar' | 'panel' }>();
</script>

<template>
  <div :class="`music-${variant}-artwork`">
    <img v-if="src" :src="src" :alt="alt" />
    <i v-else class="fas fa-music" aria-hidden="true" />
  </div>
</template>
