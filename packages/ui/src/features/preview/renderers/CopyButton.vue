<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { copyText } from '../../../platform/clipboard';

const FEEDBACK_MS = 1500;

type CopyState = 'idle' | 'copied' | 'failed';

const props = defineProps<{ text: string }>();

const state = ref<CopyState>('idle');
let resetTimer: number | undefined;

const iconClass = computed(() => {
  if (state.value === 'copied') return 'fas fa-check';

  if (state.value === 'failed') return 'fas fa-exclamation-triangle';

  return 'fas fa-copy';
});

const label = computed(() => {
  if (state.value === 'copied') return '已复制';

  if (state.value === 'failed') return '失败';

  return '复制';
});

function clearResetTimer(): void {
  if (resetTimer === undefined) return;

  window.clearTimeout(resetTimer);
  resetTimer = undefined;
}

async function copy(): Promise<void> {
  const succeeded = await copyText(props.text);

  state.value = succeeded ? 'copied' : 'failed';
  clearResetTimer();
  resetTimer = window.setTimeout(() => {
    state.value = 'idle';
    resetTimer = undefined;
  }, FEEDBACK_MS);
}

onBeforeUnmount(clearResetTimer);
</script>

<template>
  <button class="code-copy-button" type="button" @click="copy">
    <i :class="iconClass" />
    <span>{{ label }}</span>
  </button>
</template>
