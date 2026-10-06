<script setup lang="ts">
import { computed } from 'vue';

import { MUSIC_MODES, type MusicMode } from '../track';

interface ModeMeta {
  icon: string;
  label: string;
}

/** 四态循环的顺序取自 track.ts，避免与 store 的判定漂移。 */
const MODE_META: Record<MusicMode, ModeMeta> = {
  sequence: { icon: 'fa-arrow-right-long', label: '顺序播放' },
  'loop-all': { icon: 'fa-repeat', label: '列表循环' },
  'loop-one': { icon: 'fa-arrow-rotate-right', label: '单曲循环' },
  shuffle: { icon: 'fa-shuffle', label: '随机播放' },
};

const props = defineProps<{ mode: MusicMode; variant: 'bar' | 'panel' }>();
const emit = defineEmits<{ select: [mode: MusicMode] }>();

const current = computed(() => MODE_META[props.mode]);
const label = computed(() => `播放模式：${current.value.label}，点击切换`);

function cycle(): void {
  const index = MUSIC_MODES.indexOf(props.mode);

  emit('select', MUSIC_MODES[(index + 1) % MUSIC_MODES.length]);
}
</script>

<template>
  <button
    type="button"
    :class="[`music-${variant}-mode`, { 'is-active': mode !== 'sequence' }]"
    :aria-label="label"
    :title="label"
    @click="cycle"
  >
    <i class="fas" :class="current.icon" aria-hidden="true" />
  </button>
</template>
