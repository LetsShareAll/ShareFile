import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import dos from 'highlight.js/lib/languages/dos';
import go from 'highlight.js/lib/languages/go';
import graphql from 'highlight.js/lib/languages/graphql';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scala from 'highlight.js/lib/languages/scala';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createNodePlugin } from '../../utils/nodePluginFactory';
import {
  createCopyButton,
  createLineNumberedCodeBlock,
  fetchPreviewText,
} from '../../utils/previewRenderers';
import { NodePluginPreviewInput } from './types';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('dos', dos);
hljs.registerLanguage('go', go);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('php', php);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('python', python);
hljs.registerLanguage('r', r);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);

const languageByExtension: Record<string, string> = {
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

function getExtension(fileName: string): string {
  return fileName.toLowerCase().split('.').pop() || '';
}

function getCodeLanguage(input: NodePluginPreviewInput): string {
  const extension = getExtension(input.name);
  if (languageByExtension[extension]) return languageByExtension[extension];

  const mime = input.nodeTypeInfo.mime;
  if (mime?.includes('json')) return 'json';
  if (mime?.includes('xml')) return 'xml';
  if (mime?.includes('javascript')) return 'javascript';
  if (mime?.includes('typescript')) return 'typescript';
  if (mime?.includes('yaml')) return 'yaml';

  return 'plaintext';
}

function highlightLine(line: string, language: string): string {
  if (!hljs.getLanguage(language)) {
    return hljs.highlight(line, { language: 'plaintext' }).value;
  }

  return hljs.highlight(line, { language, ignoreIllegals: true }).value;
}

async function renderCodePreview(
  input: NodePluginPreviewInput,
): Promise<HTMLElement> {
  const text = await fetchPreviewText(input);
  const language = getCodeLanguage(input);
  const wrapper = document.createElement('div');
  const toolbar = document.createElement('div');
  const languageLabel = document.createElement('span');
  const highlightedLines = text
    .split(/\r\n|\r|\n/)
    .map(line => highlightLine(line, language));

  wrapper.className = 'code-preview';
  toolbar.className = 'code-preview-toolbar';
  languageLabel.className = 'code-preview-language';
  languageLabel.textContent = language;
  toolbar.append(languageLabel, createCopyButton(text));
  wrapper.append(toolbar, createLineNumberedCodeBlock(highlightedLines));

  return wrapper;
}

export const codePlugin = createNodePlugin({
  id: 'code',
  priority: 10,
  defaultInfo: {
    iconClass: 'fas fa-file-code',
    className: 'code',
  },
  extensions: {
    json: { mime: 'application/json' },
    xml: { mime: 'application/xml' },
    html: { mime: 'text/html' },
    htm: { mime: 'text/html' },
    css: { mime: 'text/css' },
    js: { mime: 'text/javascript' },
    mjs: { mime: 'text/javascript' },
    cjs: { mime: 'text/javascript' },
    ts: { mime: 'text/typescript' },
    tsx: { mime: 'text/typescript-jsx' },
    jsx: { mime: 'text/javascript-jsx' },
    yaml: { mime: 'text/yaml' },
    yml: { mime: 'text/yaml' },
    toml: { mime: 'text/toml' },
    ini: { mime: 'text/plain' },
    cfg: { mime: 'text/plain' },
    conf: { mime: 'text/plain' },
    list: { mime: 'text/plain' },
    reg: { mime: 'text/plain' },
    ps1: { iconClass: 'fas fa-terminal', mime: 'text/plain' },
    sh: { iconClass: 'fas fa-terminal', mime: 'text/plain' },
    bash: { iconClass: 'fas fa-terminal', mime: 'text/plain' },
    zsh: { iconClass: 'fas fa-terminal', mime: 'text/plain' },
    bat: { iconClass: 'fas fa-terminal', mime: 'text/plain' },
    py: { mime: 'text/x-python' },
    rb: { mime: 'text/x-ruby' },
    php: { mime: 'text/x-php' },
    java: { mime: 'text/x-java' },
    c: { mime: 'text/x-c' },
    cpp: { mime: 'text/x-c++' },
    h: { mime: 'text/x-c' },
    hpp: { mime: 'text/x-c++' },
    rs: { mime: 'text/x-rust' },
    go: { mime: 'text/x-go' },
    swift: { mime: 'text/x-swift' },
    kt: { mime: 'text/x-kotlin' },
    scala: { mime: 'text/x-scala' },
    lua: { mime: 'text/x-lua' },
    r: { mime: 'text/x-r' },
    sql: { iconClass: 'fas fa-database', mime: 'text/x-sql' },
    graphql: { mime: 'application/graphql' },
    vue: { mime: 'text/x-vue' },
    svelte: { mime: 'text/x-svelte' },
  },
  preview: input => renderCodePreview(input),
});
