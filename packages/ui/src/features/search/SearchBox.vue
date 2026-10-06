<script setup lang="ts">
defineProps<{ modelValue: string }>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  clear: [];
}>();

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;

  emit('update:modelValue', target.value);
}
</script>

<template>
  <label class="search-box" aria-label="搜索文件">
    <i class="fas fa-search" />
    <input
      type="search"
      :value="modelValue"
      placeholder="搜索文件"
      aria-label="搜索文件"
      @input="onInput"
      @keydown.esc.prevent="emit('clear')"
    />
  </label>
</template>
