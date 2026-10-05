import { createNodePlugin } from '../../domain/plugins';

export const folderPlugin = createNodePlugin({
  id: 'folder',
  priority: -900,
  match: input => input.nodeType === 'folder',
  getInfo: () => ({ iconClass: 'fas fa-folder', className: 'folder' }),
});
