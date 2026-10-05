import { describe, expect, it } from 'vitest';

import {
  formatFileSizeUnit,
  formatSize,
  getErrorMessage,
  getRelativeTime,
} from '@/domain/format';

describe('formatSize', () => {
  it('undefined/null 视为未知大小', () => {
    expect(formatSize()).toBe('未知大小');
    expect(formatSize(undefined)).toBe('未知大小');
    expect(formatSize(null)).toBe('未知大小');
  });

  it('0 与不足 1KB 的字节数按 B 输出', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('KB 边界与两位小数', () => {
    expect(formatSize(1024)).toBe('1.00 KB');
    expect(formatSize(1536)).toBe('1.50 KB');
    expect(formatSize(1024 * 1024 - 1)).toBe('1024.00 KB');
  });

  it('MB / GB / TB 边界', () => {
    expect(formatSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatSize(1024 ** 3)).toBe('1.00 GB');
    expect(formatSize(1024 ** 4)).toBe('1.00 TB');
    expect(formatSize(5.5 * 1024 ** 4)).toBe('5.50 TB');
  });
});

describe('formatFileSizeUnit', () => {
  it('各档位边界', () => {
    expect(formatFileSizeUnit(0)).toBe('B');
    expect(formatFileSizeUnit(1023)).toBe('B');
    expect(formatFileSizeUnit(1024)).toBe('KB');
    expect(formatFileSizeUnit(1024 * 1024 - 1)).toBe('KB');
    expect(formatFileSizeUnit(1024 * 1024)).toBe('MB');
    expect(formatFileSizeUnit(1024 ** 3 - 1)).toBe('MB');
    expect(formatFileSizeUnit(1024 ** 3)).toBe('GB');
    expect(formatFileSizeUnit(1024 ** 4 - 1)).toBe('GB');
    expect(formatFileSizeUnit(1024 ** 4)).toBe('TB');
    expect(formatFileSizeUnit(Number.MAX_SAFE_INTEGER)).toBe('TB');
  });
});

describe('getRelativeTime', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  function ago(ms: number): string {
    return new Date(now.getTime() - ms).toISOString();
  }

  it('空字符串与 undefined 返回空串', () => {
    expect(getRelativeTime('', now)).toBe('');
    expect(getRelativeTime(undefined, now)).toBe('');
  });

  it('一分钟内显示刚刚', () => {
    expect(getRelativeTime(now.toISOString(), now)).toBe('刚刚');
    expect(getRelativeTime(ago(59_000), now)).toBe('刚刚');
  });

  it('一小时内按分钟显示', () => {
    expect(getRelativeTime(ago(60_000), now)).toBe('1分钟前');
    expect(getRelativeTime(ago(59 * 60_000), now)).toBe('59分钟前');
  });

  it('一天内按小时显示', () => {
    expect(getRelativeTime(ago(60 * 60_000), now)).toBe('1小时前');
    expect(getRelativeTime(ago(23 * 60 * 60_000), now)).toBe('23小时前');
  });

  it('超过一天使用 zh-CN 日期', () => {
    const earlier = new Date(now.getTime() - 24 * 60 * 60_000);
    const result = getRelativeTime(earlier.toISOString(), now);

    expect(result).toBe(
      earlier.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    expect(result).not.toContain('前');
  });
});

describe('getErrorMessage', () => {
  it('Error 返回 message', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('非 Error 转为字符串', () => {
    expect(getErrorMessage('boom')).toBe('boom');
    expect(getErrorMessage(42)).toBe('42');
  });
});
