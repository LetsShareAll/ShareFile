<script setup lang="ts">
import { RESTRICTED_NOTICE } from '../../../domain/share-file';
</script>

<template>
  <span
    class="restricted-indicator"
    role="img"
    :aria-label="RESTRICTED_NOTICE"
    :title="RESTRICTED_NOTICE"
  >
    <i class="fas fa-lock" aria-hidden="true" />
    <span class="restricted-indicator-text">受限</span>
  </span>
</template>

<style scoped>
.restricted-indicator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.4rem;
  color: var(--status-warning-text);
  font-size: 0.68rem;
  font-weight: 500;
  line-height: 1.4;
  background: var(--status-warning-tint);
  border-radius: var(--radius-pill);
}
</style>
