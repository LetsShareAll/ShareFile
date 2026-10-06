<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AppBreadcrumb from '../../components/AppBreadcrumb.vue';
import { getNodeFileUrl, getNodeFilePath } from '../../domain/links';
import { getBreadcrumbSegments } from '../../domain/paths';
import { useLibraryStore } from '../../stores/library';
import { findDirectoryReadme } from '../../domain/readme';
import { sortNodes } from '../../domain/sort';
import DirectoryReadme from './components/DirectoryReadme.vue';
import PreviewModal from '../preview/PreviewModal.vue';
import { triggerFileDownload } from '../../platform/download';
import type { ShareNode } from '../../domain/share-file';
import { usePreviewStore } from '../../stores/preview';
import { useNodeActivation } from './useNodeActivation';
import { useUiStore } from '../../stores/ui';
import SearchBox from '../search/SearchBox.vue';
import ThemeSwitch from '../settings/ThemeSwitch.vue';
import SortControl from '../settings/SortControl.vue';
import ViewSwitch from '../settings/ViewSwitch.vue';
import FileListDetail from './components/FileListDetail.vue';
import FileListIcon from './components/FileListIcon.vue';
import { copyText } from '../../platform/clipboard';
import { buildDirectoryShare } from './share';
import {
  BROWSE_EMPTY_STATES,
  createNodeRow,
  resolveNodeDisplay,
} from './nodeDisplay';

const route = useRoute();
const router = useRouter();
const library = useLibraryStore();
const { activateNode } = useNodeActivation();
const preview = usePreviewStore();

function downloadNode(target: ShareNode): void {
  triggerFileDownload(target);
}

const ui = useUiStore();

const currentPath = computed(() => {
  const match = route.params.pathMatch;
  const segments = Array.isArray(match) ? match : match ? [match] : [];

  return segments.length ? `/${segments.join('/')}` : '/';
});

const currentNode = computed(() =>
  library.resolveNodeByPath(currentPath.value),
);
const searchQuery = computed(() => ui.query.trim());
const isSearching = computed(() => searchQuery.value.length > 0);

const rows = computed(() => {
  const nodes = isSearching.value
    ? library.search(searchQuery.value)
    : library.getChildNodes(currentPath.value);

  return sortNodes(nodes, ui.sortKey, ui.sortDirection, {
    getPath: nodeId => library.getNodePathById(nodeId),
    getTypeClass: node => resolveNodeDisplay(node).className,
  }).map(node => createNodeRow(node, library.getNodePathById(node.id)));
});

const directFileNode = computed(() =>
  !isSearching.value && currentNode.value?.type === 'file'
    ? currentNode.value
    : null,
);

const directoryDescription = computed(() =>
  !isSearching.value && currentNode.value?.id !== library.rootId
    ? (currentNode.value?.description ?? '')
    : '',
);

const emptyState = computed(
  () =>
    BROWSE_EMPTY_STATES[
      isSearching.value ? 'search' : currentNode.value ? 'directory' : 'missing'
    ],
);

const directoryReadme = computed(() =>
  findDirectoryReadme(library.data, currentPath.value),
);

const breadcrumbExternalPaths = computed(() =>
  getBreadcrumbSegments(currentPath.value)
    .filter(
      segment => library.resolveNodeByPath(segment.path)?.source === 'external',
    )
    .map(segment => segment.path),
);

const SHARE_FEEDBACK_MS = 1500;

type ShareAction = 'page' | 'manifest' | 'download';

interface ShareActionItem {
  key: ShareAction;
  label: string;
  iconClass: string;
  text: string;
}

const shareOpen = ref(false);
const copiedAction = ref<ShareAction | null>(null);
const shareRoot = ref<HTMLElement | null>(null);
let copiedTimer: number | undefined;

// 路径不存在（错误态）或索引未就绪时不提供分享入口。
const shareVisible = computed(
  () => !library.error && Boolean(currentNode.value),
);

// 只有「当前路径恰好是文件深链」时才有下载示例——目录没有字节。
const shareDownloadPath = computed(() =>
  currentNode.value?.type === 'file'
    ? getNodeFilePath(currentNode.value)
    : null,
);

const share = computed(() =>
  buildDirectoryShare(
    currentPath.value,
    window.location.origin,
    shareDownloadPath.value,
  ),
);

const shareActions = computed<ShareActionItem[]>(() => [
  {
    key: 'page',
    label: '复制页面链接',
    iconClass: 'fas fa-link',
    text: share.value.pageUrl,
  },
  {
    key: 'manifest',
    label: '复制直链清单命令',
    iconClass: 'fas fa-terminal',
    text: share.value.manifestCommand,
  },
  ...(share.value.downloadCommand
    ? [
        {
          key: 'download' as const,
          label: '复制 curl 下载示例',
          iconClass: 'fas fa-download',
          text: share.value.downloadCommand,
        },
      ]
    : []),
]);

function closeShare(): void {
  shareOpen.value = false;
}

function toggleShare(): void {
  shareOpen.value = !shareOpen.value;
}

function onSharePointerDown(event: PointerEvent): void {
  const root = shareRoot.value;

  if (root && event.target instanceof Node && !root.contains(event.target)) {
    closeShare();
  }
}

function onShareKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeShare();
}

function copyShare(action: ShareActionItem): void {
  void copyText(action.text).then(succeeded => {
    if (!succeeded) {
      console.error('复制失败');

      return;
    }

    copiedAction.value = action.key;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedAction.value = null;
    }, SHARE_FEEDBACK_MS);
  });
}

watch(shareOpen, open => {
  if (open) {
    document.addEventListener('pointerdown', onSharePointerDown, true);
    window.addEventListener('keydown', onShareKeydown);

    return;
  }

  document.removeEventListener('pointerdown', onSharePointerDown, true);
  window.removeEventListener('keydown', onShareKeydown);
});

// 换目录后旧命令即失效，直接收起浮层。
watch(currentPath, closeShare);

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onSharePointerDown, true);
  window.removeEventListener('keydown', onShareKeydown);
  window.clearTimeout(copiedTimer);
});

// 深链到文件：与旧实现一致，渲染下载态后由 rAF 触发一次下载。
watch(
  directFileNode,
  node => {
    if (!node) return;

    requestAnimationFrame(() => activateNode(node));
  },
  { immediate: true },
);

function navigate(path: string): void {
  if (isSearching.value) ui.clearQuery();

  void router.push(path);
}
</script>

<template>
  <div class="container" :class="`view-${ui.view}`">
    <header>
      <h1><i class="fas fa-share-alt" /> 一起分享吧！文件！</h1>
      <div class="toolbar">
        <SortControl
          :sort-key="ui.sortKey"
          :sort-direction="ui.sortDirection"
          @select="ui.setSortKey"
          @toggle="ui.toggleSortDirection"
        />
        <ViewSwitch :view="ui.view" @select="ui.setView" />
        <div v-if="shareVisible" ref="shareRoot" class="share-menu">
          <button
            type="button"
            class="glass share-btn"
            :class="{ active: shareOpen }"
            title="分享当前目录"
            aria-label="分享当前目录"
            aria-haspopup="menu"
            :aria-expanded="shareOpen"
            @click="toggleShare"
          >
            <i class="fas fa-share-nodes" />
          </button>
          <div
            v-if="shareOpen"
            class="glass--strong share-popover"
            role="menu"
            aria-label="分享当前目录"
          >
            <button
              v-for="action in shareActions"
              :key="action.key"
              type="button"
              class="share-action"
              :class="{ copied: copiedAction === action.key }"
              role="menuitem"
              :title="action.label"
              @click="copyShare(action)"
            >
              <i :class="action.iconClass" />
              <span>{{
                copiedAction === action.key ? '已复制' : action.label
              }}</span>
            </button>
          </div>
        </div>
        <button
          v-if="library.hasExternalMounts"
          class="refresh-btn"
          title="刷新外部源"
          :disabled="library.externalLoading"
          @click="library.refreshExternalSources()"
        >
          <i
            class="fas fa-sync-alt"
            :class="{ 'fa-spin': library.externalLoading }"
          />
        </button>
        <ThemeSwitch :theme="ui.theme" @select="ui.setTheme" />
      </div>
    </header>

    <div class="search-panel">
      <SearchBox
        :model-value="ui.query"
        @update:model-value="ui.setQuery"
        @clear="ui.clearQuery"
      />
    </div>

    <AppBreadcrumb
      :path="currentPath"
      :external-paths="breadcrumbExternalPaths"
      @navigate="navigate"
    />

    <div v-if="library.loading" class="loading-container">
      <i class="fas fa-circle-notch fa-spin fa-3x" />
      <p>正在加载索引数据...</p>
    </div>

    <main v-else aria-live="polite">
      <p v-if="library.error" class="error">
        <i class="fas fa-exclamation-triangle" /> 加载失败：{{ library.error }}
      </p>

      <div v-else-if="directFileNode" class="direct-download-state">
        <p class="empty direct-download-message">
          <i class="fas fa-download" /> 正在下载文件
        </p>
        <a
          class="action-btn direct-download-link"
          :href="getNodeFileUrl(directFileNode)"
          :download="directFileNode.name"
        >
          <i class="fas fa-download" /><span>如果下载未开始，请点击这里</span>
        </a>
      </div>

      <template v-else>
        <p v-if="isSearching" class="search-results-header search-summary">
          搜索 "{{ searchQuery }}"，找到 {{ rows.length }} 项
        </p>
        <p v-else-if="directoryDescription" class="directory-description">
          {{ directoryDescription }}
        </p>
        <component
          :is="ui.view === 'icon' ? FileListIcon : FileListDetail"
          v-if="rows.length"
          :rows="rows"
          :show-path="isSearching"
          @open="activateNode"
          @download="downloadNode"
          @navigate="navigate"
        />
        <p v-else :class="emptyState.className">
          <i :class="emptyState.iconClass" /> {{ emptyState.text }}
        </p>

        <DirectoryReadme
          v-if="!isSearching && rows.length && directoryReadme"
          :node="directoryReadme"
          :path="currentPath"
        />
      </template>
    </main>

    <PreviewModal
      :visible="preview.isOpen"
      :title="preview.title"
      :loading="preview.loading"
      @close="preview.close()"
    >
      <p v-if="preview.error" class="empty error">{{ preview.error }}</p>
      <component
        :is="preview.component"
        v-else-if="preview.component"
        v-bind="preview.componentProps"
      />
    </PreviewModal>
  </div>
</template>

<style scoped>
/* 玻璃配方来自 base.css 的 .glass / .glass--strong，这里只补布局与复制反馈。 */
/* 头部自成一个层叠上下文（毛玻璃），不抬高层级时下拉浮层会被搜索框盖住。 */
header {
  position: relative;
  z-index: 10;
}

.share-menu {
  position: relative;
  display: flex;
}

.share-btn {
  padding: 8px 12px;
  font-size: 16px;
  line-height: 1;
  color: var(--text);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: background-color var(--duration-normal) var(--ease-standard);
}

.share-btn:hover {
  background-color: var(--glass-surface-strong);
}

.share-btn.active {
  background-color: var(--button-active-bg);
  color: var(--button-active-color);
}

.share-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 15rem;
  padding: 0.4rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-floating);
}

.share-action {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
  text-align: left;
  background: none;
  border: 0;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.share-action i {
  width: 1.1em;
  color: var(--text-secondary);
}

.share-action:hover {
  background-color: var(--button-hover-bg);
}

.share-action.copied,
.share-action.copied i {
  color: var(--color-success);
}
</style>
