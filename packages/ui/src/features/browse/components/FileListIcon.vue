<script setup lang="ts">
import type { ShareNode } from '../../../domain/share-file';
import {
  DEFAULT_NODE_DESCRIPTION,
  getNodeMetaText,
  type NodeRow,
} from '../nodeDisplay';
import {
  cancelHoverPrefetch,
  scheduleHoverPrefetch,
} from '../../preview/prefetch';
import NodeActions from './NodeActions.vue';

defineProps<{ rows: readonly NodeRow[]; showPath?: boolean }>();

const emit = defineEmits<{
  download: [node: ShareNode];
  open: [node: ShareNode];
  navigate: [path: string];
}>();

function activate(row: NodeRow): void {
  if (row.node.type === 'folder') {
    emit('navigate', row.path);

    return;
  }

  emit('open', row.node);
}
</script>

<template>
  <ul class="file-list">
    <li
      v-for="row in rows"
      :key="row.node.id"
      class="file-item"
      :class="[
        `item-${row.node.type}`,
        {
          'hidden-item': row.node.hidden,
          'external-item': row.node.source === 'external',
        },
      ]"
      tabindex="0"
      @mouseenter="scheduleHoverPrefetch(row.node)"
      @mouseleave="cancelHoverPrefetch()"
      @click="activate(row)"
      @keydown.enter.prevent="activate(row)"
    >
      <div class="item-main">
        <span class="item-icon" :class="row.display.className">
          <i :class="row.display.iconClass" />
        </span>
        <div class="item-copy">
          <span class="item-name" :title="row.node.name">
            <span class="item-name-text">{{ row.node.name }}</span>
            <span v-if="row.node.version" class="version-badge"
              >v{{ row.node.version }}</span
            >
            <span
              v-if="row.node.source === 'external'"
              class="external-indicator"
              :title="`来自外部源: ${row.node.mount_point || '/'}`"
            >
              <i class="fas fa-link" />
            </span>
          </span>
          <span
            class="item-description"
            :title="row.node.description || DEFAULT_NODE_DESCRIPTION"
            >{{ row.node.description || DEFAULT_NODE_DESCRIPTION }}</span
          >
          <span v-if="showPath" class="item-path" :title="row.path">{{
            row.path
          }}</span>
        </div>
        <div class="item-stats">
          <span class="meta-info item-meta">{{ getNodeMetaText(row) }}</span>
        </div>
        <NodeActions
          :node="row.node"
          :page-url="row.pageUrl"
          :file-url="row.fileUrl"
          @open="emit('open', $event)"
          @download="emit('download', $event)"
        />
      </div>
    </li>
  </ul>
</template>
