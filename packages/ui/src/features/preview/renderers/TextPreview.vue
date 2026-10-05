<script setup lang="ts">
import { onMounted, ref } from 'vue';

import PreviewLoading from './PreviewLoading.vue';

type PreviewStatus = 'loading' | 'ready' | 'error';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const status = ref<PreviewStatus>('loading');
const text = ref('');

async function load(): Promise<void> {
  status.value = 'loading';

  try {
    const response = await fetch(props.fileUrl);

    text.value = await response.text();
    status.value = 'ready';
  } catch {
    status.value = 'error';
  }
}

onMounted(load);
</script>

<template>
  <PreviewLoading v-if="status === 'loading'" />
  <p v-else-if="status === 'error'" class="error">预览加载失败</p>
  <div v-else class="rendered-markdown">
    <pre style="white-space: pre-wrap">{{ text }}</pre>
  </div>
</template>
