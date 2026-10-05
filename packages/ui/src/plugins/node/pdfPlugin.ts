import { createNodePlugin } from '../../domain/plugins';

export const pdfPlugin = createNodePlugin({
  id: 'pdf',
  defaultInfo: {
    iconClass: 'fas fa-file-pdf',
    className: 'document',
  },
  extensions: {
    pdf: { mime: 'application/pdf' },
  },
  preview: async () =>
    (await import('../../features/preview/renderers/PdfPreview.vue')).default,
});
