/** 大文件护栏：超过 1 MB 或 2000 行（先到为准）就不再往下读，只保留前一段。 */
export const PREVIEW_MAX_BYTES = 1024 * 1024;
export const PREVIEW_MAX_LINES = 2000;

const LINE_BREAK_PATTERN = /\r\n|\r|\n/g;

export interface TextPreviewLimits {
  maxBytes: number;
  maxLines: number;
}

export const DEFAULT_PREVIEW_LIMITS: TextPreviewLimits = {
  maxBytes: PREVIEW_MAX_BYTES,
  maxLines: PREVIEW_MAX_LINES,
};

export interface LimitedText {
  /** 已保留的内容（截断时为前 N 行 / 前 1 MB）。 */
  text: string;
  truncated: boolean;
  /** 已保留的行数。 */
  lines: number;
  /** 已保留内容的字节数。 */
  bytes: number;
  /** 索引元数据或响应头给出的总体积，未知为 undefined。 */
  totalBytes?: number;
}

/** 节点元数据判定：索引里写了体积且超过上限时无需读完就能确定会截断。 */
export function exceedsPreviewLimit(
  size: number | undefined,
  limits: TextPreviewLimits = DEFAULT_PREVIEW_LIMITS,
): boolean {
  return typeof size === 'number' && size > limits.maxBytes;
}

function countLines(text: string): number {
  return (text.match(LINE_BREAK_PATTERN)?.length ?? 0) + 1;
}

function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * 按字节上限切一刀，再按行数上限切一刀；两个上限先到为准。
 */
export function capText(
  text: string,
  totalBytes?: number,
  limits: TextPreviewLimits = DEFAULT_PREVIEW_LIMITS,
): LimitedText {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  let truncated = encoded.byteLength > limits.maxBytes;
  let limited = truncated
    ? decodeBytes(encoded.subarray(0, limits.maxBytes))
    : text;
  const parts = limited.split(/\r\n|\r|\n/);

  if (parts.length > limits.maxLines) {
    truncated = true;
    limited = parts.slice(0, limits.maxLines).join('\n');
  }

  return {
    text: limited,
    truncated,
    lines: countLines(limited),
    bytes: encoder.encode(limited).byteLength,
    totalBytes,
  };
}

function readContentLength(value: string | null): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * 流式读取文本：边读边累计字节与行数，达到上限立刻 `cancel()`，绝不把整文件读完。
 * `size`（节点元数据）与 `Content-Length` 用于提前判定与展示总体积；两者不一致时取较大值
 * （索引过期 / 响应头缺失都不会让提示与实际内容对不上）。
 */
export async function readLimitedText(
  url: string,
  size?: number,
  limits: TextPreviewLimits = DEFAULT_PREVIEW_LIMITS,
): Promise<LimitedText> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`预览请求失败：${response.status}`);
  }

  const contentLength = readContentLength(
    response.headers.get('content-length'),
  );
  const totalBytes =
    size !== undefined && contentLength !== undefined
      ? Math.max(size, contentLength)
      : (size ?? contentLength);
  const sizeTruncated = exceedsPreviewLimit(totalBytes, limits);
  const reader = response.body?.getReader();

  // happy-dom / 无流式 body 的运行时退回整段读取，仍按同一套上限裁剪。
  if (!reader) {
    const capped = capText(await response.text(), totalBytes, limits);

    return { ...capped, truncated: capped.truncated || sizeTruncated };
  }

  const decoder = new TextDecoder();
  let buffered = '';
  let bytes = 0;
  let lines = 1;
  let stopped = false;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    bytes += value.byteLength;
    buffered += chunk;
    lines += countLines(chunk) - 1;

    if (bytes >= limits.maxBytes || lines >= limits.maxLines) {
      stopped = true;
      await reader.cancel();

      break;
    }
  }

  buffered += decoder.decode();

  const capped = capText(buffered, totalBytes, limits);

  return { ...capped, truncated: sizeTruncated || stopped || capped.truncated };
}
