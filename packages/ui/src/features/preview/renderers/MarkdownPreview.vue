<script setup lang="ts">
import { onMounted, ref } from 'vue';

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

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const status = ref<PreviewStatus>('loading');
const html = ref('');

let sanitizerPromise: Promise<Sanitizer> | null = null;

function getSanitizer(): Promise<Sanitizer> {
  sanitizerPromise ??= (async () => {
    const { default: DOMPurify } = await import('dompurify');

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
    const [response, sanitize] = await Promise.all([
      fetch(props.fileUrl),
      getSanitizer(),
    ]);
    const [{ marked }, text] = await Promise.all([
      import('marked'),
      response.text(),
    ]);
    const rendered = marked.parse(text, { async: false });

    html.value = sanitize(rendered);
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
  <!-- eslint-disable-next-line vue/no-v-html -- marked 输出已经过 DOMPurify 消毒 -->
  <div v-else class="rendered-markdown" v-html="html" />
</template>
