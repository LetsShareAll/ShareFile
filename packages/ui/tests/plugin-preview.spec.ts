import { describe, expect, it } from 'vitest';

import { builtinNodePlugins } from '@/plugins';

/** 与旧实现一致的 14 个内置插件。 */
const EXPECTED_IDS = [
  'archive',
  'audio',
  'code',
  'disk-image',
  'document',
  'executable',
  'folder',
  'font',
  'image',
  'markdown',
  'pdf',
  'text',
  'unknown',
  'video',
];

/** 带预览的 8 个插件，其余走 window.open 兜底。 */
const PREVIEW_IDS = [
  'markdown',
  'code',
  'image',
  'pdf',
  'text',
  'video',
  'audio',
  'font',
];

const SAMPLE_NAMES: Record<string, string> = {
  markdown: 'doc.md',
  code: 'main.ts',
  image: 'photo.png',
  pdf: 'book.pdf',
  text: 'notes.txt',
  video: 'clip.mp4',
  audio: 'song.mp3',
  font: 'SmileySans-Oblique.ttf',
};

describe('内置插件清单', () => {
  it('14 个插件全部登记且 id 与旧实现一致', () => {
    expect(builtinNodePlugins.map(plugin => plugin.id).sort()).toEqual(
      [...EXPECTED_IDS].sort(),
    );
  });

  it('folder / unknown 作为兜底插件存在且优先级最低', () => {
    const priorities = Object.fromEntries(
      builtinNodePlugins.map(plugin => [plugin.id, plugin.priority ?? 0]),
    );

    expect(priorities.folder).toBe(-900);
    expect(priorities.unknown).toBe(-1000);
  });
});

describe('预览契约', () => {
  it.each(PREVIEW_IDS)('%s 插件提供异步 preview 加载器', id => {
    const plugin = builtinNodePlugins.find(candidate => candidate.id === id);

    expect(plugin).toBeTruthy();
    expect(typeof plugin?.preview).toBe('function');

    const name = SAMPLE_NAMES[id];
    const input = { name, nodeType: 'file' as const };
    const result = plugin?.preview?.({
      ...input,
      fileUrl: 'https://example.com/' + name,
      nodeTypeInfo: plugin.getInfo(input),
    });

    expect(result).toBeInstanceOf(Promise);
    // 重库（video.js / amplitudejs / music-metadata）在 happy-dom 下不保证可加载，
    // 这里只验证契约形态；真实渲染由 Playwright 冒烟覆盖。
    void result?.catch(() => undefined);
  });

  it.each(EXPECTED_IDS.filter(id => !PREVIEW_IDS.includes(id)))(
    '%s 插件不提供预览（交给 window.open 兜底）',
    id => {
      const plugin = builtinNodePlugins.find(candidate => candidate.id === id);

      expect(plugin?.preview).toBeUndefined();
    },
  );

  it('每个插件都能描述自己声明的扩展名', () => {
    const samples: [string, string][] = [
      ['archive', 'pkg.7z'],
      ['disk-image', 'image.iso'],
      ['document', 'report.docx'],
      ['executable', 'setup.exe'],
      ['font', 'font.ttf'],
      ['image', 'photo.png'],
      ['code', 'main.js'],
    ];

    for (const [id, name] of samples) {
      const plugin = builtinNodePlugins.find(candidate => candidate.id === id);
      const info = plugin?.getInfo({ name, nodeType: 'file' });

      expect(info?.iconClass, `${id} 缺少 iconClass`).toBeTruthy();
      expect(info?.className, `${id} 缺少 className`).toBeTruthy();
    }
  });
});
