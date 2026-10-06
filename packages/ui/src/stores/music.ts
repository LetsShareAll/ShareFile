import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  createBroadcastTransport,
  type MusicSnapshot,
} from '../features/music/broadcast';
import { createMusicSync } from '../features/music/sync';
import {
  setMediaSessionHandlers,
  setMediaSessionPosition,
  syncMediaSessionTrack,
} from '../features/music/mediaSession';
import {
  createMusicHistoryLog,
  createMusicPersister,
  readMusicState,
  toMusicTrack,
} from '../features/music/persistence';
import {
  createPlayerRuntime,
  type MusicMetadataState,
} from '../features/music/playerRuntime';
import {
  insertQueueItem,
  moveQueueItem,
  removeQueueItem,
} from '../features/music/queueOrder';
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

  function silence(): void {
    runtime.pause();
    isPlaying.value = false;
  }

  // 远端快照落地后的善后：引擎音量与续播位置都跟着镜像走。
  function afterApply(snapshot: MusicSnapshot): void {
    runtime.setVolume(snapshot.volume);
    pendingResumeTime = snapshot.currentTime > 0 ? snapshot.currentTime : null;
    // 引擎已持有同一队列时顺势对齐进度，之后本页手动起播才接得上。
    if (runtime.hasQueue(queue.value)) runtime.seek(snapshot.currentTime);
  }

  // 不变量：别的标签页在驱动播放时本页引擎必须停；UI 继续跟着镜像。
  const sync = createMusicSync(
    { queue, currentIndex, mode, volume, currentTime, duration, isPlaying },
    { silence, afterApply, transport: createBroadcastTransport() },
  );

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
    sync.announce('select', queue.value[index]?.id);

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
    queue.value = insertQueueItem(queue.value, currentIndex.value + 1, track);
  }

  function removeFromQueue(id: string): void {
    const removal = removeQueueItem(queue.value, id, currentIndex.value);

    if (!removal) return;

    if (removal.queue.length === 0) {
      clearQueue();

      return;
    }

    if (removal.wasCurrent) {
      stopPlayback();
      currentTime.value = 0;
    }

    queue.value = removal.queue;
    currentIndex.value = removal.currentIndex;
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
    sync.announce('clear');
  }

  async function toggle(): Promise<void> {
    if (queue.value.length === 0) return;

    sync.announce('toggle');

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
    sync.announce('next');
    playAtIndex(
      getNextIndex(queue.value.length, currentIndex.value, mode.value),
    );
  }

  function prev(): void {
    sync.announce('prev');
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
    sync.announce('seek', target);

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
    sync.announce('volume', level);
  }

  function setMode(value: MusicMode): void {
    mode.value = value;
    sync.announce('mode', value);
  }

  function moveInQueue(from: number, to: number): void {
    const order = moveQueueItem(queue.value, from, to, currentIndex.value);

    if (order.queue === queue.value) return;

    queue.value = order.queue;
    currentIndex.value = order.currentIndex;
  }

  function toggleExpanded(): void {
    expanded.value = !expanded.value;
  }

  async function playFromHistory(entry: MusicHistoryEntry): Promise<void> {
    const track = toMusicTrack(entry);

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
    // 问其它标签页要当前状态：后开的页面显示同一首、同一进度，但保持暂停。
    sync.hello();
  }

  watch(
    [queue, currentIndex, mode, volume, isPlaying],
    () => {
      sync.announceState();
      persist(true);
    },
    // 同步 flush：应用远端快照时的写入必须落在协调器的 applying 窗口内，否则会回播成回声。
    { flush: 'sync' },
  );
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
    moveInQueue,
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
