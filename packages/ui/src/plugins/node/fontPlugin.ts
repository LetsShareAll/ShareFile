import { createNodePlugin } from '../../domain/plugins';

export const fontPlugin = createNodePlugin({
  id: 'font',
  defaultInfo: {
    iconClass: 'fas fa-font',
    className: 'font',
  },
  extensions: {
    ttf: { mime: 'font/ttf' },
    otf: { mime: 'font/otf' },
    woff: { mime: 'font/woff' },
    woff2: { mime: 'font/woff2' },
  },
  preview: async () =>
    (await import('../../features/preview/renderers/FontPreview.vue')).default,
});
