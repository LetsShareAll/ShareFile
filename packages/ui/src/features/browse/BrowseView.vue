<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useLibraryStore } from '../../stores/library';

const route = useRoute();
const library = useLibraryStore();

const currentPath = computed(() => {
  const match = route.params.pathMatch;
  const segments = Array.isArray(match) ? match : match ? [match] : [];

  return segments.length ? `/${segments.join('/')}` : '/';
});

const children = computed(() => library.getChildNodes(currentPath.value));
const currentNode = computed(() =>
  library.resolveNodeByPath(currentPath.value),
);
</script>

<template>
  <main class="browse">
    <p class="browse-path">当前路径：{{ currentPath }}</p>
    <p v-if="library.loading" class="browse-state">正在加载索引…</p>
    <p v-else-if="library.error" class="browse-state browse-error">
      {{ library.error }}
    </p>
    <template v-else>
      <p class="browse-state">
        节点 {{ library.nodeCount }} 个，当前目录子项 {{ children.length }} 个
      </p>
      <ul class="browse-list">
        <li v-for="child in children" :key="child.id">
          {{ child.type === 'folder' ? '📁' : '📄' }} {{ child.name }}
        </li>
      </ul>
      <p v-if="!currentNode && !library.loading" class="browse-state">
        这个路径在索引里不存在。
      </p>
    </template>
  </main>
</template>

<style scoped>
.browse {
  padding: 32px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue',
    sans-serif;
}

.browse-state {
  color: #6e6e73;
}

.browse-error {
  color: #d70015;
}

.browse-list {
  margin: 12px 0 0;
  padding-left: 18px;
}
</style>
