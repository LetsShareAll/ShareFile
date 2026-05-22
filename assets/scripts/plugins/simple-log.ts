import { PluginHandle, PluginContext } from '../plugin-registry';

export default async function register(
  ctx: PluginContext,
): Promise<PluginHandle> {
  const logger = ctx.logger;

  const handle: PluginHandle = {
    name: 'simple-log',
    provides: ['lifecycle'],
    hooks: {
      init: () => {
        logger.info('simple-log 插件已初始化');
      },
      beforeScan: (dir: string) => {
        logger.debug(`simple-log: 即将扫描目录 ${dir}`);
      },
    },
  };

  return handle;
}
