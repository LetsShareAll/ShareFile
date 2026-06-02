import { createNodePlugin } from '../../utils/nodePluginFactory';

export const documentPlugin = createNodePlugin({
  id: 'document',
  defaultInfo: {
    iconClass: 'fas fa-file-alt',
    className: 'document',
  },
  extensions: {
    doc: {
      iconClass: 'fas fa-file-word',
      mime: 'application/msword',
    },
    docx: {
      iconClass: 'fas fa-file-word',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    xls: {
      iconClass: 'fas fa-file-excel',
      mime: 'application/vnd.ms-excel',
    },
    xlsx: {
      iconClass: 'fas fa-file-excel',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
    ppt: {
      iconClass: 'fas fa-file-powerpoint',
      mime: 'application/vnd.ms-powerpoint',
    },
    pptx: {
      iconClass: 'fas fa-file-powerpoint',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    odt: {
      mime: 'application/vnd.oasis.opendocument.text',
    },
    ods: {
      iconClass: 'fas fa-file-excel',
      mime: 'application/vnd.oasis.opendocument.spreadsheet',
    },
    odp: {
      iconClass: 'fas fa-file-powerpoint',
      mime: 'application/vnd.oasis.opendocument.presentation',
    },
    epub: {
      iconClass: 'fas fa-book',
      mime: 'application/epub+zip',
    },
    mobi: {
      iconClass: 'fas fa-book',
      mime: 'application/x-mobipocket-ebook',
    },
  },
});
