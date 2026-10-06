<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';

import { formatFileSizeUnit } from '../../../domain/format';
import { getCurlCommand } from '../../../domain/links';
import {
  isRestrictedNode,
  RESTRICTED_NOTICE,
  type ShareNode,
} from '../../../domain/share-file';
import { copyText } from '../../../platform/clipboard';
import { formatHashPreview } from '../nodeDisplay';

type HashKind = 'md5' | 'sha256';

interface HashEntry {
  kind: HashKind;
  label: string;
  value: string;
}

const props = defineProps<{
  node: ShareNode;
  pageUrl: string;
  fileUrl: string;
}>();

const emit = defineEmits<{
  open: [node: ShareNode];
  download: [node: ShareNode];
}>();

/**
 * 受限内容只挡分享入口（复制直链 / 页面链接 / curl）：静态站点无法阻止任何人
 * 直接访问 URL，所以下载与预览照常可用，见 `domain/share-file/restricted.ts`。
 */
const restricted = computed(() => isRestrictedNode(props.node));

function actionTitle(text: string): string {
  return restricted.value ? RESTRICTED_NOTICE : text;
}

const hashes = computed<HashEntry[]>(() => {
  const entries: { kind: HashKind; label: string; value?: string }[] = [
    { kind: 'md5', label: 'MD5', value: props.node.md5 },
    { kind: 'sha256', label: 'SHA-256', value: props.node.sha256 },
  ];

  return entries.filter(
    (entry): entry is HashEntry => typeof entry.value === 'string',
  );
});

const copiedHash = ref<HashKind | null>(null);
let resetTimer: number | undefined;

function copyValue(value: string): void {
  void copyText(value).then(succeeded => {
    if (!succeeded) console.error('复制失败');
  });
}

function copyHash(entry: HashEntry): void {
  copyValue(entry.value);
  copiedHash.value = entry.kind;
  window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => {
    copiedHash.value = null;
  }, 1500);
}

onUnmounted(() => window.clearTimeout(resetTimer));
</script>

<template>
  <div class="item-actions">
    <button
      type="button"
      class="action-btn"
      :disabled="restricted"
      :title="actionTitle('复制页面链接')"
      aria-label="复制页面链接"
      @click.stop="copyValue(pageUrl)"
    >
      <i class="fas fa-link" />
    </button>
    <template v-if="node.type === 'file'">
      <button
        type="button"
        class="action-btn"
        :disabled="restricted"
        :title="actionTitle('复制直链')"
        aria-label="复制直链"
        @click.stop="copyValue(fileUrl)"
      >
        <i class="fas fa-copy" />
      </button>
      <button
        type="button"
        class="action-btn"
        :disabled="restricted"
        :title="actionTitle('复制 curl 命令')"
        aria-label="复制 curl 命令"
        @click.stop="copyValue(getCurlCommand(fileUrl))"
      >
        <i class="fas fa-terminal" />
      </button>
      <button
        type="button"
        class="action-btn"
        :title="`下载文件 (${formatFileSizeUnit(node.size || 0)})`"
        aria-label="下载文件"
        @click.stop="emit('download', node)"
      >
        <i class="fas fa-download" />
      </button>
      <button
        v-for="entry in hashes"
        :key="entry.kind"
        type="button"
        class="action-btn hash-value"
        :class="{ copied: copiedHash === entry.kind }"
        :title="`复制 ${entry.label}: ${entry.value}`"
        :aria-label="`复制 ${entry.label}`"
        @click.stop="copyHash(entry)"
      >
        <span>{{ entry.label }}</span>
        <code>{{
          copiedHash === entry.kind ? '已复制' : formatHashPreview(entry.value)
        }}</code>
      </button>
    </template>
  </div>
</template>

<style scoped>
.hash-value.copied {
  color: var(--color-success);
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
