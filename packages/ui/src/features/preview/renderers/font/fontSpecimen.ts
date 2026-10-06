/**
 * 字体标本预览的常量与纯函数：样张分级、字号钳制、家族名与 @font-face 构造。
 */

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 96;
export const DEFAULT_FONT_SIZE = 32;
export const DEFAULT_FONT_WEIGHT = 400;

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const FONT_WEIGHT_NOTE =
  '单字重字体通常只有 400 / 700 生效，其余字重由浏览器合成';

/** 默认样张：大小写字母、数字标点、一行中文。 */
export const DEFAULT_SAMPLE_TEXT = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz',
  '0123456789 !?@#$%&*()[]{}<>,.;:\'"+-=/_~^|',
  '汉字字体标本：春眠不觉晓，处处闻啼鸟。',
].join('\n');

/** 字体加载超时（毫秒）。 */
export const LOAD_TIMEOUT_MS = 20_000;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return FONT_SIZE_MIN;

  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)));
}

/** 样张按行拆分，空行保留（用户可能刻意用空行分隔）。 */
export function specimenLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function hashString(input: string): string {
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }

  return (hash >>> 0).toString(36).slice(0, 8);
}

/** 每个文件用独立家族名，避免与外站字体或上一次预览互相污染。 */
export function createFontFamily(fileUrl: string, name: string): string {
  return `sf-preview-${hashString(`${fileUrl}|${name}`)}`;
}

const FORMAT_BY_EXTENSION: Record<string, string> = {
  ttf: 'truetype',
  otf: 'opentype',
  ttc: 'truetype',
  woff: 'woff',
  woff2: 'woff2',
};

export function resolveFontFormat(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';

  return FORMAT_BY_EXTENSION[extension] ?? '';
}

export function buildFontFaceCss(
  family: string,
  fileUrl: string,
  format: string,
): string {
  const source = `url(${JSON.stringify(fileUrl)})`;

  return [
    '@font-face{',
    `font-family:"${family}";`,
    `src:${source}${format ? ` format("${format}")` : ''};`,
    'font-display:swap;',
    '}',
  ].join('');
}
