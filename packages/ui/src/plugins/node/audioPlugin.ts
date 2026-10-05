import { createNodePlugin } from '../../domain/plugins';

export const audioPlugin = createNodePlugin({
  id: 'audio',
  defaultInfo: {
    iconClass: 'fas fa-file-audio',
    className: 'audio',
  },
  extensions: {
    mp3: { mime: 'audio/mpeg' },
    flac: { mime: 'audio/flac' },
    wav: { mime: 'audio/wav' },
    ogg: { mime: 'audio/ogg' },
    aac: { mime: 'audio/aac' },
    wma: { mime: 'audio/x-ms-wma' },
    m4a: { mime: 'audio/mp4' },
  },
  preview: async () =>
    (await import('../../features/preview/players/AudioPlayer.vue')).default,
});
