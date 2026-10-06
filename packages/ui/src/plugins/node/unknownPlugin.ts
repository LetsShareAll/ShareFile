import { createNodePlugin } from '../../domain/plugins';

export const unknownPlugin = createNodePlugin({
  id: 'unknown',
  priority: -1000,
  match: input => input.nodeType === 'file',
  getInfo: () => ({ iconClass: 'fas fa-file', className: 'unknown' }),
});
