<script setup lang="ts">
import { computed } from 'vue';

import { getReadmeUrl } from '../../../domain/readme';
import type { ShareNode } from '../../../domain/share-file';
import MarkdownPreview from '../../preview/renderers/MarkdownPreview.vue';

const props = defineProps<{ node: ShareNode; path: string }>();

const fileUrl = computed(() => getReadmeUrl(props.node, props.path));
</script>

<template>
  <section class="preview-section">
    <h2><i class="fas fa-book-open" aria-hidden="true" /> README.md</h2>
    <MarkdownPreview :file-url="fileUrl" name="README.md" />
  </section>
</template>
