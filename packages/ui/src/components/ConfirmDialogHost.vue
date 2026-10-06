<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import {
  resolveConfirmDialog,
  useConfirmDialogState,
} from '../composables/useConfirmDialog';
import { sanitizeConfirmHtml } from '../platform/sanitize';

const state = useConfirmDialogState();

const sanitizedHtml = ref('');

watch(
  () => state.options?.html ?? '',
  async html => {
    sanitizedHtml.value = html ? await sanitizeConfirmHtml(html) : '';
  },
  { immediate: true },
);

function close(confirmed: boolean): void {
  resolveConfirmDialog(confirmed);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && state.open) close(false);
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

watch(
  () => state.open,
  open => {
    document.body.style.overflow = open ? 'hidden' : '';
  },
);
</script>

<template>
  <div
    v-if="state.open && state.options"
    class="modal-overlay show"
    @click.self="close(false)"
  >
    <div class="modal-content" role="dialog" aria-modal="true">
      <div class="modal-header">
        <span>{{ state.options.title }}</span>
        <button
          type="button"
          class="modal-close-btn"
          aria-label="关闭"
          @click="close(false)"
        >
          <i class="fas fa-times" aria-hidden="true" />
        </button>
      </div>

      <div class="modal-body">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <!-- eslint-disable-next-line vue/no-v-html -- 内容已由 sanitizeHtml 白名单消毒 -->
        <div
          v-if="sanitizedHtml"
          class="confirm-message"
          v-html="sanitizedHtml"
        />
        <p v-else-if="state.options.message" class="confirm-message">
          {{ state.options.message }}
        </p>

        <div class="confirm-buttons">
          <button type="button" class="action-btn" @click="close(false)">
            {{ state.options.cancelText ?? '取消' }}
          </button>
          <button
            type="button"
            class="action-btn confirm-primary"
            @click="close(true)"
          >
            {{ state.options.confirmText ?? '继续' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 弹窗外壳（.modal-overlay/.modal-content/.modal-header/.modal-close-btn/.modal-body）
   与旧站共用全局样式，见 src/styles/preview.css；这里只保留旧 CSS 没有的确认内容样式。 */
.confirm-message {
  font-size: 1.05rem;
  line-height: 1.6;
}

/* 确认框沿用预览弹窗的 strong 玻璃外壳，但要收成对话框宽度；
   scoped 选择器只作用在本组件的 .modal-content 上，不影响预览弹窗。 */
.modal-content {
  width: min(92vw, 30rem);
}

.confirm-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  margin-top: 2rem;
}

.confirm-primary {
  background: var(--primary);
  color: var(--text-on-accent);
  font-weight: 600;
}

.confirm-primary:hover {
  opacity: 0.8;
}
</style>
