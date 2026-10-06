<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import PreviewLoading from './PreviewLoading.vue';
import {
  buildFontFaceCss,
  clampFontSize,
  createFontFamily,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_SAMPLE_TEXT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_WEIGHTS,
  FONT_WEIGHT_NOTE,
  LOAD_TIMEOUT_MS,
  resolveFontFormat,
  specimenLines,
} from './font/fontSpecimen';

type PreviewStatus = 'loading' | 'loaded' | 'error';

const props = defineProps<{ fileUrl: string; name: string; mime?: string }>();

const status = ref<PreviewStatus>('loading');
const message = ref('正在加载字体...');
const family = ref(createFontFamily(props.fileUrl, props.name));
const fontSize = ref(DEFAULT_FONT_SIZE);
const fontWeight = ref(DEFAULT_FONT_WEIGHT);
const text = ref(DEFAULT_SAMPLE_TEXT);

/** 滑杆回写统一走钳制，避免拖到边界外或拿到非法值。 */
const size = computed({
  get: () => fontSize.value,
  set: (value: number) => {
    fontSize.value = clampFontSize(value);
  },
});

const lines = computed(() => specimenLines(text.value));
const meta = computed(() =>
  props.mime ? `${props.name} · ${props.mime}` : props.name,
);
const specimenStyle = computed(() => ({
  fontFamily: `"${family.value}", sans-serif`,
  fontSize: `${clampFontSize(fontSize.value)}px`,
  fontWeight: fontWeight.value,
}));

let styleEl: HTMLStyleElement | null = null;
let timer: number | undefined;

/** 卸载或切换文件时，同时清掉注入的样式与 FontFaceSet 条目。 */
function removeInjectedFont(): void {
  window.clearTimeout(timer);
  timer = undefined;
  styleEl?.remove();
  styleEl = null;

  const faces = [...document.fonts].filter(
    face => face.family.replace(/^["']|["']$/g, '') === family.value,
  );

  faces.forEach(face => document.fonts.delete(face));
}

function withTimeout(task: Promise<unknown>): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    timer = window.setTimeout(
      () => reject(new Error('字体加载超时')),
      LOAD_TIMEOUT_MS,
    );
    task.then(resolve, reject).finally(() => {
      window.clearTimeout(timer);
      timer = undefined;
    });
  });
}

async function loadFont(): Promise<void> {
  removeInjectedFont();
  status.value = 'loading';
  message.value = '正在加载字体...';
  family.value = createFontFamily(props.fileUrl, props.name);

  styleEl = document.createElement('style');
  styleEl.dataset.fontPreview = family.value;
  styleEl.textContent = buildFontFaceCss(
    family.value,
    props.fileUrl,
    resolveFontFormat(props.name),
  );
  document.head.append(styleEl);

  try {
    await withTimeout(document.fonts.load(`1em "${family.value}"`, text.value));

    if (!document.fonts.check(`1em "${family.value}"`)) {
      throw new Error('字体未生效');
    }

    status.value = 'loaded';
  } catch {
    status.value = 'error';
    message.value = '字体加载失败，可下载后在本地查看';
  }
}

function resetSample(): void {
  text.value = DEFAULT_SAMPLE_TEXT;
}

onMounted(loadFont);

watch(() => [props.fileUrl, props.name], loadFont);

onBeforeUnmount(removeInjectedFont);
</script>

<template>
  <div
    class="preview-load-frame"
    :class="{
      'is-loading': status !== 'loaded',
      'is-loaded': status === 'loaded',
    }"
  >
    <PreviewLoading v-if="status !== 'loaded'" :message="message" />

    <template v-else>
      <div class="font-preview-controls">
        <input
          v-model.number="size"
          class="font-preview-slider"
          type="range"
          :min="FONT_SIZE_MIN"
          :max="FONT_SIZE_MAX"
          aria-label="字号"
        />
        <span>{{ clampFontSize(fontSize) }}px</span>
        <select
          v-model.number="fontWeight"
          class="font-preview-weight"
          aria-label="字重"
        >
          <option v-for="weight in FONT_WEIGHTS" :key="weight">
            {{ weight }}
          </option>
        </select>
        <button class="action-btn" @click="resetSample">恢复默认样张</button>
      </div>
      <p class="font-preview-note">{{ FONT_WEIGHT_NOTE }}</p>

      <input
        v-model="text"
        class="font-preview-input"
        type="text"
        aria-label="自定义预览文字"
      />

      <div class="font-preview-specimen" :style="specimenStyle">
        <p v-for="(line, index) in lines" :key="index">{{ line || ' ' }}</p>
      </div>

      <p class="font-preview-meta">{{ meta }}</p>
    </template>
  </div>
</template>

<style scoped>
.font-preview-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
  margin-bottom: 0.6rem;
}
.font-preview-slider {
  width: 9rem;
  accent-color: var(--primary);
}
.font-preview-weight,
.font-preview-input {
  padding: 0.35rem 0.6rem;
  color: var(--text);
  /* 表单控件属于控件层 */
  background: var(--glass-surface);
  border: 1px solid var(--glass-stroke);
  border-radius: var(--radius-xs);
}
.font-preview-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.9rem;
}
.font-preview-note {
  margin-bottom: 0.6rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.font-preview-specimen {
  padding: 1rem;
  overflow-wrap: anywhere;
  line-height: 1.5;
  background: var(--glass-surface-subtle);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
}
.font-preview-specimen p {
  margin: 0 0 0.35rem;
}
.font-preview-meta {
  margin-top: 0.6rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
}
</style>
