import { createNodePlugin } from '../../domain/plugins';

export const videoPlugin = createNodePlugin({
  id: 'video',
  defaultInfo: {
    iconClass: 'fas fa-file-video',
    className: 'video',
  },
  extensions: {
    mp4: { mime: 'video/mp4' },
    mkv: { mime: 'video/x-matroska' },
    webm: { mime: 'video/webm' },
    avi: { mime: 'video/x-msvideo' },
    mov: { mime: 'video/quicktime' },
    flv: { mime: 'video/x-flv' },
  },
  preview: async () =>
    (await import('../../features/preview/players/VideoPlayer.vue')).default,
});
