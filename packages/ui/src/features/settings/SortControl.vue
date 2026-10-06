<script setup lang="ts">
import { SORT_KEYS, type SortDirection, type SortKey } from '../../domain/sort';

defineProps<{ sortKey: SortKey; sortDirection: SortDirection }>();

const emit = defineEmits<{ select: [key: SortKey]; toggle: [] }>();

const LABELS: Record<SortKey, string> = {
  default: '默认顺序',
  type: '文件类型',
  name: '文件名称',
  size: '文件大小',
  updated: '更新时间',
  created: '创建时间',
};

function onSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as SortKey;

  emit('select', value);
}
</script>

<template>
  <div class="sort-control" role="group" aria-label="排序方式">
    <select
      class="sort-select"
      :value="sortKey"
      aria-label="排序方式"
      @change="onSelect"
    >
      <option v-for="key in SORT_KEYS" :key="key" :value="key">
        {{ LABELS[key] }}
      </option>
    </select>
    <button
      type="button"
      class="action-btn sort-direction"
      :title="
        sortDirection === 'asc'
          ? '升序，点击切换为降序'
          : '降序，点击切换为升序'
      "
      :aria-label="sortDirection === 'asc' ? '当前升序' : '当前降序'"
      @click="emit('toggle')"
    >
      <i
        class="fas"
        :class="
          sortDirection === 'asc'
            ? 'fa-arrow-up-wide-short'
            : 'fa-arrow-down-wide-short'
        "
      />
    </button>
  </div>
</template>
