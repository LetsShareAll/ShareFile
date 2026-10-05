<script setup lang="ts">
import type { ViewMode } from '../../stores/ui';

interface ViewOption {
  mode: ViewMode;
  title: string;
  iconClass: string;
}

const VIEW_OPTIONS: readonly ViewOption[] = [
  { mode: 'icon', title: '大图标模式', iconClass: 'fas fa-th-large' },
  { mode: 'detail', title: '详细信息模式', iconClass: 'fas fa-list' },
];

defineProps<{ view: ViewMode }>();

const emit = defineEmits<{ select: [mode: ViewMode] }>();
</script>

<template>
  <div
    class="view-switch"
    role="group"
    aria-label="视图模式"
  >
    <button
      v-for="option in VIEW_OPTIONS"
      :key="option.mode"
      type="button"
      :class="{ active: view === option.mode }"
      :title="option.title"
      :aria-label="option.title"
      :aria-pressed="view === option.mode"
      @click="emit('select', option.mode)"
    >
      <i :class="option.iconClass" />
    </button>
  </div>
</template>
