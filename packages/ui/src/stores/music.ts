import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  setMediaSessionHandlers,
  setMediaSessionPosition,
  syncMediaSessionTrack,
} from '../features/music/mediaSession';
import {
  createMusicHistoryLog,
  createMusicPersister,
  readMusicState,
} from '../features/music/persistence';
import {
  createPlayerRuntime,
  type MusicMetadataState,
} from '../features/music/playerRuntime';
import {
  DEFAULT_VOLUME,
  getNextIndex,
  getPrevIndex,
  type MusicHistoryEntry,
  type MusicMode,
  type MusicState,
  type MusicTrack,
} from '../features/music/track';

export type { MusicMetadataState } from '../features/music/playerRuntime';

export const useMusicStore = defineStore('music', () => {
  const queue = ref<MusicTrack[]>([]);
  const currentIndex = ref(-1);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(DEFAULT_VOLUME);
  const mode = ref<MusicMode>('sequence');
  const expanded = ref(false);
  const metadata = ref<MusicMetadataState>({ status: 'idle' });
  const error = ref<string | null>(null);

  const currentTrack = computed<MusicTrack | null>(
    () => queue.value[currentIndex.value] ?? null,
  );
  const historyLog = createMusicHistoryLog();
  const persist = createMusicPersister(
    (): MusicState => ({
      queue: queue.value,
      currentIndex: currentIndex.value,
      mode: mode.value,
      volume: volume.value,
      currentTime: currentTime.value,
    }),
  );

  let pendingResumeTime: number | null = null;
  let failures = 0;
  let lastPositionSecond = -1;

  const runtime = createPlayerRuntime({
    onTime: handleTime,
    onEnded: handleEnded,
    onError: handleAudioError,
    onDuration: value => {
      duration.value = value;
    },
    onPlayState: playing => {
      isPlaying.value = playing;

      if (!playing) persist(true);
    },
    onMetadata: state => {
      metadata.value = state;
      syncMediaSessionTrack(currentTrack.value, state);
    },
  });

  function handleTime(seconds: number): void {
    const whole = Math.floor(seconds);

    currentTime.value = seconds;

    if (whole !== lastPositionSecond) {
      lastPositionSecond = whole;
      setMediaSessionPosition(duration.value, seconds);
    }

    persist();
  }

  function handleEnded(): void {
    isPlaying.value = false;

    const index = getNextIndex(
      queue.value.length,
      currentIndex.value,
      mode.value,
    );

    if (index === null) {
      persist(true);

      return;
    }

    // 让 amplitude 的 ended 定时器（会 stop()）先跑完，避免它 pause 掉新曲目。
    setTimeout(() => playAtIndex(index), 0);
  }

  function handleAudioError(): void {
    const track = currentTrack.value;

    error.value = track ? `无法播放：${track.name}` : '音频播放失败';
    failures += 1;

    const next =
      failures < Math.max(queue.value.length, 1)
        ? getNextIndex(queue.value.length, currentIndex.value, mode.value)
        : null;

    if (next === null) {
      stopPlayback();

      return;
    }

    playAtIndex(next);
  }

  function stopPlayback(): void {
    runtime.pause();
    isPlaying.value = false;
    persist(true);
  }

  function playAtIndex(index: number | null): void {
    if (index === null || index < 0 || index >= queue.value.length) {
      stopPlayback();

      return;
    }

    void startAt(index);
  }

  async function startAt(index: number): Promise<void> {
    if (index < 0 || index >= queue.value.length) return;

    const changed = currentIndex.value !== index;
    const started = await runtime.start(queue.value, index, volume.value);

    if (!started) {
      error.value = '播放引擎加载失败';

      return;
    }

    error.value = null;
    currentIndex.value = index;

    if (changed) {
      currentTime.value = 0;
      duration.value = 0;
    }

    isPlaying.value = true;
    historyLog.push(queue.value[index]);
    runtime.loadMetadata(queue.value[index] ?? null);
    syncMediaSessionTrack(currentTrack.value, metadata.value);

    const resume = pendingResumeTime;

    if (resume !== null) {
      pendingResumeTime = null;
      runtime.seek(resume);
      currentTime.value = resume;
    }
  }

  async function playTracks(
    tracks: MusicTrack[],
    startId?: string,
  ): Promise<void> {
    if (tracks.length === 0) {
      clearQueue();

      return;
    }

    const found = startId ? tracks.findIndex(track => track.id === startId) : 0;

    queue.value = [...tracks];
    currentIndex.value = -1;
    currentTime.value = 0;
    duration.value = 0;

    await startAt(found < 0 ? 0 : found);
  }

  async function playTrack(
    track: MusicTrack,
    nextQueue?: MusicTrack[],
  ): Promise<void> {
    const source = nextQueue?.length ? nextQueue : [track];
    const tracks = source.some(item => item.id === track.id)
      ? source
      : [track, ...source];

    await playTracks(tracks, track.id);
  }

  function enqueue(track: MusicTrack): void {
    queue.value = [...queue.value, track];
  }

  function enqueueNext(track: MusicTrack): void {
    const at = currentIndex.value + 1;

    queue.value = [
      ...queue.value.slice(0, at),
      track,
      ...queue.value.slice(at),
    ];
  }

  function removeFromQueue(id: string): void {
    const index = queue.value.findIndex(track => track.id === id);

    if (index < 0) return;

    const rest = queue.value.filter((_, position) => position !== index);

    queue.value = rest;

    if (rest.length === 0) {
      clearQueue();

      return;
    }

    if (index === currentIndex.value) {
      stopPlayback();
      currentTime.value = 0;
      currentIndex.value = Math.min(index, rest.length - 1);
    } else if (index < currentIndex.value) {
      currentIndex.value -= 1;
    }
  }

  function clearQueue(): void {
    pendingResumeTime = null;
    runtime.release();
    queue.value = [];
    currentIndex.value = -1;
    currentTime.value = 0;
    duration.value = 0;
    isPlaying.value = false;
    error.value = null;
    persist(true);
  }

  async function toggle(): Promise<void> {
    if (queue.value.length === 0) return;

    if (isPlaying.value) {
      runtime.pause();
      isPlaying.value = false;
      persist(true);

      return;
    }

    if (runtime.hasQueue(queue.value)) {
      // 同一首：续播，保留暂停位置。
      runtime.resume();
      isPlaying.value = true;

      return;
    }

    await startAt(currentIndex.value < 0 ? 0 : currentIndex.value);
  }

  function next(): void {
    playAtIndex(
      getNextIndex(queue.value.length, currentIndex.value, mode.value),
    );
  }

  function prev(): void {
    const index = getPrevIndex(
      queue.value.length,
      currentIndex.value,
      mode.value,
    );

    if (index === null) {
      seek(0);

      return;
    }

    playAtIndex(index);
  }

  function seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;

    const target = Math.max(0, seconds);

    currentTime.value = target;
    setMediaSessionPosition(duration.value, target);
    persist(true);

    if (runtime.hasQueue(queue.value)) {
      runtime.seek(target);

      return;
    }

    pendingResumeTime = target;
  }

  function setVolume(value: number): void {
    const level = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : DEFAULT_VOLUME;

    volume.value = level;
    runtime.setVolume(level);
  }

  function setMode(value: MusicMode): void {
    mode.value = value;
  }

  function toggleExpanded(): void {
    expanded.value = !expanded.value;
  }

  async function playFromHistory(entry: MusicHistoryEntry): Promise<void> {
    const track: MusicTrack = {
      id: entry.id,
      name: entry.name,
      path: entry.path,
      url: entry.url,
    };

    queue.value = [track, ...queue.value.filter(item => item.id !== entry.id)];
    currentIndex.value = -1;
    currentTime.value = 0;

    await startAt(0);
  }

  function hydrate(): void {
    const state = readMusicState();

    if (state) {
      queue.value = state.queue;
      currentIndex.value = state.currentIndex;
      mode.value = state.mode;
      volume.value = state.volume;
      currentTime.value = state.currentTime;
      pendingResumeTime = state.currentTime > 0 ? state.currentTime : null;
    }

    historyLog.hydrate();
    isPlaying.value = false;
  }

  watch([queue, currentIndex, mode, volume], () => persist(true));
  setMediaSessionHandlers({
    play: () => {
      if (!isPlaying.value) void toggle();
    },
    pause: () => {
      if (isPlaying.value) void toggle();
    },
    previousTrack: prev,
    nextTrack: next,
    seekTo: seek,
  });

  return {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    mode,
    expanded,
    history: historyLog.entries,
    metadata,
    error,
    playTracks,
    playTrack,
    enqueue,
    enqueueNext,
    removeFromQueue,
    clearQueue,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    setMode,
    toggleExpanded,
    playFromHistory,
    hydrate,
  };
});
