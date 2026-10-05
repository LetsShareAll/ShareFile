import PreviewModal from '../src/features/preview/PreviewModal.vue';
import { createBuiltinRegistry } from '../src/plugins';

export { PreviewModal };

const PROBE_NAMES = [
  'README.md',
  'index.ts',
  'photo.png',
  'clip.mp4',
  'song.mp3',
  'paper.pdf',
  'notes.txt',
  'archive.zip',
  'unknown.bin',
];

export async function probePreviews(): Promise<Record<string, string>> {
  const registry = createBuiltinRegistry();
  const results: Record<string, string> = {};

  for (const name of PROBE_NAMES) {
    const resolved = registry.resolve({ name, nodeType: 'file' });
    const component = await resolved.plugin.preview?.({
      name,
      nodeType: 'file',
      fileUrl: `/${name}`,
      nodeTypeInfo: resolved.info,
    });

    results[`${name}|${resolved.plugin.id}|${resolved.info.className}`] =
      typeof component === 'object' && component !== null
        ? 'component'
        : String(component);
  }

  return results;
}
