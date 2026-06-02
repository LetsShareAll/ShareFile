import { createNodePlugin } from '../../utils/nodePluginFactory';
import { renderPlainTextPreview } from '../../utils/previewRenderers';

export const textPlugin = createNodePlugin({
  id: 'text',
  defaultInfo: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
  },
  extensions: {
    txt: { mime: 'text/plain' },
    log: { mime: 'text/plain' },
    csv: { iconClass: 'fas fa-file-csv', mime: 'text/csv' },
    tsv: { mime: 'text/tab-separated-values' },
  },
  preview: input => renderPlainTextPreview(input),
});
