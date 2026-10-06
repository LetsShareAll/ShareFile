import { describe, expect, it } from 'vitest';

import { buildPreviewHref, readPreviewPath } from '@/features/preview/url';

describe('?preview= 解析', () => {
  it('解码路径参数', () => {
    expect(readPreviewPath('?preview=%2Fdocuments%2Fadr%2F0001.md')).toBe(
      '/documents/adr/0001.md',
    );
    expect(readPreviewPath('?preview=/documents/adr/0001.md')).toBe(
      '/documents/adr/0001.md',
    );
  });

  it('没有该参数或参数为空时返回 null', () => {
    expect(readPreviewPath('')).toBeNull();
    expect(readPreviewPath('?path=/documents')).toBeNull();
    expect(readPreviewPath('?preview=')).toBeNull();
    expect(readPreviewPath('?preview=%20%20')).toBeNull();
  });

  it('非法路径被白名单收敛为 null（不打开任何预览）', () => {
    expect(readPreviewPath('?preview=//evil.example/x')).toBeNull();
    expect(readPreviewPath('?preview=https://evil.example/x')).toBeNull();
    expect(readPreviewPath('?preview=/../../etc/passwd')).toBeNull();
  });
});

describe('?preview= 写入与清理', () => {
  it('写入时保留当前目录路径、其它参数与 hash', () => {
    expect(
      buildPreviewHref(
        'http://127.0.0.1:4173/documents/adr?a=1#top',
        '/documents/adr/0001.md',
      ),
    ).toBe('/documents/adr?a=1&preview=%2Fdocuments%2Fadr%2F0001.md#top');
  });

  it('清理时只删掉 preview 参数（关闭预览走 replaceState）', () => {
    expect(
      buildPreviewHref(
        'http://127.0.0.1:4173/documents/adr?preview=%2Fdocuments%2Fadr%2F0001.md#top',
        null,
      ),
    ).toBe('/documents/adr#top');
  });

  it('清理最后一个参数时不留空问号', () => {
    expect(
      buildPreviewHref(
        'http://127.0.0.1:4173/?preview=%2Fdocuments%2Fa.md',
        null,
      ),
    ).toBe('/');
  });
});
