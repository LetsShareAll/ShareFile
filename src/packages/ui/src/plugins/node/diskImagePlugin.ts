import { createNodePlugin } from '../../utils/nodePluginFactory';

export const diskImagePlugin = createNodePlugin({
  id: 'disk-image',
  defaultInfo: {
    iconClass: 'fas fa-compact-disc',
    className: 'disk-image',
  },
  extensions: {
    iso: { mime: 'application/x-iso9660-image' },
    dmg: { mime: 'application/x-apple-diskimage' },
    vhd: { mime: 'application/octet-stream' },
    vmdk: { mime: 'application/octet-stream' },
  },
});
