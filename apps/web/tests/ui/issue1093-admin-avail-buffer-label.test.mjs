/**
 * GH-1093 — admin guide availability buffer-time label/id must be properly associated.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '../../app/admin/guides/[guideId]/availability/page.tsx'),
  'utf8'
);

describe('GH-1093 — admin guide availability buffer-time label association', () => {
  test('buffer-time label has htmlFor="avail-buffer-time"', () => {
    assert.ok(
      source.includes('htmlFor="avail-buffer-time"'),
      'Buffer-time label must have htmlFor="avail-buffer-time"'
    );
  });
  test('buffer-time input has id="avail-buffer-time"', () => {
    assert.ok(
      source.includes('id="avail-buffer-time"'),
      'Buffer-time input must have id="avail-buffer-time"'
    );
  });
});
