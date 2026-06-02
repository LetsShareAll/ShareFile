import { archivePlugin } from './archivePlugin';
import { audioPlugin } from './audioPlugin';
import { codePlugin } from './codePlugin';
import { diskImagePlugin } from './diskImagePlugin';
import { documentPlugin } from './documentPlugin';
import { executablePlugin } from './executablePlugin';
import { folderPlugin } from './folderPlugin';
import { fontPlugin } from './fontPlugin';
import { imagePlugin } from './imagePlugin';
import { markdownPlugin } from './markdownPlugin';
import { pdfPlugin } from './pdfPlugin';
import { textPlugin } from './textPlugin';
import { unknownPlugin } from './unknownPlugin';
import { videoPlugin } from './videoPlugin';
import { NodePlugin } from './types';

export const builtinNodePlugins: NodePlugin[] = [
  markdownPlugin,
  codePlugin,
  imagePlugin,
  videoPlugin,
  audioPlugin,
  pdfPlugin,
  textPlugin,
  documentPlugin,
  archivePlugin,
  executablePlugin,
  diskImagePlugin,
  fontPlugin,
  folderPlugin,
  unknownPlugin,
];
