import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FONT_SIZE,
  DEFAULT_SAMPLE_TEXT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_WEIGHTS,
  buildFontFaceCss,
  clampFontSize,
  createFontFamily,
  hashString,
  resolveFontFormat,
  specimenLines,
} from '@/features/preview/renderers/font/fontSpecimen';

describe('clampFontSize', () => {
  it('钳制到 12–96px', () => {
    expect(clampFontSize(4)).toBe(FONT_SIZE_MIN);
    expect(clampFontSize(200)).toBe(FONT_SIZE_MAX);
    expect(clampFontSize(48)).toBe(48);
  });

  it('取整并兜底非法值', () => {
    expect(clampFontSize(37.6)).toBe(38);
    expect(clampFontSize(Number.NaN)).toBe(FONT_SIZE_MIN);
  });

  it('默认字号在范围内', () => {
    expect(clampFontSize(DEFAULT_FONT_SIZE)).toBe(DEFAULT_FONT_SIZE);
  });
});

describe('样张与字重分级', () => {
  it('字重档位覆盖 100–900', () => {
    expect(FONT_WEIGHTS).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('默认样张含大小写字母、数字标点与中文', () => {
    expect(DEFAULT_SAMPLE_TEXT).toMatch(/[A-Z]/);
    expect(DEFAULT_SAMPLE_TEXT).toMatch(/[a-z]/);
    expect(DEFAULT_SAMPLE_TEXT).toMatch(/[0-9]/);
    expect(DEFAULT_SAMPLE_TEXT).toMatch(/[!?@#$%&*]/);
    expect(DEFAULT_SAMPLE_TEXT).toMatch(/[\u4e00-\u9fa5]/);
  });

  it('specimenLines 按行拆分并保留空行', () => {
    expect(specimenLines('甲\n\n乙')).toEqual(['甲', '', '乙']);
    expect(specimenLines(DEFAULT_SAMPLE_TEXT)).toHaveLength(3);
    expect(specimenLines('')).toEqual(['']);
  });
});

describe('字体家族名与 @font-face', () => {
  it('家族名带短哈希且同输入稳定', () => {
    const family = createFontFamily('https://cdn.example.com/a.ttf', 'a.ttf');

    expect(family).toMatch(/^sf-preview-[a-z0-9]{1,8}$/);
    expect(createFontFamily('https://cdn.example.com/a.ttf', 'a.ttf')).toBe(
      family,
    );
    expect(createFontFamily('https://cdn.example.com/b.ttf', 'b.ttf')).not.toBe(
      family,
    );
  });

  it('hashString 对空串也返回可用短串', () => {
    expect(hashString('')).toMatch(/^[a-z0-9]{1,8}$/);
  });

  it('按扩展名映射 format，未知扩展名留空', () => {
    expect(resolveFontFormat('SmileySans-Oblique.ttf')).toBe('truetype');
    expect(resolveFontFormat('x.OTF')).toBe('opentype');
    expect(resolveFontFormat('x.woff')).toBe('woff');
    expect(resolveFontFormat('x.woff2')).toBe('woff2');
    expect(resolveFontFormat('x.bin')).toBe('');
    expect(resolveFontFormat('noext')).toBe('');
  });

  it('生成带引号 url 与 format 的 @font-face', () => {
    const css = buildFontFaceCss(
      'sf-preview-abc',
      'https://cdn.example.com/a b.ttf',
      'truetype',
    );

    expect(css).toContain('font-family:"sf-preview-abc"');
    expect(css).toContain('src:url("https://cdn.example.com/a b.ttf")');
    expect(css).toContain('format("truetype")');
    expect(css).toContain('font-display:swap');
  });

  it('未知格式只保留 url', () => {
    const css = buildFontFaceCss('sf-preview-abc', 'https://x/a.bin', '');

    expect(css).toContain('src:url("https://x/a.bin");');
    expect(css).not.toContain('format(');
  });
});
