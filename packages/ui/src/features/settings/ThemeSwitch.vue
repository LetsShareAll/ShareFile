<script setup lang="ts">
import type { ThemeMode } from '../../stores/ui';

interface ThemeOption {
  mode: ThemeMode;
  title: string;
  iconClass: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  { mode: 'auto', title: '自动深色模式', iconClass: 'fas fa-adjust' },
  { mode: 'light', title: '浅色模式', iconClass: 'fas fa-sun' },
  { mode: 'dark', title: '深色模式', iconClass: 'fas fa-moon' },
];

defineProps<{ theme: ThemeMode }>();

const emit = defineEmits<{ select: [mode: ThemeMode] }>();
</script>

<template>
  <div class="theme-switch" role="group" aria-label="外观主题">
    <button
      v-for="option in THEME_OPTIONS"
      :key="option.mode"
      type="button"
      :class="{ active: theme === option.mode }"
      :title="option.title"
      :aria-label="option.title"
      :aria-pressed="theme === option.mode"
      @click="emit('select', option.mode)"
    >
      <i :class="option.iconClass" />
    </button>
  </div>
</template>
