import { createNodePlugin } from '../../utils/nodePluginFactory';
import { renderMarkdownPreview } from '../../utils/previewRenderers';

export const markdownPlugin = createNodePlugin({
  id: 'markdown',
  priority: 20,
  defaultInfo: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
  },
  extensions: {
    md: { mime: 'text/markdown' },
  },
  preview: input => renderMarkdownPreview(input),
});
