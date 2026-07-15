/**
 * Issue #1585 / Phase 2 — initial locale HTML must remain ISR-safe.
 *
 * `headers()` / `cookies()` in a shared layout makes ISR routes dynamic. The
 * locale segment is now a root layout, so it can receive static params and
 * render the initial `<html lang>` without a request API or client correction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../../app');
const LOCALE_LAYOUT = join(APP, '[locale]/layout.tsx');
const NON_LOCALE_LAYOUT = join(APP, '(non-locale)/layout.tsx');
const ROOT_DOCUMENT = join(__dirname, '../../src/components/layout/RootDocument.tsx');

const localeLayoutSrc = readFileSync(LOCALE_LAYOUT, 'utf8');
const nonLocaleLayoutSrc = readFileSync(NON_LOCALE_LAYOUT, 'utf8');
const rootDocumentSrc = readFileSync(ROOT_DOCUMENT, 'utf8');

for (const [name, source] of [
  ['[locale] root layout', localeLayoutSrc],
  ['non-locale root layout', nonLocaleLayoutSrc],
  ['shared root document', rootDocumentSrc],
]) {
  test(`#1585 ${name} 不得使用 request dynamic APIs`, () => {
    const executableSource = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(executableSource, /from\s+['"]next\/headers['"]/);
    assert.doesNotMatch(executableSource, /\b(headers|cookies)\s*\(/);
  });
}

test('#1585 locale root layout renders the initial HTML language from static params', () => {
  assert.ok(!existsSync(join(APP, 'layout.tsx')), 'route groups must own independent root documents');
  assert.match(localeLayoutSrc, /<RootDocument\s+lang=\{HTML_LANG\[locale\]\}/);
  assert.match(localeLayoutSrc, /setRequestLocale\(locale\)/);
  assert.match(rootDocumentSrc, /<html\s+lang=\{lang\}>/);
});

test('#1585 non-locale routes retain a static Traditional-Chinese root document', () => {
  assert.match(nonLocaleLayoutSrc, /<RootDocument\s+lang="zh-Hant"/);
});
