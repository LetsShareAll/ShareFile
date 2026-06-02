import { createNodePlugin } from '../../utils/nodePluginFactory';

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
});
