import { createNodePlugin } from '../../utils/nodePluginFactory';
import { renderPdfPreview } from '../../utils/previewRenderers';

export const pdfPlugin = createNodePlugin({
  id: 'pdf',
  defaultInfo: {
    iconClass: 'fas fa-file-pdf',
    className: 'document',
  },
  extensions: {
    pdf: { mime: 'application/pdf' },
  },
  preview: input => renderPdfPreview(input.fileUrl),
});
