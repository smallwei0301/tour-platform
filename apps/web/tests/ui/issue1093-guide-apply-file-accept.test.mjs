/**
 * GH-1093 — guide/apply file inputs must have accept attributes.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../../app/guide/apply/page.tsx'), 'utf8');

describe('GH-1093 — guide/apply file inputs have accept attributes', () => {
  test('ID document input has accept attribute for images and PDF', () => {
    assert.ok(
      source.includes('accept="image/*,application/pdf"'),
      'ID document file input must have accept="image/*,application/pdf"'
    );
  });
  test('Photo input has accept attribute for images only', () => {
    assert.ok(
      source.includes('accept="image/*"'),
      'Photo file input must have accept="image/*"'
    );
  });
});
