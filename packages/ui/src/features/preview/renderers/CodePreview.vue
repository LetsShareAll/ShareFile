<script setup lang="ts">
import { onMounted, ref } from 'vue';

import CopyButton from './CopyButton.vue';
import PreviewLoading from './PreviewLoading.vue';
import { getCodeLanguage, highlightCodeLines } from './codeHighlight';

type PreviewStatus = 'loading' | 'ready' | 'error';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const status = ref<PreviewStatus>('loading');
const language = ref('plaintext');
const source = ref('');
const lines = ref<string[]>([]);

async function load(): Promise<void> {
  status.value = 'loading';

  try {
    const response = await fetch(props.fileUrl);
    const text = await response.text();
    const detected = getCodeLanguage(props.name, props.mime);
    const highlighted = await highlightCodeLines(text, detected);

    source.value = text;
    language.value = detected;
    lines.value = highlighted;
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
  <div v-else class="code-preview">
    <div class="code-preview-toolbar">
      <span class="code-preview-language">{{ language }}</span>
      <CopyButton :text="source" />
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
