import { createNodePlugin } from '../../utils/nodePluginFactory';

export const archivePlugin = createNodePlugin({
  id: 'archive',
  defaultInfo: {
    iconClass: 'fas fa-file-archive',
    className: 'archive',
  },
  extensions: {
    zip: { mime: 'application/zip' },
    rar: { mime: 'application/vnd.rar' },
    '7z': { mime: 'application/x-7z-compressed' },
    tar: { mime: 'application/x-tar' },
    gz: { mime: 'application/gzip' },
    bz2: { mime: 'application/x-bzip2' },
    xz: { mime: 'application/x-xz' },
    tgz: { mime: 'application/gzip' },
  },
  compoundExtensions: {
    'tar.gz': {},
  },
});
