import { NodePlugin } from './types';

export const folderPlugin: NodePlugin = {
  id: 'folder',
  priority: -900,
  match: input => input.nodeType === 'folder',
  getInfo: () => ({ iconClass: 'fas fa-folder', className: 'folder' }),
};
