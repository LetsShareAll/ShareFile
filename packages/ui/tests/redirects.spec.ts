import { describe, expect, it } from 'vitest';

import {
  getRedirectConfirmMessage,
  shouldConfirmRedirect,
} from '@/domain/redirects';
import type { ShareNode } from '@/domain/share-file';

import { makeNode } from './helpers';

function redirectNode(overrides: Partial<ShareNode>): ShareNode {
  return makeNode('a.txt', 'file', {
    redirect_url: 'https://example.com/target',
    ...overrides,
  });
}

describe('shouldConfirmRedirect', () => {
  it('本地节点的 direct 跳转不需要确认', () => {
    expect(
      shouldConfirmRedirect(redirectNode({ redirect_type: 'direct' })),
    ).toBe(false);
  });

  it('本地节点的 confirm 跳转需要确认', () => {
    expect(
      shouldConfirmRedirect(redirectNode({ redirect_type: 'confirm' })),
    ).toBe(true);
  });

  it('外挂节点的 direct 跳转同样需要确认（第三方可控地址）', () => {
    expect(
      shouldConfirmRedirect(
        redirectNode({ redirect_type: 'direct', source: 'external' }),
      ),
    ).toBe(true);
  });

  it('外挂节点缺省 redirect_type 时仍需要确认', () => {
    expect(shouldConfirmRedirect(redirectNode({ source: 'external' }))).toBe(
      true,
    );
  });
});

describe('getRedirectConfirmMessage', () => {
  it('优先使用节点自带文案', () => {
    expect(
      getRedirectConfirmMessage(
        redirectNode({ redirect_confirm_message: '自定义提示' }),
      ),
    ).toBe('自定义提示');
  });

  it('缺少自带文案时回落到目标地址', () => {
    expect(getRedirectConfirmMessage(redirectNode({}))).toBe(
      '即将离开本站，前往：https://example.com/target',
    );
  });

  it('既无文案也无地址时返回 null', () => {
    expect(
      getRedirectConfirmMessage(
        makeNode('a.txt', 'file', { redirect_url: null, redirect_type: null }),
      ),
    ).toBeNull();
  });
});
