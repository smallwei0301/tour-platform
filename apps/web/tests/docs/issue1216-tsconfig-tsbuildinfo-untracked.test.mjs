import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this test file: tests/docs/ -> ../../.. -> repo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const APP_WEB_DIR = join(REPO_ROOT, 'apps', 'web');

describe('issue-1216: tsconfig.tsbuildinfo should be gitignored and untracked', () => {
  it('AC1: apps/web/.gitignore contains tsconfig.tsbuildinfo pattern', () => {
    const gitignorePath = join(APP_WEB_DIR, '.gitignore');
    const content = readFileSync(gitignorePath, 'utf-8');
    const hasTsbuildinfo =
      content.includes('tsconfig.tsbuildinfo') ||
      content.includes('*.tsbuildinfo');
    assert.ok(
      hasTsbuildinfo,
      'apps/web/.gitignore is missing a tsconfig.tsbuildinfo (or *.tsbuildinfo) entry'
    );
  });

  it('AC2: apps/web/tsconfig.tsbuildinfo is NOT tracked by git', () => {
    let isTracked = false;
    try {
      execFileSync(
        'git',
        ['ls-files', '--error-unmatch', 'apps/web/tsconfig.tsbuildinfo'],
        { cwd: REPO_ROOT, stdio: 'pipe' }
      );
      isTracked = true;
    } catch {
      // expected: non-zero exit means file is NOT tracked
      isTracked = false;
    }
    assert.ok(
      !isTracked,
      'apps/web/tsconfig.tsbuildinfo is still tracked by git — run: git rm --cached apps/web/tsconfig.tsbuildinfo'
    );
  });
});
