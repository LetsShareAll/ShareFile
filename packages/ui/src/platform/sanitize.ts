type DomPurify = (typeof import('dompurify'))['default'];

const CONFIRM_ALLOWED_TAGS = [
  'a',
  'b',
  'strong',
  'i',
  'em',
  'br',
  'p',
  'span',
  'code',
  'ul',
  'ol',
  'li',
  'small',
];

const CONFIRM_ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

let domPurifyPromise: Promise<DomPurify> | null = null;
let linkHookInstalled = false;

/**
 * 动态加载 DOMPurify：首屏只需要确认弹窗与 Markdown 两条路径，
 * 静态 import 会把 28 kB 的消毒器拉进主包，故统一走这里。
 */
export function loadDomPurify(): Promise<DomPurify> {
  domPurifyPromise ??= import('dompurify').then(module => module.default);

  return domPurifyPromise;
}

function installLinkHook(DOMPurify: DomPurify): void {
  if (linkHookInstalled) return;

  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (
      node instanceof Element &&
      node.tagName === 'A' &&
      node.getAttribute('target') === '_blank'
    ) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  linkHookInstalled = true;
}

/**
 * 确认弹窗文案的严格白名单消毒。
 */
export async function sanitizeConfirmHtml(html: string): Promise<string> {
  const DOMPurify = await loadDomPurify();

  installLinkHook(DOMPurify);

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: CONFIRM_ALLOWED_TAGS,
    ALLOWED_ATTR: CONFIRM_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
