import { NodePlugin } from './types';

export const unknownPlugin: NodePlugin = {
  id: 'unknown',
  priority: -1000,
  match: input => input.nodeType === 'file',
  getInfo: () => ({ iconClass: 'fas fa-file', className: 'unknown' }),
};
