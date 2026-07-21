/**
 * @fileoverview 前端渲染核心脚本。
 * 完全适配 Apple 设计规范，支持全品类文件图标与预览。
 * 详细视图下额外显示文件 MIME 类型。
 * 修复面包屑导航跳转问题（闭包陷阱）。
 */

declare const marked: { parse(md: string): string };
declare const SHARE_FILE_NAME: string;

// ────────────── 类型定义 ──────────────
import {
  previewWithResolvedNodePlugin,
  resolveNodePlugin,
  type ResolvedNodePlugin,
} from './utils/pluginRegistry';
import { createPreviewLoadingState } from './utils/previewRenderers';
import { DOM, openModal, closeModal } from './ui';
import {
  createIcon,
  formatSize,
  formatFileSizeUnit,
  getErrorMessage,
  getRelativeTime,
} from './utils';

import type { ShareNode, ShareFile } from './share-file';
import {
  getNodeMountSource,
  getShareFilePathIndex,
  getShareFileRootId,
  normalizeShareFile,
} from './share-file';
import {
  loadAllExternalSources,
  clearAllExternalCache,
} from './externalSourceLoader';
import { showError, showSuccess, showInfo } from './notifications';

// ────────────── 全局状态 ──────────────
let globalShareData: ShareFile | null = null;
let globalNodePathIndex = new Map<string, string>();
let searchQuery = '';
let previewRequestId = 0;
const DEFAULT_NODE_DESCRIPTION = '我也不知道这个文件是啥呢！(lll￢ω￢)';
const PENDING_ROUTE_STORAGE_KEY = 'share-file:pending-route';

function buildNodePathIndex(shareData: ShareFile): Map<string, string> {
  return new Map(
    Object.entries(getShareFilePathIndex(shareData)).map(([path, nodeId]) => [
      nodeId,
      path,
    ]),
  );
}

function setShareData(shareData: ShareFile): void {
  globalShareData = shareData;
  globalNodePathIndex = buildNodePathIndex(shareData);
}

function normalizeRoutePath(value: string): string {
  if (!value) return '/';

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '');

  return withoutTrailingSlash || '/';
}

function formatBrowserPath(path: string): string {
  const normalizedPath = normalizeRoutePath(path);
  return normalizedPath === '/' ? '/' : encodeURI(normalizedPath);
}

function getQueryPath(): string {
  const params = new URLSearchParams(window.location.search);
  const path = params.get('path');

  return path ? normalizeRoutePath(path) : '/';
}

function getPathnamePath(): string {
  try {
    return normalizeRoutePath(decodeURIComponent(window.location.pathname));
  } catch {
    return normalizeRoutePath(window.location.pathname);
  }
}

function getPendingRoute(): string | null {
  try {
    return sessionStorage.getItem(PENDING_ROUTE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearPendingRoute(): void {
  try {
    sessionStorage.removeItem(PENDING_ROUTE_STORAGE_KEY);
  } catch {
    // Storage may be disabled; query-path fallback still works.
  }
}

function bootstrapPendingRoute(): void {
  const pendingRoute = getPendingRoute();
  const pathname = getPathnamePath();

  if (!pendingRoute) {
    const queryPath = getQueryPath();

    if (pathname === '/' && queryPath !== '/') {
      window.history.replaceState(
        { path: queryPath },
        '',
        formatBrowserPath(queryPath),
      );
    }

    return;
  }

  clearPendingRoute();

  const normalizedPendingRoute = normalizeRoutePath(pendingRoute);
  if (pathname === normalizedPendingRoute) return;

  window.history.replaceState(
    { path: normalizedPendingRoute },
    '',
    formatBrowserPath(normalizedPendingRoute),
  );
}

// ────────────── SPA 路由 ──────────────
function getCurrentPath(): string {
  const pathname = getPathnamePath();
  if (pathname !== '/') return pathname;

  const pendingRoute = getPendingRoute();

  if (pendingRoute) {
    return normalizeRoutePath(pendingRoute);
  }

  return getQueryPath();
}

function navigateTo(newPath: string): void {
  const normalizedPath = normalizeRoutePath(newPath);
  const newUrl = formatBrowserPath(normalizedPath);
  window.history.pushState({ path: normalizedPath }, '', newUrl);
  renderCurrentView();
}

function renderCurrentView(): Promise<void> {
  const currentPath = getCurrentPath();
  renderBreadcrumb(currentPath);
  return renderContent(currentPath);
}

window.addEventListener('popstate', () => {
  renderCurrentView();
});

// ────────────── 预览引擎 ──────────────
async function previewFileContent(
  fileName: string,
  fileUrl: string,
  resolvedNodePlugin: ResolvedNodePlugin,
): Promise<void> {
  const requestId = ++previewRequestId;

  openModal(fileName, createPreviewLoadingState('正在加载预览...'));

  const result = await previewWithResolvedNodePlugin(
    resolvedNodePlugin,
    fileUrl,
  );

  if (requestId !== previewRequestId) return;

  if (result) {
    openModal(fileName, result);
    return;
  }

  closeModal();
  window.open(fileUrl, '_blank');
}

// ────────────── 渲染引擎 ──────────────
function markExternalBreadcrumb(element: HTMLElement): void {
  element.classList.add('external-breadcrumb');

  const icon = createIcon('fas fa-link');
  icon.classList.add('external-breadcrumb-icon');
  icon.setAttribute('aria-hidden', 'true');
  element.prepend(icon);
}

function renderBreadcrumb(path: string): void {
  DOM.breadcrumb.innerHTML = '';
  const segments = path.split('/').filter(Boolean);

  const rootLink = document.createElement('a');
  rootLink.href = '/';
  rootLink.textContent = 'root';

  rootLink.onclick = event => {
    event.preventDefault();
    navigateTo('/');
  };

  DOM.breadcrumb.appendChild(rootLink);

  let accumulatedPath = '';
  segments.forEach((segment, index) => {
    accumulatedPath += '/' + segment;
    const spacer = document.createElement('span');
    spacer.textContent = ' / ';
    DOM.breadcrumb.appendChild(spacer);

    if (index === segments.length - 1) {
      // 当前路径（最后一级）展示为普通文本，不可点击
      const current = document.createElement('span');
      current.textContent = segment;
      current.className = 'current';

      // 检查是否为外部节点
      const nodeId = globalShareData
        ? getShareFilePathIndex(globalShareData)[accumulatedPath]
        : undefined;

      if (nodeId && globalShareData?.nodes[nodeId]?.source === 'external') {
        markExternalBreadcrumb(current);
      }

      DOM.breadcrumb.appendChild(current);
    } else {
      // ⚠️ 修复闭包陷阱：用 const 保存当前路径
      const targetPath = accumulatedPath;
      const link = document.createElement('a');
      link.href = 'javascript:void(0)';
      link.textContent = segment;
      link.onclick = () => navigateTo(targetPath);

      // 检查是否为外部节点
      const nodeId = globalShareData
        ? getShareFilePathIndex(globalShareData)[targetPath]
        : undefined;

      if (nodeId && globalShareData?.nodes[nodeId]?.source === 'external') {
        markExternalBreadcrumb(link);
      }

      DOM.breadcrumb.appendChild(link);
    }
  });
}

function getNodePath(nodeId: string): string {
  if (!globalShareData) return '/';

  const indexedPath = globalNodePathIndex.get(nodeId);

  return indexedPath || (nodeId.startsWith('/') ? nodeId : '/' + nodeId);
}

function normalizeSearchText(text?: string): string {
  return (text || '').trim().toLocaleLowerCase();
}

function getSearchResultIds(query: string): string[] {
  if (!globalShareData) return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return Object.values(globalShareData.nodes)
    .filter(node => node.id !== getShareFileRootId(globalShareData!))
    .filter(node => {
      const nodePath = getNodePath(node.id);
      const searchableText = normalizeSearchText(
        [node.name, node.description, nodePath].filter(Boolean).join(' '),
      );

      return searchableText.includes(normalizedQuery);
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
      return getNodePath(left.id).localeCompare(getNodePath(right.id), 'zh-CN');
    })
    .map(node => node.id);
}

function clearSearchState(): void {
  searchQuery = '';
  DOM.searchInput.value = '';
}

// ────────────── 自定义对话框引擎 ──────────────
const ALLOWED_CONFIRM_MESSAGE_TAGS = new Set([
  'A',
  'B',
  'BR',
  'CODE',
  'EM',
  'I',
  'KBD',
  'LI',
  'OL',
  'P',
  'PRE',
  'S',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'U',
  'UL',
]);
const DROP_CONFIRM_MESSAGE_TAGS = new Set([
  'IFRAME',
  'LINK',
  'META',
  'OBJECT',
  'SCRIPT',
  'STYLE',
]);
const SAFE_CONFIRM_LINK_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

function isSafeConfirmLink(value: string): boolean {
  try {
    const url = new URL(value, window.location.href);

    return SAFE_CONFIRM_LINK_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function sanitizeConfirmAnchor(element: HTMLAnchorElement): void {
  const href = element.getAttribute('href');

  if (!href || !isSafeConfirmLink(href)) {
    element.removeAttribute('href');
  }

  element.setAttribute('target', '_blank');
  element.setAttribute('rel', 'noopener noreferrer');
}

function sanitizeConfirmMessageNode(parent: ParentNode): void {
  Array.from(parent.childNodes).forEach(node => {
    if (!(node instanceof Element)) return;

    const tagName = node.tagName.toUpperCase();

    if (DROP_CONFIRM_MESSAGE_TAGS.has(tagName)) {
      node.remove();
      return;
    }

    sanitizeConfirmMessageNode(node);

    if (!ALLOWED_CONFIRM_MESSAGE_TAGS.has(tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const allowed =
        name === 'title' ||
        (tagName === 'A' && ['href', 'target', 'rel'].includes(name));

      if (!allowed) {
        node.removeAttribute(attribute.name);
      }
    });

    if (node instanceof HTMLAnchorElement) {
      sanitizeConfirmAnchor(node);
    }
  });
}

function sanitizeConfirmMessageHtml(messageHtml: string): string {
  const template = document.createElement('template');

  template.innerHTML = messageHtml;
  sanitizeConfirmMessageNode(template.content);

  return template.innerHTML;
}

function showHtmlConfirm(
  title: string,
  messageHtml: string,
  onConfirm: () => void,
): void {
  const container = document.createElement('div');

  // 1. 消息文本容器，直接使用 innerHTML 渲染包含的 HTML5 标签
  const msgDiv = document.createElement('div');
  msgDiv.className = 'confirm-message';
  msgDiv.innerHTML = sanitizeConfirmMessageHtml(messageHtml);
  msgDiv.style.fontSize = '1.05rem';
  msgDiv.style.lineHeight = '1.6';

  // 2. 按钮组容器
  const btnGroup = document.createElement('div');
  btnGroup.className = 'confirm-buttons';
  btnGroup.style.display = 'flex';
  btnGroup.style.justifyContent = 'flex-end';
  btnGroup.style.gap = '0.8rem';
  btnGroup.style.marginTop = '2rem';

  // 3. 取消按钮
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn';
  cancelBtn.textContent = '取消';

  cancelBtn.onclick = e => {
    e.stopPropagation();
    closeModal(); // 关闭弹窗
  };

  // 4. 确认按钮 (赋予主色调以示区分)
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'action-btn';
  confirmBtn.style.background = 'var(--primary)';
  confirmBtn.style.color = '#fff';
  confirmBtn.style.fontWeight = '600';
  confirmBtn.textContent = '继续';
  // 增加简单的 hover 动效
  confirmBtn.onmouseover = () => (confirmBtn.style.opacity = '0.8');
  confirmBtn.onmouseout = () => (confirmBtn.style.opacity = '1');

  confirmBtn.onclick = e => {
    e.stopPropagation();
    closeModal(); // 关闭弹窗并执行传入的跳转回调
    onConfirm();
  };

  btnGroup.append(cancelBtn, confirmBtn);
  container.append(msgDiv, btnGroup);

  // 借助已有的 modal 渲染
  openModal(title, container);
}

function formatHashPreview(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

const ICON_VIEW_ALIGNMENT_VARS = [
  '--icon-row',
  '--name-row',
  '--description-row',
  '--path-row',
  '--meta-row',
  '--actions-row',
] as const;

function clearIconViewAlignment(): void {
  DOM.content.querySelectorAll<HTMLElement>('.file-item').forEach(item => {
    ICON_VIEW_ALIGNMENT_VARS.forEach(variable => {
      item.style.removeProperty(variable);
    });
  });
}

function alignIconViewRows(): void {
  const container = document.querySelector('.container');
  const list = DOM.content.querySelector<HTMLElement>('.file-list');

  clearIconViewAlignment();

  if (!container?.classList.contains('view-icon') || !list) return;

  const items = Array.from(list.querySelectorAll<HTMLElement>('.file-item'));
  const rows = new Map<number, HTMLElement[]>();

  items.forEach(item => {
    const rowTop = Math.round(item.offsetTop);
    const row = rows.get(rowTop) || [];

    row.push(item);
    rows.set(rowTop, row);
  });

  rows.forEach(rowItems => {
    const rowHeights = {
      icon: 0,
      name: 0,
      description: 0,
      path: 0,
      meta: 0,
      actions: 0,
    };

    rowItems.forEach(item => {
      rowHeights.icon = Math.max(
        rowHeights.icon,
        item.querySelector<HTMLElement>('.item-icon')?.offsetHeight || 0,
      );
      rowHeights.name = Math.max(
        rowHeights.name,
        item.querySelector<HTMLElement>('.item-name')?.offsetHeight || 0,
      );
      rowHeights.description = Math.max(
        rowHeights.description,
        item.querySelector<HTMLElement>('.item-description')?.offsetHeight || 0,
      );
      rowHeights.path = Math.max(
        rowHeights.path,
        item.querySelector<HTMLElement>('.item-path')?.offsetHeight || 0,
      );
      rowHeights.meta = Math.max(
        rowHeights.meta,
        item.querySelector<HTMLElement>('.item-stats')?.offsetHeight || 0,
      );
      rowHeights.actions = Math.max(
        rowHeights.actions,
        item.querySelector<HTMLElement>('.item-actions')?.offsetHeight || 0,
      );
    });

    rowItems.forEach(item => {
      item.style.setProperty('--icon-row', `${rowHeights.icon}px`);
      item.style.setProperty('--name-row', `${rowHeights.name}px`);
      item.style.setProperty(
        '--description-row',
        `${rowHeights.description}px`,
      );
      item.style.setProperty('--path-row', `${rowHeights.path}px`);
      item.style.setProperty('--meta-row', `${rowHeights.meta}px`);
      item.style.setProperty('--actions-row', `${rowHeights.actions}px`);
    });
  });
}

function scheduleIconViewAlignment(): void {
  requestAnimationFrame(() => alignIconViewRows());
}

function createCopyLinkButton(url: string): HTMLButtonElement {
  const linkBtn = document.createElement('button');
  linkBtn.className = 'action-btn';
  linkBtn.title = '复制链接';
  linkBtn.innerHTML = '<i class="fas fa-link"></i>';

  linkBtn.onclick = (e: MouseEvent) => {
    e.stopPropagation();

    navigator.clipboard.writeText(url).catch(err => {
      console.error('复制链接失败', err);
    });
  };

  return linkBtn;
}

function createExternalSourceIndicator(node: ShareNode): HTMLSpanElement {
  const indicator = document.createElement('span');
  indicator.className = 'external-indicator';
  indicator.title = `来自外部源: ${node.mount_point || '/'}`;
  indicator.innerHTML = '<i class="fas fa-link"></i>';

  return indicator;
}

function getNodeFilePath(node: ShareNode): string {
  return node.id.startsWith('/') ? node.id : '/' + node.id;
}

function getNodeFileUrl(node: ShareNode): string {
  return node.url || getNodeFilePath(node);
}

function triggerFileDownload(node: ShareNode): void {
  const a = document.createElement('a');
  a.href = getNodeFileUrl(node);
  a.download = node.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function renderDirectFileRoute(node: ShareNode): void {
  DOM.previewSec.style.display = 'none';

  if (node.redirect_url) {
    if (node.redirect_type === 'confirm' && node.redirect_confirm_message) {
      showHtmlConfirm('跳转提示', node.redirect_confirm_message, () => {
        window.location.href = node.redirect_url!;
      });
    } else {
      window.location.href = node.redirect_url;
    }

    return;
  }

  DOM.content.innerHTML = '';

  const state = document.createElement('div');
  state.className = 'direct-download-state';

  const message = document.createElement('p');
  message.className = 'empty direct-download-message';
  message.innerHTML = '<i class="fas fa-download"></i> 正在下载文件';

  const fallbackLink = document.createElement('a');
  fallbackLink.className = 'action-btn direct-download-link';
  fallbackLink.href = getNodeFileUrl(node);
  fallbackLink.download = node.name;
  fallbackLink.innerHTML =
    '<i class="fas fa-download"></i><span>如果下载未开始，请点击这里</span>';

  state.append(message, fallbackLink);
  DOM.content.appendChild(state);
  requestAnimationFrame(() => triggerFileDownload(node));
}

async function renderContent(currentPath: string): Promise<void> {
  if (!globalShareData) return;
  DOM.content.innerHTML = '';

  const activeSearchQuery = searchQuery.trim();
  const nodeId = getShareFilePathIndex(globalShareData)[currentPath];

  if (!nodeId && !activeSearchQuery) {
    DOM.content.innerHTML = '<p class="error">⛔ 该路径不存在或已被移除</p>';
    return;
  }

  const currentNode = nodeId ? globalShareData.nodes[nodeId] : undefined;

  if (!activeSearchQuery && currentNode?.type === 'file') {
    renderDirectFileRoute(currentNode);
    return;
  }

  if (
    !activeSearchQuery &&
    currentNode?.description &&
    currentNode.id !== 'root'
  ) {
    const descEl = document.createElement('p');
    descEl.className = 'directory-description';
    descEl.textContent = currentNode.description;
    DOM.content.appendChild(descEl);
  }

  const childIds = activeSearchQuery
    ? getSearchResultIds(activeSearchQuery)
    : currentNode?.children || [];

  if (activeSearchQuery) {
    const summary = document.createElement('p');
    summary.className = 'search-summary';
    summary.textContent = `搜索 "${activeSearchQuery}"，找到 ${childIds.length} 项`;
    DOM.content.appendChild(summary);
  }

  if (childIds.length === 0) {
    DOM.content.innerHTML += activeSearchQuery
      ? '<p class="empty"><i class="fas fa-search"></i> 没有找到匹配项</p>'
      : '<p class="empty"><i class="fas fa-inbox"></i> 此目录为空</p>';
    DOM.previewSec.style.display = 'none';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'file-list';
  let readmeFound = false;

  childIds.forEach((childId: string) => {
    const childNode = globalShareData!.nodes[childId];
    if (!childNode) return;

    if (!activeSearchQuery && childNode.name === 'README.md') {
      readmeFound = true;
    }

    const listItem = document.createElement('li');
    listItem.className = 'file-item';
    listItem.classList.add(`item-${childNode.type}`);
    if (childNode.hidden) listItem.classList.add('hidden-item');

    // 为外部节点添加特殊样式
    if (childNode.source === 'external') {
      listItem.classList.add('external-item');
    }

    const resolvedNodePlugin = resolveNodePlugin({
      name: childNode.name,
      nodeType: childNode.type,
      node: childNode,
    });
    const typeInfo = resolvedNodePlugin.info;
    const filePath = getNodeFilePath(childNode);
    const fileUrl = getNodeFileUrl(childNode);
    const nodePath =
      childNode.type === 'folder' ? '/' + childNode.id : filePath;
    const copyUrl =
      childNode.redirect_url ||
      (childNode.type === 'folder'
        ? new URL(
            `/?path=${encodeURIComponent(nodePath)}`,
            window.location.origin,
          ).href
        : childNode.url || new URL(nodePath, window.location.origin).href);

    const iconSpan = document.createElement('span');
    iconSpan.className = `item-icon ${typeInfo.className}`;
    iconSpan.appendChild(createIcon(typeInfo.iconClass));

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.title = childNode.name;

    const nameText = document.createElement('span');
    nameText.className = 'item-name-text';
    nameText.textContent = childNode.name;
    nameSpan.appendChild(nameText);

    if (childNode.version) {
      const versionBadge = document.createElement('span');
      versionBadge.className = 'version-badge';
      versionBadge.textContent = `v${childNode.version}`;
      nameSpan.appendChild(versionBadge);
    }

    if (childNode.source === 'external') {
      nameSpan.appendChild(createExternalSourceIndicator(childNode));
    }

    const descriptionSpan = document.createElement('span');
    descriptionSpan.className = 'item-description';
    descriptionSpan.textContent =
      childNode.description || DEFAULT_NODE_DESCRIPTION;
    descriptionSpan.title = descriptionSpan.textContent;

    const copyBlock = document.createElement('div');
    copyBlock.className = 'item-copy';
    copyBlock.appendChild(nameSpan);
    copyBlock.appendChild(descriptionSpan);

    if (activeSearchQuery) {
      const pathSpan = document.createElement('span');
      const nodeResultPath = getNodePath(childNode.id);

      pathSpan.className = 'item-path';
      pathSpan.textContent = nodeResultPath;
      pathSpan.title = nodeResultPath;
      copyBlock.appendChild(pathSpan);
    }

    const mainRow = document.createElement('div');
    mainRow.className = 'item-main';
    mainRow.appendChild(iconSpan);
    mainRow.appendChild(copyBlock);

    const metaInfo = document.createElement('span');
    metaInfo.className = 'meta-info';

    const itemStats = document.createElement('div');
    itemStats.className = 'item-stats';
    itemStats.appendChild(metaInfo);

    const itemActions = document.createElement('div');
    itemActions.className = 'item-actions';
    itemActions.appendChild(createCopyLinkButton(copyUrl));

    if (childNode.type === 'file') {
      const sizeText = formatSize(childNode.size);
      const dateText = childNode.updated_at
        ? getRelativeTime(childNode.updated_at)
        : '';

      metaInfo.textContent = [sizeText, dateText].filter(Boolean).join(' · ');

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'action-btn';
      downloadBtn.setAttribute(
        'title',
        `下载文件 (${formatFileSizeUnit(childNode.size || 0)})`,
      );
      downloadBtn.innerHTML = '<i class="fas fa-download"></i>';

      downloadBtn.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        triggerFileDownload(childNode);
      };

      itemActions.appendChild(downloadBtn);
      mainRow.appendChild(itemStats);
      mainRow.appendChild(itemActions);
      listItem.appendChild(mainRow);

      const hashRow = document.createElement('div');
      hashRow.className = 'hash-row';

      const appendHash = (hashType: 'md5' | 'sha256', label: string): void => {
        const hashValue = childNode[hashType];
        if (!hashValue) return;

        const hashButton = document.createElement('button');
        hashButton.className = 'hash-value';
        hashButton.dataset.hash = hashType;
        hashButton.title = `复制 ${label}: ${hashValue}`;
        hashButton.innerHTML = `<span>${label}</span><code>${formatHashPreview(hashValue)}</code>`;
        hashRow.appendChild(hashButton);
      };

      appendHash('md5', 'MD5');
      appendHash('sha256', 'SHA-256');

      if (hashRow.childElementCount > 0) {
        listItem.appendChild(hashRow);
      }

      listItem.onclick = () => {
        if (childNode.redirect_url) {
          if (
            childNode.redirect_type === 'confirm' &&
            childNode.redirect_confirm_message
          ) {
            showHtmlConfirm(
              '跳转提示',
              childNode.redirect_confirm_message,
              () => {
                window.open(childNode.redirect_url!, '_blank');
              },
            );
          } else {
            window.open(childNode.redirect_url, '_blank');
          }

          return;
        }

        previewFileContent(childNode.name, fileUrl, resolvedNodePlugin);
      };

      // 为哈希值添加点击复制事件
      const hashValues = listItem.querySelectorAll<HTMLElement>('.hash-value');
      hashValues.forEach(hashEl => {
        hashEl.onclick = async (e: MouseEvent) => {
          e.stopPropagation();
          const hashType = hashEl.dataset.hash;

          if (hashType !== 'md5' && hashType !== 'sha256') return;

          const hashValue = childNode[hashType];

          if (hashValue) {
            try {
              await navigator.clipboard.writeText(hashValue);
              const hashCode = hashEl.querySelector('code');
              if (!hashCode) return;

              hashEl.style.color = '#10b981';
              hashCode.textContent = '已复制';
              setTimeout(() => {
                hashEl.style.color = '';
                hashCode.textContent = formatHashPreview(hashValue);
              }, 1500);
            } catch (err) {
              console.error('复制失败', err);
            }
          }
        };
      });
    } else {
      // 渲染文件夹的元信息
      metaInfo.textContent = `${childNode.children?.length ?? 0} 项`;
      mainRow.appendChild(itemStats);
      mainRow.appendChild(itemActions);

      listItem.appendChild(mainRow);

      // 修复：为文件夹也添加重定向和弹窗支持
      listItem.onclick = () => {
        if (childNode.redirect_url) {
          if (
            childNode.redirect_type === 'confirm' &&
            childNode.redirect_confirm_message
          ) {
            showHtmlConfirm(
              '跳转提示',
              childNode.redirect_confirm_message,
              () => {
                window.open(childNode.redirect_url!, '_blank');
              },
            );
          } else {
            // 如果不需要确认或没有确认消息，直接打开
            window.open(childNode.redirect_url, '_blank');
          }

          return;
        }

        // 如果没有重定向，正常进入该目录
        if (searchQuery) {
          clearSearchState();
        }

        navigateTo(getNodePath(childNode.id));
      };
    }

    list.appendChild(listItem);
  });

  DOM.content.appendChild(list);
  scheduleIconViewAlignment();

  if (activeSearchQuery) {
    DOM.previewSec.style.display = 'none';
    return;
  }

  if (readmeFound) {
    try {
      // 从当前目录的 children 中查找 README.md 节点
      const readmeNodeId = currentNode?.children.find(childId => {
        const child = globalShareData!.nodes[childId];
        return child && child.name === 'README.md';
      });

      if (readmeNodeId) {
        const readmeNode = globalShareData.nodes[readmeNodeId];
        const readmeUrl =
          readmeNode.url ||
          (currentPath === '/' ? '/README.md' : `${currentPath}/README.md`);
        const resp = await fetch(readmeUrl);

        if (resp.ok) {
          DOM.previewContent.innerHTML = marked.parse(await resp.text());
          DOM.previewSec.style.display = 'block';
        }
      }
    } catch {
      DOM.previewSec.style.display = 'none';
    }
  } else {
    DOM.previewSec.style.display = 'none';
  }
}

// ────────────── 主题与视图切换 ──────────────
function initThemeAndView(): void {
  const html = document.documentElement;
  const container = document.querySelector('.container')!;

  const setTheme = (mode: string) => {
    localStorage.setItem('theme', mode);
    html.setAttribute('data-theme', mode === 'auto' ? '' : mode);
    ['auto', 'light', 'dark'].forEach(m =>
      document
        .getElementById(`btn-${m}-theme`)
        ?.classList.toggle('active', mode === m),
    );
  };

  const setView = (mode: string) => {
    localStorage.setItem('view', mode);
    container.classList.toggle('view-icon', mode === 'icon');
    container.classList.toggle('view-detail', mode === 'detail');
    ['icon', 'detail'].forEach(m =>
      document
        .getElementById(`btn-${m}-view`)
        ?.classList.toggle('active', mode === m),
    );
    scheduleIconViewAlignment();
  };

  setTheme(localStorage.getItem('theme') || 'auto');
  setView(localStorage.getItem('view') || 'icon');

  document
    .getElementById('btn-auto-theme')
    ?.addEventListener('click', () => setTheme('auto'));
  document
    .getElementById('btn-light-theme')
    ?.addEventListener('click', () => setTheme('light'));
  document
    .getElementById('btn-dark-theme')
    ?.addEventListener('click', () => setTheme('dark'));
  document
    .getElementById('btn-icon-view')
    ?.addEventListener('click', () => setView('icon'));
  document
    .getElementById('btn-detail-view')
    ?.addEventListener('click', () => setView('detail'));

  DOM.searchInput.addEventListener('input', () => {
    searchQuery = DOM.searchInput.value.trim();
    renderCurrentView();
  });

  DOM.searchInput.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    clearSearchState();
    renderCurrentView();
  });

  window.addEventListener('resize', scheduleIconViewAlignment);

  document.fonts?.ready.then(() => {
    scheduleIconViewAlignment();
  });
}

// ────────────── 刷新外部源 ──────────────

let hasExternalSources = false;

/**
 * 刷新所有外部源
 */
async function refreshAllExternalSources(): Promise<void> {
  if (!globalShareData) return;

  const refreshBtn = DOM.refreshBtn;
  const icon = refreshBtn.querySelector('i');

  // 禁用按钮并显示加载动画
  refreshBtn.disabled = true;
  icon?.classList.add('fa-spin');

  try {
    showInfo('正在刷新外部源...');

    // 清除所有缓存
    clearAllExternalCache();

    // 重新加载
    const mergedData = await loadAllExternalSources(globalShareData);
    setShareData(mergedData);

    // 重新渲染当前视图
    await renderCurrentView();

    showSuccess('外部源刷新成功');
  } catch (error) {
    showError(`刷新失败: ${getErrorMessage(error)}`);
  } finally {
    refreshBtn.disabled = false;
    icon?.classList.remove('fa-spin');
  }
}

// ────────────── 启动入口 ──────────────
async function main(): Promise<void> {
  initThemeAndView();
  bootstrapPendingRoute();

  try {
    // 加载本地 share-file.json
    const response = await fetch(`/assets/data/${SHARE_FILE_NAME}`);
    if (!response.ok) throw new Error('索引服务器异常');
    const localData = normalizeShareFile(await response.json());

    if (!localData) {
      throw new Error('索引结构不符合要求');
    }

    // 检查是否有外部挂载源
    hasExternalSources = Object.values(localData.nodes).some(
      (node: ShareNode) => node.type === 'folder' && getNodeMountSource(node),
    );

    // 如果有外部源，显示刷新按钮
    if (hasExternalSources) {
      DOM.refreshBtn.style.display = 'block';
      DOM.refreshBtn.addEventListener('click', refreshAllExternalSources);
    }

    // 先显示本地数据
    setShareData(localData);
    DOM.loading.style.display = 'none';
    DOM.content.style.display = 'block';
    await renderCurrentView();

    // 后台异步加载外部源
    if (hasExternalSources) {
      loadAllExternalSources(localData)
        .then(async mergedData => {
          setShareData(mergedData);
          await renderCurrentView();
        })
        .catch(error => {
          console.error('外部源加载失败:', error);
          showError(`外部源加载异常: ${getErrorMessage(error)}`);
        });
    }
  } catch (error) {
    DOM.loading.style.display = 'none';
    DOM.content.style.display = 'block';
    DOM.content.innerHTML = `<p class="error"><i class="fas fa-exclamation-triangle"></i> 加载失败：${getErrorMessage(error)}</p>`;
  }
}

window.addEventListener('DOMContentLoaded', main);
