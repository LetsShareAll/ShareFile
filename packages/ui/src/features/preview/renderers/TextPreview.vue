<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { readLimitedText, type LimitedText } from '../largeFile';
import PreviewTruncation from '../PreviewTruncation.vue';
import PreviewLoading from './PreviewLoading.vue';

type PreviewStatus = 'loading' | 'ready' | 'error';

const props = defineProps<{
  fileUrl: string;
  name: string;
  mime?: string;
  /** 节点元数据体积：仅用于大文件护栏的提前判定与「共 N」展示。 */
  size?: number;
}>();

const status = ref<PreviewStatus>('loading');
const result = ref<LimitedText | null>(null);

async function load(): Promise<void> {
  status.value = 'loading';

  try {
    result.value = await readLimitedText(props.fileUrl, props.size);
    status.value = 'ready';
  } catch {
    status.value = 'error';
  }
}

onMounted(load);
watch(() => props.fileUrl, load);
</script>

<template>
  <PreviewLoading v-if="status === 'loading'" />
  <p v-else-if="status === 'error'" class="error">预览加载失败</p>
  <div v-else-if="result" class="text-preview">
    <PreviewTruncation
      v-if="result.truncated"
      :file-url="fileUrl"
      :name="name"
      :lines="result.lines"
      :total-bytes="result.totalBytes"
    />
    <div class="rendered-markdown">
      <pre style="white-space: pre-wrap">{{ result.text }}</pre>
    </div>
  </div>
</template>
