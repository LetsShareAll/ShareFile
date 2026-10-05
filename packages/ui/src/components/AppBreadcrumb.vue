<script setup lang="ts">
import { computed } from 'vue';

import { formatBrowserPath, getBreadcrumbSegments } from '../domain/paths';

const props = defineProps<{
  path: string;
  externalPaths?: readonly string[];
}>();

const emit = defineEmits<{ navigate: [path: string] }>();

const segments = computed(() =>
  getBreadcrumbSegments(props.path).map(segment => ({
    ...segment,
    isExternal: props.externalPaths?.includes(segment.path) ?? false,
  })),
);

function navigate(path: string): void {
  emit('navigate', path);
}
</script>

<template>
  <nav
    class="breadcrumb"
    aria-label="面包屑导航"
  >
    <a
      href="/"
      @click.prevent="navigate('/')"
    >root</a>
    <template
      v-for="segment in segments"
      :key="segment.path"
    >
      <span> / </span>
      <span
        v-if="segment.isCurrent"
        class="current"
        :class="{ 'external-breadcrumb': segment.isExternal }"
      >
        <i
          v-if="segment.isExternal"
          class="fas fa-link external-breadcrumb-icon"
          aria-hidden="true"
        />
        {{ segment.label }}
      </span>
      <a
        v-else
        :href="formatBrowserPath(segment.path)"
        :class="{ 'external-breadcrumb': segment.isExternal }"
        @click.prevent="navigate(segment.path)"
      >
        <i
          v-if="segment.isExternal"
          class="fas fa-link external-breadcrumb-icon"
          aria-hidden="true"
        />
        {{ segment.label }}
      </a>
    </template>
  </nav>
</template>
