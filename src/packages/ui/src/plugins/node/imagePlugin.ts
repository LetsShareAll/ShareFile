import { createNodePlugin } from '../../utils/nodePluginFactory';
import { renderImagePreview } from '../../utils/previewRenderers';

export const imagePlugin = createNodePlugin({
  id: 'image',
  defaultInfo: {
    iconClass: 'fas fa-file-image',
    className: 'image',
  },
  extensions: {
    jpg: { mime: 'image/jpeg' },
    jpeg: { mime: 'image/jpeg' },
    png: { mime: 'image/png' },
    gif: { mime: 'image/gif' },
    svg: { mime: 'image/svg+xml' },
    webp: { mime: 'image/webp' },
    bmp: { mime: 'image/bmp' },
    ico: { mime: 'image/x-icon' },
  },
  preview: input => renderImagePreview(input.fileUrl),
});
