import type { HLJSApi } from 'highlight.js';

/**
 * 扩展名 → highlight.js 语言名（与旧 codePlugin 的映射逐条一致）。
 */
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'bash',
  bat: 'dos',
  c: 'c',
  cfg: 'ini',
  cjs: 'javascript',
  conf: 'ini',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  graphql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  htm: 'xml',
  html: 'xml',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  list: 'plaintext',
  lua: 'lua',
  mjs: 'javascript',
  php: 'php',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  reg: 'ini',
  rs: 'rust',
  scala: 'scala',
  sh: 'bash',
  sql: 'sql',
  svelte: 'xml',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  vue: 'xml',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

let corePromise: Promise<HLJSApi> | null = null;

async function loadCore(): Promise<HLJSApi> {
  const [{ default: hljs }, { registerLanguages }] = await Promise.all([
    import('highlight.js/lib/core'),
    import('./highlightLanguages'),
  ]);

  registerLanguages(hljs);

  return hljs;
}

function getCore(): Promise<HLJSApi> {
  corePromise ??= loadCore();

  return corePromise;
}

export function getCodeLanguage(name: string, mime?: string): string {
  const extension = name.toLowerCase().split('.').pop() || '';
  const byExtension = LANGUAGE_BY_EXTENSION[extension];

  if (byExtension) return byExtension;

  if (mime?.includes('json')) return 'json';

  if (mime?.includes('xml')) return 'xml';

  if (mime?.includes('javascript')) return 'javascript';

  if (mime?.includes('typescript')) return 'typescript';

  if (mime?.includes('yaml')) return 'yaml';

  return 'plaintext';
}

function highlightLine(hljs: HLJSApi, line: string, language: string): string {
  if (!hljs.getLanguage(language)) {
    return hljs.highlight(line, { language: 'plaintext' }).value;
  }

  return hljs.highlight(line, { language, ignoreIllegals: true }).value;
}

/**
 * 逐行高亮（与旧实现一致），返回可直接写入 `code-line-content` 的 HTML。
 */
export async function highlightCodeLines(
  text: string,
  language: string,
): Promise<string[]> {
  const hljs = await getCore();

  return text
    .split(/\r\n|\r|\n/)
    .map(line => highlightLine(hljs, line, language));
}
