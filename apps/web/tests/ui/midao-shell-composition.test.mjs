import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shell = readFileSync(resolve(root, 'src/features/midao/shell/MidaoShell.tsx'), 'utf8');
const loading = readFileSync(resolve(root, 'src/features/midao/ui/LoadingSkeleton.tsx'), 'utf8');
const error = readFileSync(resolve(root, 'src/features/midao/ui/InlineError.tsx'), 'utf8');
const css = readFileSync(resolve(root, 'src/features/midao/styles/shell.css'), 'utf8');

test('shell composes desktop/mobile navigation, header, verified banner and main landmark', () => {
  for (const name of ['MidaoDesktopSidebar', 'MidaoBottomNav', 'MidaoPageHeader', 'MidaoImpersonationBanner']) {
    assert.ok(shell.includes(name), `shell missing ${name}`);
  }
  assert.match(shell, /<main/u);
  assert.match(shell, /midao-shell__content/u);
  assert.match(css, /padding-bottom:[^;]*var\(--midao-safe-area-bottom\)/u);
  assert.match(css, /midao-desktop-sidebar/u);
  assert.match(css, /@media \(min-width: 768px\)/u);
});

test('basic loading and error states remain accessible and actionable', () => {
  assert.match(loading, /aria-busy="true"/u);
  assert.match(loading, /aria-live=/u);
  assert.match(error, /role="alert"/u);
  assert.match(error, /onRetry/u);
  assert.match(error, /再試一次/u);
});
