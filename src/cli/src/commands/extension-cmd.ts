import { dirname } from 'node:path';
import { resolveScript } from '../resolve-script.js';

export function executeExtensionSetup(baseDir: string): string {
  const manifestPath = resolveScript(
    baseDir,
    '../../chrome/dist/manifest.json',
    '@commandgarden/chrome',
    'dist/manifest.json',
  );
  const extensionDir = dirname(manifestPath);

  return [
    '',
    'Extension path:',
    `  ${extensionDir}`,
    '',
    'To install:',
    '  1. Open your browser\'s extensions page',
    '     Chrome/Brave: chrome://extensions  |  Edge: edge://extensions',
    '  2. Enable "Developer mode" (top-right toggle)',
    '  3. Click "Load unpacked"',
    '  4. Select the path above',
    '',
  ].join('\n');
}
