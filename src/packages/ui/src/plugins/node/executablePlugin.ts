import { createNodePlugin } from '../../utils/nodePluginFactory';

export const executablePlugin = createNodePlugin({
  id: 'executable',
  defaultInfo: {
    iconClass: 'fas fa-cog',
    className: 'executable',
  },
  extensions: {
    exe: { mime: 'application/x-msdownload' },
    msi: { mime: 'application/x-msi' },
    app: {},
    apk: { mime: 'application/vnd.android.package-archive' },
    deb: { mime: 'application/x-debian-package' },
    rpm: { mime: 'application/x-rpm' },
  },
});
