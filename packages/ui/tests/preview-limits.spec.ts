import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_MAX_BYTES,
  PREVIEW_MAX_LINES,
  capText,
  exceedsPreviewLimit,
  readLimitedText,
} from '@/features/preview/largeFile';

const encoder = new TextEncoder();

function makeLines(count: number): string {
  return Array.from({ length: count }, (_, index) => `第 ${index} 行内容`).join(
    '\n',
  );
}

function byteLength(text: string): number {
  return encoder.encode(text).byteLength;
}

function stubFetch(body: BodyInit): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('大文件护栏判定', () => {
  it('节点元数据超过 1 MB 时判定截断', () => {
    expect(exceedsPreviewLimit(PREVIEW_MAX_BYTES + 1)).toBe(true);
    expect(exceedsPreviewLimit(PREVIEW_MAX_BYTES)).toBe(false);
    expect(exceedsPreviewLimit(1024)).toBe(false);
  });

  it('元数据缺失时不做提前判定（交给流式读取）', () => {
    expect(exceedsPreviewLimit(undefined)).toBe(false);
  });

  it('未超限：原样保留并统计行数 / 字节数', () => {
    const text = makeLines(3);
    const result = capText(text, byteLength(text));

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.lines).toBe(3);
    expect(result.bytes).toBe(byteLength(text));
    expect(result.totalBytes).toBe(byteLength(text));
  });

  it('行数超限：只保留前 2000 行', () => {
    const result = capText(makeLines(PREVIEW_MAX_LINES + 500));

    expect(result.truncated).toBe(true);
    expect(result.lines).toBe(PREVIEW_MAX_LINES);
    expect(result.text.split('\n')).toHaveLength(PREVIEW_MAX_LINES);
  });

  it('字节超限：单行超长也按 1 MB 截断', () => {
    const result = capText('x'.repeat(PREVIEW_MAX_BYTES + 1024));

    expect(result.truncated).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(PREVIEW_MAX_BYTES);
  });
});

describe('流式读取', () => {
  it('size 缺失时走流式：达到上限立刻 cancel，不读完', async () => {
    let cancelled = false;
    const chunks = [
      encoder.encode(makeLines(PREVIEW_MAX_LINES + 100)),
      encoder.encode('这一段不该被读到'),
    ];
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();

          return;
        }

        controller.enqueue(chunks[index]);
        index += 1;
      },
      cancel() {
        cancelled = true;
      },
    });

    stubFetch(stream);

    const result = await readLimitedText('/big.txt');

    expect(result.truncated).toBe(true);
    expect(result.lines).toBe(PREVIEW_MAX_LINES);
    expect(result.totalBytes).toBeUndefined();
    expect(cancelled).toBe(true);
  });

  it('元数据已超限：无需读完就给出截断结果与总体积', async () => {
    stubFetch(makeLines(5));

    const result = await readLimitedText('/big.txt', PREVIEW_MAX_BYTES * 2);

    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(PREVIEW_MAX_BYTES * 2);
    expect(result.lines).toBe(5);
  });

  it('未超限：完整读出并保留内容', async () => {
    const text = makeLines(10);

    stubFetch(text);

    const result = await readLimitedText('/small.txt');

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.lines).toBe(10);
  });

  it('响应非 2xx 时抛错（渲染器显示错误态）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );

    await expect(readLimitedText('/missing.txt')).rejects.toThrow('404');
  });
});
