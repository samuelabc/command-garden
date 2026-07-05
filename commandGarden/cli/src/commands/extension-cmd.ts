import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { resolveScript } from '../resolve-script.js';

export function executeExtensionSetup(baseDir: string): string {
  const manifestPath = resolveScript(
    baseDir,
    '../../chrome/dist/manifest.json',
    '@commandgarden/chrome',
    'dist/manifest.json',
  );
  const extensionDir = dirname(manifestPath);

  // chrome:// is an internal protocol — must target Chrome directly
  const [command, args]: [string, string[]] = process.platform === 'darwin'
    ? ['open', ['-a', 'Google Chrome', 'chrome://extensions']]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', 'chrome', 'chrome://extensions']]
      : ['google-chrome', ['chrome://extensions']];

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => { /* best-effort — instructions still printed */ });
  child.unref();

  return [
    '',
    'Chrome extension path:',
    `  ${extensionDir}`,
    '',
    'To install:',
    '  1. Enable "Developer mode" (top-right toggle)',
    '  2. Click "Load unpacked"',
    '  3. Select the path above',
    '',
    'Opening chrome://extensions...',
    '',
  ].join('\n');
}
