<script setup lang="ts">
withDefaults(defineProps<{ message?: string }>(), {
  message: '正在加载预览...',
});
</script>

<template>
  <div class="preview-loading-state" role="status" aria-live="polite">
    <span class="preview-loading-spinner" aria-hidden="true" />
    <span class="preview-loading-text">{{ message }}</span>
  </div>
</template>
