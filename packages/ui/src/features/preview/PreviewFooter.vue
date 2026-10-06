<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { formatSize, getRelativeTime } from '../../domain/format';
import { getCurlCommand } from '../../domain/links';
import type { ShareNode } from '../../domain/share-file';
import { copyText } from '../../platform/clipboard';
import { openPreviewInNewTab } from './actions';

const FEEDBACK_MS = 1500;

type CopyTarget = 'direct' | 'page' | 'curl' | 'md5' | 'sha256';

interface HashEntry {
  kind: 'md5' | 'sha256';
  label: string;
  value: string;
}

const props = defineProps<{
  node: ShareNode;
  fileUrl: string;
  pageUrl: string;
  /** 外挂节点的挂载点路径（由弹窗按索引解析），本地节点为空。 */
  mountPath?: string;
  canNavigate?: boolean;
}>();

const expanded = ref(false);
const copied = ref<CopyTarget | null>(null);
let resetTimer: number | undefined;

const hashes = computed<HashEntry[]>(() => {
  const entries: { kind: HashEntry['kind']; label: string; value?: string }[] =
    [
      { kind: 'md5', label: 'MD5', value: props.node.md5 },
      { kind: 'sha256', label: 'SHA-256', value: props.node.sha256 },
    ];

  return entries.filter(
    (entry): entry is HashEntry => typeof entry.value === 'string',
  );
});

const timeText = computed(() =>
  props.node.updated_at ? getRelativeTime(props.node.updated_at) : '未知时间',
);

const sourceText = computed(() =>
  props.node.source === 'external'
    ? `外部源 ${props.mountPath || props.node.mount_point || '/'}`
    : '本地',
);

function copy(target: CopyTarget, value: string): void {
  void copyText(value).then(succeeded => {
    if (!succeeded) {
      console.error('复制失败');

      return;
    }

    copied.value = target;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      copied.value = null;
    }, FEEDBACK_MS);
  });
}

function label(target: CopyTarget, text: string): string {
  return copied.value === target ? '已复制' : text;
}

onBeforeUnmount(() => window.clearTimeout(resetTimer));
</script>

<template>
  <footer class="preview-footer">
    <div class="preview-footer-meta">
      <span class="preview-meta-item">{{ formatSize(node.size) }}</span>
      <span class="preview-meta-sep">·</span>
      <span class="preview-meta-item">更新 {{ timeText }}</span>
      <span class="preview-meta-source">
        <span class="preview-meta-sep">·</span>
        来源：{{ sourceText }}
      </span>
      <button
        v-if="hashes.length"
        class="preview-hash-toggle"
        type="button"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <i class="fas fa-fingerprint" /> 哈希
      </button>
    </div>

    <div v-if="expanded && hashes.length" class="preview-hash-list">
      <div v-for="entry in hashes" :key="entry.kind" class="preview-hash-row">
        <span class="preview-hash-label">{{ entry.label }}</span>
        <code class="preview-hash-value">{{ entry.value }}</code>
        <button
          class="preview-action-btn"
          type="button"
          :title="`复制 ${entry.label}`"
          :aria-label="`复制 ${entry.label}`"
          @click="copy(entry.kind, entry.value)"
        >
          {{ label(entry.kind, '复制') }}
        </button>
      </div>
    </div>

    <div class="preview-footer-actions">
      <button
        class="preview-action-btn"
        type="button"
        title="复制直链"
        @click="copy('direct', fileUrl)"
      >
        <i class="fas fa-copy" /> {{ label('direct', '复制直链') }}
      </button>
      <button
        class="preview-action-btn"
        type="button"
        title="复制页面链接"
        @click="copy('page', pageUrl)"
      >
        <i class="fas fa-link" /> {{ label('page', '复制页面链接') }}
      </button>
      <button
        class="preview-action-btn"
        type="button"
        title="复制 curl 命令"
        @click="copy('curl', getCurlCommand(fileUrl))"
      >
        <i class="fas fa-terminal" /> {{ label('curl', '复制 curl 命令') }}
      </button>
      <span
        v-if="canNavigate"
        class="preview-nav-hint"
        title="使用 ← / → 切换当前列表里的文件"
      >
        ← / → 切换文件
      </span>
      <button
        class="preview-action-btn preview-footer-newtab"
        type="button"
        title="新标签打开"
        @click="openPreviewInNewTab(fileUrl)"
      >
        <i class="fas fa-up-right-from-square" /> 新标签打开
      </button>
    </div>
  </footer>
</template>
