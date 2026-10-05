<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  watch,
} from 'vue';

import PreviewLoading from './renderers/PreviewLoading.vue';

const SHOW_DELAY_MS = 10;
const HIDE_TRANSITION_MS = 300;

const props = withDefaults(
  defineProps<{ visible: boolean; title: string; loading?: boolean }>(),
  { loading: false },
);

const emit = defineEmits<{ close: [] }>();

const rendered = ref(false);
const shown = ref(false);
const bodyEl = ref<HTMLElement | null>(null);
const hasCodeContent = ref(false);

let showTimer: number | undefined;
let hideTimer: number | undefined;
let previousOverflow: string | null = null;

function clearTimers(): void {
  if (showTimer !== undefined) {
    window.clearTimeout(showTimer);
    showTimer = undefined;
  }

  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function syncCodeContent(): void {
  hasCodeContent.value =
    bodyEl.value?.firstElementChild?.classList.contains('code-preview') ??
    false;
}

function lockScroll(): void {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function unlockScroll(): void {
  if (previousOverflow === null) return;

  document.body.style.overflow = previousOverflow;
  previousOverflow = null;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

async function open(): Promise<void> {
  clearTimers();
  rendered.value = true;
  lockScroll();
  window.addEventListener('keydown', onKeydown);
  await nextTick();
  showTimer = window.setTimeout(() => {
    shown.value = true;
    showTimer = undefined;
    syncCodeContent();
  }, SHOW_DELAY_MS);
}

function close(): void {
  clearTimers();
  shown.value = false;
  unlockScroll();
  window.removeEventListener('keydown', onKeydown);
  hideTimer = window.setTimeout(() => {
    rendered.value = false;
    hideTimer = undefined;
  }, HIDE_TRANSITION_MS);
}

function handleVisibleChange(value: boolean): void {
  if (value) {
    void open();

    return;
  }

  close();
}

watch(() => props.visible, handleVisibleChange);

onMounted(() => {
  if (props.visible) void open();
});

onUpdated(syncCodeContent);

onBeforeUnmount(() => {
  clearTimers();
  unlockScroll();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    v-if="rendered"
    class="modal-overlay"
    :class="{ show: shown }"
    role="dialog"
    aria-modal="true"
    @click.self="emit('close')"
  >
    <div class="modal-content">
      <div class="modal-header">
        <span>{{ title }}</span>
        <button class="modal-close-btn" type="button" @click="emit('close')">
          <i class="fas fa-times" />
        </button>
      </div>
      <div
        ref="bodyEl"
        class="modal-body"
        :class="{ 'modal-body-code': hasCodeContent }"
      >
        <PreviewLoading v-if="loading" message="正在加载预览..." />
        <slot v-else />
      </div>
    </div>
  </div>
</template>
