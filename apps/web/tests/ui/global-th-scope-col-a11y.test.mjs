/**
 * Global regression guard: every raw <th> in any .tsx file must have scope="col".
 *
 * Covers the entire apps/web/app/ and apps/web/src/components/ trees.
 * The per-file test in issue1060-guide-dashboard-th-scope-a11y.test.mjs covers
 * guide/dashboard specifically; this test catches new tables anywhere.
 *
 * Skips:
 * - <thead> tags (different element)
 * - Component usages like <Th> or <ThemeProvider> (PascalCase = React component)
 * - Comment lines starting with //
 * - Test files (.test.)
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function walkTsx(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsx(full, files);
    } else if (extname(entry) === '.tsx' && !entry.includes('.test.')) {
      files.push(full);
    }
  }
  return files;
}

const dirs = [join(ROOT, 'app'), join(ROOT, 'src/components')];
const allTsx = dirs.flatMap(d => walkTsx(d));

// Regex: matches raw lowercase <th opening tags (not <thead, not <Th, not <ThemeProvider)
const RAW_TH_RE = /<th(?=[\s>])/g;

describe('Global: all raw <th> elements must have scope="col"', () => {
  test('no raw <th> is missing scope="col" across all .tsx files', () => {
    const offending = [];

    for (const file of allTsx) {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith('//')) return;
        const tagRe = /<th(?=[\s>])/g;
        let m;
        while ((m = tagRe.exec(line)) !== null) {
          // Extract the full opening tag
          const tagStart = m.index;
          const tagEnd = line.indexOf('>', tagStart);
          const tag = tagEnd >= 0 ? line.slice(tagStart, tagEnd + 1) : line.slice(tagStart, tagStart + 60);
          if (!tag.includes('scope="col"')) {
            const rel = file.replace(ROOT + '/', '');
            offending.push(`${rel}:${i + 1}: ${tag.trim()}`);
          }
        }
      });
    }

    assert.deepEqual(
      offending,
      [],
      `Raw <th> elements missing scope="col":\n${offending.join('\n')}`
    );
  });
});
