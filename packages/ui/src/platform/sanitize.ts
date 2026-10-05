import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
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

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

let hookInstalled = false;

/**
 * 统一消毒入口：确认弹窗、Markdown、外部源 HTML 都走这里。
 */
export function sanitizeHtml(html: string): string {
  if (!hookInstalled) {
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (
        node instanceof Element &&
        node.tagName === 'A' &&
        node.getAttribute('target') === '_blank'
      ) {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hookInstalled = true;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
