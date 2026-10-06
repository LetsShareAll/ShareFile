import { describe, expect, it } from 'vitest';

import { buildDirectoryShare, quoteShellArg } from '@/features/browse/share';

const ORIGIN = 'https://files.example.com';

describe('quoteShellArg', () => {
  it('用单引号包裹并在内部单引号处断开', () => {
    expect(quoteShellArg('/plain/path')).toBe("'/plain/path'");
    expect(quoteShellArg("/it's here")).toBe("'/it'\\''s here'");
  });

  it('中文与空格原样保留在引号内', () => {
    expect(quoteShellArg('/softwares/中文 目录')).toBe(
      "'/softwares/中文 目录'",
    );
  });
});

describe('buildDirectoryShare.pageUrl', () => {
  it('根目录就是站点根', () => {
    const share = buildDirectoryShare('/', ORIGIN);

    expect(share.path).toBe('/');
    expect(share.pageUrl).toBe(`${ORIGIN}/`);
  });

  it('多级目录拼成绝对 clean URL', () => {
    const share = buildDirectoryShare('/softwares/applications/tools', ORIGIN);

    expect(share.pageUrl).toBe(`${ORIGIN}/softwares/applications/tools`);
  });

  it('中文与空格做百分号编码', () => {
    const share = buildDirectoryShare('/softwares/中文 目录', ORIGIN);

    expect(share.pageUrl).toBe(
      `${ORIGIN}/softwares/%E4%B8%AD%E6%96%87%20%E7%9B%AE%E5%BD%95`,
    );
  });

  it('尾部斜杠归一化掉', () => {
    expect(buildDirectoryShare('/softwares/', ORIGIN).pageUrl).toBe(
      `${ORIGIN}/softwares`,
    );
  });

  it('origin 带尾斜杠时不产生双斜杠', () => {
    expect(buildDirectoryShare('/softwares', `${ORIGIN}/`).pageUrl).toBe(
      `${ORIGIN}/softwares`,
    );
  });

  it('origin 缺失时退回站内路径', () => {
    expect(buildDirectoryShare('/softwares', '').pageUrl).toBe('/softwares');
  });
});

describe('buildDirectoryShare.manifestCommand', () => {
  it('根目录用 grep 全量前缀', () => {
    expect(buildDirectoryShare('/', ORIGIN).manifestCommand).toBe(
      `curl -sS ${ORIGIN}/assets/data/files.jsonl | grep '"path":"/'`,
    );
  });

  it('多级目录用带尾斜杠的 grep 前缀，避免命中同级兄弟目录', () => {
    const share = buildDirectoryShare('/softwares/applications/tools', ORIGIN);

    expect(share.manifestCommand).toBe(
      `curl -sS ${ORIGIN}/assets/data/files.jsonl | grep '"path":"/softwares/applications/tools/'`,
    );
    expect(share.manifestCommand).not.toContain(
      `grep '"path":"/softwares/applications/'`,
    );
  });

  it('目录名里的中文与空格保持在单引号内', () => {
    expect(
      buildDirectoryShare('/softwares/中文 目录', ORIGIN).manifestCommand,
    ).toBe(
      `curl -sS ${ORIGIN}/assets/data/files.jsonl | grep '"path":"/softwares/中文 目录/'`,
    );
  });

  it('目录名里的单引号被转义为 EOF 安全的写法', () => {
    const share = buildDirectoryShare("/it's here", ORIGIN);

    expect(share.manifestCommand).toBe(
      `curl -sS ${ORIGIN}/assets/data/files.jsonl | grep '"path":"/it'\\''s here/'`,
    );
  });
});

describe('buildDirectoryShare.downloadCommand', () => {
  it('目录没有字节，不提供下载示例', () => {
    expect(buildDirectoryShare('/dir', ORIGIN).downloadCommand).toBeNull();
    expect(buildDirectoryShare('/', ORIGIN).downloadCommand).toBeNull();
  });

  it('文件深链给出该文件的 curl 下载示例', () => {
    const share = buildDirectoryShare(
      '/dir/file.tar.gz',
      ORIGIN,
      '/dir/file.tar.gz',
    );

    expect(share.downloadCommand).toBe(
      `curl -L -O '${ORIGIN}/dir/file.tar.gz'`,
    );
  });

  it('下载示例里的中文与空格同样编码', () => {
    const share = buildDirectoryShare('/dir', ORIGIN, '/dir/我的 文件.txt');

    expect(share.downloadCommand).toBe(
      `curl -L -O '${ORIGIN}/dir/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6.txt'`,
    );
  });

  it('文件路径非法时退回不提供下载示例', () => {
    expect(
      buildDirectoryShare('/dir', ORIGIN, '//evil.example.com/x')
        .downloadCommand,
    ).toBeNull();
  });
});

describe('buildDirectoryShare 回落', () => {
  it('空路径回落为根目录', () => {
    const share = buildDirectoryShare('', ORIGIN);

    expect(share.path).toBe('/');
    expect(share.pageUrl).toBe(`${ORIGIN}/`);
    expect(share.manifestCommand).toBe(
      `curl -sS ${ORIGIN}/assets/data/files.jsonl | grep '"path":"/'`,
    );
  });

  it('协议相对与带协议段等非法路径回落为根目录', () => {
    for (const illegal of [
      '//evil.example.com/x',
      '../etc',
      '.',
      'javascript:alert(1)',
      'https://evil.example.com/x',
    ]) {
      expect(buildDirectoryShare(illegal, ORIGIN).path).toBe('/');
      expect(buildDirectoryShare(illegal, ORIGIN).pageUrl).toBe(`${ORIGIN}/`);
    }
  });
});
