/**
 * @fileoverview 前端渲染核心脚本。
 * 完全适配 Apple 设计规范，支持全品类文件图标与预览。
 * 详细视图下额外显示文件 MIME 类型。
 * 修复面包屑导航跳转问题（闭包陷阱）。
 */

declare const marked: { parse(md: string): string };

// ────────────── 类型定义 ──────────────
import { getFileTypeInfo, previewWithPlugins } from './plugins/pluginRegistry';
import { DOM, openModal, closeModal } from './ui';
import {
  createIcon,
  formatSize,
  getErrorMessage,
  getBadgeLabel,
} from './utils';

interface ShareNode {
  readonly id: string;
  readonly name: string;
  readonly type: 'file' | 'folder';
  readonly parent: string | null;
  readonly children: string[];
  readonly description?: string;
  readonly hidden?: boolean;
  readonly size?: number;
  readonly version?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly md5?: string;
  readonly sha256?: string;
  readonly redirect_url?: string | null;
  readonly redirect_type?: string | null;
  readonly redirect_confirm_message?: string | null;
}

interface ShareFile {
  readonly rootId: string;
  readonly pathIndex: Record<string, string>;
  readonly nodes: Record<string, ShareNode>;
}

// ────────────── 全局状态 ──────────────
let globalShareData: ShareFile | null = null;

// ────────────── SPA 路由 ──────────────
function getCurrentPath(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('path') || '/';
}

function navigateTo(newPath: string): void {
  const newUrl = `?path=${encodeURIComponent(newPath)}`;
  window.history.pushState({ path: newPath }, '', newUrl);
  renderCurrentView();
}

window.addEventListener('popstate', () => {
  renderCurrentView();
});

// ────────────── 预览引擎 ──────────────
async function previewFileContent(
  fileName: string,
  fileUrl: string,
): Promise<void> {
  const fileTypeInfo = getFileTypeInfo(fileName, 'file');
  const result = await previewWithPlugins(fileName, fileUrl, fileTypeInfo);

  if (result) {
    openModal(fileName, result);
    return;
  }

  window.open(fileUrl, '_blank');
}

// ────────────── 渲染引擎 ──────────────
function renderBreadcrumb(path: string): void {
  DOM.breadcrumb.innerHTML = '';
  const segments = path.split('/').filter(Boolean);

  const rootLink = document.createElement('a');
  rootLink.href = 'javascript:void(0)';
  rootLink.textContent = 'root';
  rootLink.onclick = () => navigateTo('/');
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
      DOM.breadcrumb.appendChild(current);
    } else {
      // ⚠️ 修复闭包陷阱：用 const 保存当前路径
      const targetPath = accumulatedPath;
      const link = document.createElement('a');
      link.href = 'javascript:void(0)';
      link.textContent = segment;
      link.onclick = () => navigateTo(targetPath);
      DOM.breadcrumb.appendChild(link);
    }
  });
}

// ────────────── 自定义对话框引擎 ──────────────
function showHtmlConfirm(
  title: string,
  messageHtml: string,
  onConfirm: () => void,
): void {
  const container = document.createElement('div');

  // 1. 消息文本容器，直接使用 innerHTML 渲染包含的 HTML5 标签
  const msgDiv = document.createElement('div');
  msgDiv.className = 'confirm-message';
  msgDiv.innerHTML = messageHtml;
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

async function renderContent(currentPath: string): Promise<void> {
  if (!globalShareData) return;
  DOM.content.innerHTML = '';

  const nodeId = globalShareData.pathIndex[currentPath];

  if (!nodeId) {
    DOM.content.innerHTML = '<p class="error">⛔ 该路径不存在或已被移除</p>';
    return;
  }

  const currentNode = globalShareData.nodes[nodeId];

  if (currentNode.description && currentNode.id !== 'root') {
    const descEl = document.createElement('p');
    descEl.className = 'directory-description';
    descEl.textContent = currentNode.description;
    DOM.content.appendChild(descEl);
  }

  const childIds = currentNode.children || [];

  if (childIds.length === 0) {
    DOM.content.innerHTML +=
      '<p class="empty"><i class="fas fa-inbox"></i> 此目录为空</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'file-list';
  let readmeFound = false;

  childIds.forEach(childId => {
    const childNode = globalShareData!.nodes[childId];
    if (!childNode) return;
    if (childNode.name === 'README.md') readmeFound = true;

    const listItem = document.createElement('li');
    listItem.className = 'file-item';
    if (childNode.hidden) listItem.classList.add('hidden-item');

    const typeInfo = getFileTypeInfo(childNode.name, childNode.type);

    const iconSpan = document.createElement('span');
    iconSpan.className = `item-icon ${typeInfo.className}`;
    iconSpan.appendChild(createIcon(typeInfo.iconClass));
    const badge = document.createElement('span');
    badge.className = 'icon-badge';
    badge.textContent = getBadgeLabel(typeInfo.className, typeInfo.mime);
    iconSpan.appendChild(badge);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.innerHTML =
      childNode.name +
      (childNode.version
        ? ` <span class="version-badge">v${childNode.version}</span>`
        : '');

    const metaSpan = document.createElement('span');
    metaSpan.className = 'item-meta';

    if (childNode.type === 'file') {
      metaSpan.textContent = [
        formatSize(childNode.size),
        childNode.updated_at
          ? new Date(childNode.updated_at).toLocaleDateString()
          : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const itemActions = document.createElement('div');
      itemActions.className = 'item-actions';

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'action-btn';
      downloadBtn.title = '下载文件';
      downloadBtn.innerHTML = '<i class="fas fa-download"></i>';

      downloadBtn.onclick = e => {
        e.stopPropagation();

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
        } else {
          const filePath = childNode.id.startsWith('/')
            ? childNode.id
            : '/' + childNode.id;
          const a = document.createElement('a');
          a.href = filePath;
          a.download = childNode.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      };

      itemActions.appendChild(downloadBtn);

      if (childNode.sha256) {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn';
        copyBtn.title = '复制 SHA256';
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';

        copyBtn.onclick = async e => {
          e.stopPropagation();

          try {
            await navigator.clipboard.writeText(childNode.sha256!);
            copyBtn.innerHTML =
              '<i class="fas fa-check" style="color: #10b981;"></i>';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
          } catch (err) {
            console.error('复制失败', err);
          }
        };

        itemActions.appendChild(copyBtn);
      }

      // 详细信息区域（MD5、SHA256、MIME）
      const itemDetail = document.createElement('div');
      itemDetail.className = 'item-detail';

      if (childNode.md5) {
        itemDetail.innerHTML += `<div class="detail-row"><span class="detail-label">MD5:</span> <span class="hash">${childNode.md5}</span></div>`;
      }

      if (childNode.sha256) {
        itemDetail.innerHTML += `<div class="detail-row"><span class="detail-label">SHA256:</span> <span class="hash">${childNode.sha256}</span></div>`;
      }

      // 新增：显示 MIME 类型
      itemDetail.innerHTML += `<div class="detail-row"><span class="detail-label">MIME:</span> <span class="hash">${typeInfo.mime || 'unknown'}</span></div>`;

      listItem.append(iconSpan, nameSpan, metaSpan, itemActions, itemDetail);

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

        const filePath = childNode.id.startsWith('/')
          ? childNode.id
          : '/' + childNode.id;
        previewFileContent(childNode.name, filePath);
      };
    } else {
      // 渲染文件夹的元信息
      metaSpan.textContent = `📁 ${childNode.children?.length ?? 0} 项`;
      listItem.append(iconSpan, nameSpan, metaSpan);

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
        navigateTo('/' + childNode.id);
      };
    }

    list.appendChild(listItem);
  });

  DOM.content.appendChild(list);

  if (readmeFound) {
    try {
      const fileUrl =
        currentPath === '/' ? '/README.md' : `${currentPath}/README.md`;
      const resp = await fetch(fileUrl);

      if (resp.ok) {
        DOM.previewContent.innerHTML = marked.parse(await resp.text());
        DOM.previewSec.style.display = 'block';
      }
    } catch {
      DOM.previewSec.style.display = 'none';
    }
  } else {
    DOM.previewSec.style.display = 'none';
  }
}

async function renderCurrentView(): Promise<void> {
  const currentPath = getCurrentPath();
  renderBreadcrumb(currentPath);
  await renderContent(currentPath);
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
}

// ────────────── 启动入口 ──────────────
async function main(): Promise<void> {
  initThemeAndView();

  try {
    const response = await fetch('assets/data/share-file.json');
    if (!response.ok) throw new Error('索引服务器异常');
    globalShareData = await response.json();
    DOM.loading.style.display = 'none';
    DOM.content.style.display = 'block';
    await renderCurrentView();
  } catch (error) {
    DOM.loading.style.display = 'none';
    DOM.content.style.display = 'block';
    DOM.content.innerHTML = `<p class="error"><i class="fas fa-exclamation-triangle"></i> 加载失败：${getErrorMessage(error)}</p>`;
  }
}

window.addEventListener('DOMContentLoaded', main);
