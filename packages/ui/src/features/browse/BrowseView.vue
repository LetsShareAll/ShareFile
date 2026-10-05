<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AppBreadcrumb from '../../components/AppBreadcrumb.vue';
import { getNodeFileUrl } from '../../domain/links';
import { getBreadcrumbSegments } from '../../domain/paths';
import { useLibraryStore } from '../../stores/library';
import { findDirectoryReadme } from '../../domain/readme';
import DirectoryReadme from './components/DirectoryReadme.vue';
import PreviewModal from '../preview/PreviewModal.vue';
import { triggerFileDownload } from '../../platform/download';
import type { ShareNode } from '../../domain/share-file';
import { usePreviewStore } from '../../stores/preview';
import { useNodeActivation } from './useNodeActivation';
import { useUiStore } from '../../stores/ui';
import SearchBox from '../search/SearchBox.vue';
import ThemeSwitch from '../settings/ThemeSwitch.vue';
import ViewSwitch from '../settings/ViewSwitch.vue';
import FileListDetail from './components/FileListDetail.vue';
import FileListIcon from './components/FileListIcon.vue';
import { BROWSE_EMPTY_STATES, createNodeRow } from './nodeDisplay';

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

const rows = computed(() =>
  (isSearching.value
    ? library.search(searchQuery.value)
    : library.getChildNodes(currentPath.value)
  ).map(node => createNodeRow(node, library.getNodePathById(node.id))),
);

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
        <ViewSwitch :view="ui.view" @select="ui.setView" />
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
