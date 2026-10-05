import { createNodePlugin } from '../../domain/plugins';

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
  preview: async () =>
    (await import('../../features/preview/renderers/MarkdownPreview.vue'))
      .default,
});
