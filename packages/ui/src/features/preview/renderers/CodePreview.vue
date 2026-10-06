<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { readLimitedText, type LimitedText } from '../largeFile';
import PreviewTruncation from '../PreviewTruncation.vue';
import CopyButton from './CopyButton.vue';
import PreviewLoading from './PreviewLoading.vue';
import { getCodeLanguage, highlightCodeLines } from './codeHighlight';

type PreviewStatus = 'loading' | 'ready' | 'error';

const props = defineProps<{
  fileUrl: string;
  name: string;
  mime?: string;
  /** 节点元数据体积：仅用于大文件护栏的提前判定与「共 N」展示。 */
  size?: number;
}>();

const status = ref<PreviewStatus>('loading');
const language = ref('plaintext');
const result = ref<LimitedText | null>(null);
const lines = ref<string[]>([]);

async function load(): Promise<void> {
  status.value = 'loading';

  try {
    const limited = await readLimitedText(props.fileUrl, props.size);
    const detected = getCodeLanguage(props.name, props.mime);
    const highlighted = await highlightCodeLines(limited.text, detected);

    result.value = limited;
    language.value = detected;
    lines.value = highlighted;
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
  <div v-else-if="result" class="code-preview">
    <PreviewTruncation
      v-if="result.truncated"
      :file-url="fileUrl"
      :name="name"
      :lines="result.lines"
      :total-bytes="result.totalBytes"
    />
    <div class="code-preview-toolbar">
      <span class="code-preview-language">{{ language }}</span>
      <CopyButton :text="result.text" />
    </div>
    <div class="code-preview-content">
      <div class="code-preview-table">
        <div
          v-for="(line, index) in lines"
          :key="index"
          class="code-preview-line"
        >
          <span class="code-line-number">{{ index + 1 }}</span>
          <code class="code-line-content hljs" v-html="line || ' '" />
        </div>
      </div>
    </div>
  </div>
</template>
