import { beforeEach, describe, expect, it } from 'vitest';

import {
  getFocusableElements,
  isPlayerContext,
  trapFocus,
} from '@/features/preview/modalKeyboard';

function tab(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    cancelable: true,
  });
}

describe('弹窗焦点陷阱', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.innerHTML =
      '<button id="a">a</button><button id="b">b</button><button id="c">c</button>';
    document.body.appendChild(container);
  });

  it('只收集可聚焦元素', () => {
    expect(getFocusableElements(container).map(el => el.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('焦点不在弹窗内时 Tab 送进第一个元素', () => {
    document.body.focus();
    trapFocus(container, tab());

    expect(document.activeElement?.id).toBe('a');
  });

  it('末尾 Tab / 首位 Shift+Tab 在弹窗内循环', () => {
    (document.getElementById('c') as HTMLButtonElement).focus();
    trapFocus(container, tab());
    expect(document.activeElement?.id).toBe('a');

    trapFocus(container, tab(true));
    expect(document.activeElement?.id).toBe('c');
  });
});

describe('播放器优先处理 ←/→', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('事件源在视频 / 音频播放器容器内时交给播放器', () => {
    const video = document.createElement('div');

    video.className = 'videojs-preview';
    video.innerHTML = '<button id="v">play</button>';
    document.body.appendChild(video);

    const audio = document.createElement('div');

    audio.className = 'amplitude-preview';
    document.body.appendChild(audio);

    expect(isPlayerContext(document.getElementById('v'))).toBe(true);
    expect(isPlayerContext(audio)).toBe(true);
    expect(isPlayerContext(document.body)).toBe(false);
    expect(isPlayerContext(null)).toBe(false);
  });
});
