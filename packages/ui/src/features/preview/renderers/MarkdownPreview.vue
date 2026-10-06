<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

import { loadDomPurify } from '../../../platform/sanitize';
import { readLimitedText, type LimitedText } from '../largeFile';
import PreviewTruncation from '../PreviewTruncation.vue';
import PreviewLoading from './PreviewLoading.vue';

const MARKDOWN_ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'input',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const MARKDOWN_ALLOWED_ATTR = [
  'align',
  'alt',
  'checked',
  'class',
  'disabled',
  'href',
  'rel',
  'src',
  'start',
  'target',
  'title',
  'type',
];

type PreviewStatus = 'loading' | 'ready' | 'error';
type Sanitizer = (html: string) => string;

const props = defineProps<{
  fileUrl: string;
  name: string;
  mime?: string;
  /** 节点元数据体积：仅用于大文件护栏的提前判定与「共 N」展示。 */
  size?: number;
}>();

const status = ref<PreviewStatus>('loading');
const html = ref('');
const result = ref<LimitedText | null>(null);

let sanitizerPromise: Promise<Sanitizer> | null = null;

function getSanitizer(): Promise<Sanitizer> {
  sanitizerPromise ??= (async () => {
    const DOMPurify = await loadDomPurify();

    return (dirty: string) =>
      DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: MARKDOWN_ALLOWED_TAGS,
        ALLOWED_ATTR: MARKDOWN_ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
      });
  })();

  return sanitizerPromise;
}

async function load(): Promise<void> {
  status.value = 'loading';

  try {
    const [limited, sanitize] = await Promise.all([
      readLimitedText(props.fileUrl, props.size),
      getSanitizer(),
    ]);
    const { marked } = await import('marked');
    const rendered = marked.parse(limited.text, { async: false });

    result.value = limited;
    html.value = sanitize(rendered);
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
  <div v-else-if="result" class="markdown-preview">
    <PreviewTruncation
      v-if="result.truncated"
      :file-url="fileUrl"
      :name="name"
      :lines="result.lines"
      :total-bytes="result.totalBytes"
    />
    <div class="rendered-markdown" v-html="html" />
  </div>
</template>
