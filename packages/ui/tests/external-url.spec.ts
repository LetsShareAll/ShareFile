import { describe, expect, it } from 'vitest';

import {
  GITHUB_RAW_BASE_URL,
  buildExternalFileUrl,
  buildExternalIndexUrl,
  getExpectedFileUrlPrefix,
  hasRequiredCdnFileUrls,
  isUsableExternalFileUrl,
  joinUrl,
  trimUrlSegment,
} from '@/domain/external';

import { githubSource, makeNode, makeShareFile } from './helpers';

describe('buildExternalIndexUrl', () => {
  it('默认使用 jsDelivr 索引', () => {
    expect(buildExternalIndexUrl(githubSource(), false)).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/share-file.json',
    );
  });

  it('显式 jsdelivr 与默认一致', () => {
    expect(
      buildExternalIndexUrl(githubSource({ access_cdn: 'jsdelivr' }), false),
    ).toBe('https://cdn.jsdelivr.net/gh/owner/repo@main/share-file.json');
  });

  it('useCdnIndex 切换索引文件名', () => {
    expect(buildExternalIndexUrl(githubSource(), true)).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/share-file.cdn.json',
    );
  });

  it('分支名进入地址', () => {
    expect(buildExternalIndexUrl(githubSource({ branch: 'dev' }), false)).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@dev/share-file.json',
    );
  });

  it('raw 模式走 raw.githubusercontent.com', () => {
    expect(
      buildExternalIndexUrl(githubSource({ access_cdn: 'raw' }), false),
    ).toBe('https://raw.githubusercontent.com/owner/repo/main/share-file.json');
  });

  it('自定义 CDN 拼接 raw 主机与仓库路径', () => {
    expect(
      buildExternalIndexUrl(
        githubSource({ access_cdn: 'https://cdn.example.com/' }),
        false,
      ),
    ).toBe(
      'https://cdn.example.com/raw.githubusercontent.com/owner/repo/main/share-file.json',
    );
  });
});

describe('buildExternalFileUrl', () => {
  it('默认 jsDelivr 直链并去掉 nodeId 前导斜杠', () => {
    expect(buildExternalFileUrl(githubSource(), '/docs/a.txt')).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt',
    );
    expect(buildExternalFileUrl(githubSource(), 'docs/a.txt')).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt',
    );
  });

  it('raw 模式拼接 raw 主机', () => {
    expect(
      buildExternalFileUrl(githubSource({ access_cdn: 'raw' }), 'docs/a.txt'),
    ).toBe('https://raw.githubusercontent.com/owner/repo/main/docs/a.txt');
  });

  it('自定义 CDN 拼接 raw 主机', () => {
    expect(
      buildExternalFileUrl(
        githubSource({ access_cdn: 'https://cdn.example.com' }),
        'docs/a.txt',
      ),
    ).toBe(
      'https://cdn.example.com/raw.githubusercontent.com/owner/repo/main/docs/a.txt',
    );
  });
});

describe('getExpectedFileUrlPrefix', () => {
  it('jsDelivr 前缀', () => {
    expect(getExpectedFileUrlPrefix(githubSource())).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/',
    );
  });

  it('raw 前缀', () => {
    expect(getExpectedFileUrlPrefix(githubSource({ access_cdn: 'raw' }))).toBe(
      'https://raw.githubusercontent.com/owner/repo/main/',
    );
  });

  it('自定义 CDN 前缀', () => {
    expect(
      getExpectedFileUrlPrefix(
        githubSource({ access_cdn: 'https://cdn.example.com' }),
      ),
    ).toBe(
      'https://cdn.example.com/raw.githubusercontent.com/owner/repo/main/',
    );
  });

  it('分支变化影响前缀', () => {
    expect(getExpectedFileUrlPrefix(githubSource({ branch: 'dev' }))).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@dev/',
    );
  });
});

describe('isUsableExternalFileUrl', () => {
  const source = githubSource();

  it('接受命中前缀的绝对地址（忽略首尾空白）', () => {
    expect(
      isUsableExternalFileUrl(
        'https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt',
        source,
      ),
    ).toBe(true);
    expect(
      isUsableExternalFileUrl(
        '  https://cdn.jsdelivr.net/gh/owner/repo@main/docs/a.txt  ',
        source,
      ),
    ).toBe(true);
  });

  it('拒绝空值、null/undefined 与字符串 null/undefined', () => {
    expect(isUsableExternalFileUrl(undefined, source)).toBe(false);
    expect(isUsableExternalFileUrl(null, source)).toBe(false);
    expect(isUsableExternalFileUrl('', source)).toBe(false);
    expect(isUsableExternalFileUrl('   ', source)).toBe(false);
    expect(isUsableExternalFileUrl('null', source)).toBe(false);
    expect(isUsableExternalFileUrl('undefined', source)).toBe(false);
  });

  it('拒绝非字符串值', () => {
    expect(isUsableExternalFileUrl(42, source)).toBe(false);
    expect(isUsableExternalFileUrl({ url: 'x' }, source)).toBe(false);
  });

  it('拒绝相对地址', () => {
    expect(isUsableExternalFileUrl('docs/a.txt', source)).toBe(false);
    expect(isUsableExternalFileUrl('/docs/a.txt', source)).toBe(false);
  });

  it('拒绝前缀不符的绝对地址', () => {
    expect(
      isUsableExternalFileUrl(
        'https://evil.example.com/gh/owner/repo@main/a.txt',
        source,
      ),
    ).toBe(false);
    expect(
      isUsableExternalFileUrl(
        'https://cdn.jsdelivr.net/gh/other/repo@main/a.txt',
        source,
      ),
    ).toBe(false);
    expect(
      isUsableExternalFileUrl(
        'https://cdn.jsdelivr.net/gh/owner/repo@dev/a.txt',
        source,
      ),
    ).toBe(false);
  });
});

describe('hasRequiredCdnFileUrls', () => {
  const source = githubSource();

  it('文件夹与带直链的文件节点通过', () => {
    const data = makeShareFile([
      makeNode('root', 'folder'),
      makeNode('a.txt', 'file', {
        url: 'https://cdn.jsdelivr.net/gh/owner/repo@main/a.txt',
      }),
      makeNode('empty-folder', 'folder'),
    ]);

    expect(hasRequiredCdnFileUrls(data, source)).toBe(true);
  });

  it('文件节点缺少直链或前缀不符时失败', () => {
    const missingUrl = makeShareFile([makeNode('a.txt', 'file')]);
    const wrongPrefix = makeShareFile([
      makeNode('a.txt', 'file', { url: 'https://evil.example.com/a.txt' }),
    ]);

    expect(hasRequiredCdnFileUrls(missingUrl, source)).toBe(false);
    expect(hasRequiredCdnFileUrls(wrongPrefix, source)).toBe(false);
  });

  it('带 redirect_url 的虚拟节点豁免直链校验', () => {
    const data = makeShareFile([
      makeNode('virtual.txt', 'file', {
        redirect_url: 'https://example.com/virtual',
      }),
    ]);

    expect(data.nodes['virtual.txt'].url).toBeUndefined();
    expect(hasRequiredCdnFileUrls(data, source)).toBe(true);
  });

  it('空索引通过', () => {
    expect(hasRequiredCdnFileUrls(makeShareFile([]), source)).toBe(true);
  });
});

describe('不支持的 provider', () => {
  // provider 在类型层被收窄为字面量 'github'，这里用 Object.assign 构造运行时不支持的取值。
  const unsupportedSource = Object.assign(githubSource(), {
    provider: 'gitlab',
  });

  it('索引地址与文件地址都抛出明确错误', () => {
    expect(() => buildExternalIndexUrl(unsupportedSource, false)).toThrow(
      '不支持的存储提供商: gitlab',
    );
    expect(() => buildExternalFileUrl(unsupportedSource, 'a.txt')).toThrow(
      '不支持的存储提供商: gitlab',
    );
  });

  it('getExpectedFileUrlPrefix 不校验 provider', () => {
    expect(getExpectedFileUrlPrefix(unsupportedSource)).toBe(
      'https://cdn.jsdelivr.net/gh/owner/repo@main/',
    );
  });
});

describe('url 拼装辅助', () => {
  it('trimUrlSegment 去掉两侧斜杠', () => {
    expect(trimUrlSegment('/a/b/')).toBe('a/b');
    expect(trimUrlSegment('a')).toBe('a');
  });

  it('joinUrl 归一化斜杠并丢弃空段', () => {
    expect(joinUrl('https://x.com/', '/a/', '', 'b')).toBe('https://x.com/a/b');
  });

  it('raw 主机常量与拼接结果一致', () => {
    expect(GITHUB_RAW_BASE_URL).toBe('https://raw.githubusercontent.com');
  });
});
