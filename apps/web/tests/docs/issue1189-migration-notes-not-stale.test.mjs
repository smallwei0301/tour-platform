import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this test file: tests/docs/ -> ../../.. -> repo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

// ── AC1: AUTO-MIGRATE-ANALYSIS.md must be archived ──────────────────────────
// Either the file is deleted, OR it contains an archive banner before rollback blocker content.
const ANALYSIS_PATH = join(REPO_ROOT, 'AUTO-MIGRATE-ANALYSIS.md');

describe('issue-1189 migration notes archive', () => {
  it('AC1: AUTO-MIGRATE-ANALYSIS.md is either absent or contains an archive banner', () => {
    if (!existsSync(ANALYSIS_PATH)) {
      // File deleted — AC satisfied
      return;
    }
    const content = readFileSync(ANALYSIS_PATH, 'utf-8');
    const hasBanner = /historical|已歸檔|do not use for current migration|This document is archived/i.test(content);
    assert.ok(
      hasBanner,
      'AUTO-MIGRATE-ANALYSIS.md exists but does not contain an archive banner ' +
        '(expected: "historical", "已歸檔", "do not use for current migration", or "This document is archived")'
    );
  });

  // ── AC2: No retained root script contains the hardcoded project ref ─────────
  // The files auto-migrate.sh and auto-migrate.js should either be deleted OR
  // have the ref replaced with a placeholder.
  it('AC2: auto-migrate.sh does not contain the hardcoded Supabase project ref', () => {
    const path = join(REPO_ROOT, 'auto-migrate.sh');
    if (!existsSync(path)) return; // deleted — AC satisfied
    const content = readFileSync(path, 'utf-8');
    assert.ok(
      !content.includes('pyoderxmpeyqjwkeliiu'),
      'auto-migrate.sh still contains hardcoded Supabase project ref "pyoderxmpeyqjwkeliiu"'
    );
  });

  it('AC2: auto-migrate.js does not contain the hardcoded Supabase project ref', () => {
    const path = join(REPO_ROOT, 'auto-migrate.js');
    if (!existsSync(path)) return; // deleted — AC satisfied
    const content = readFileSync(path, 'utf-8');
    assert.ok(
      !content.includes('pyoderxmpeyqjwkeliiu'),
      'auto-migrate.js still contains hardcoded Supabase project ref "pyoderxmpeyqjwkeliiu"'
    );
  });

  // ── AC3: CLAUDE.md points to real runbooks ───────────────────────────────────
  // The "Database migrations" section must reference docs/operations/booking-v2-rollback-runbook.md
  // and must NOT route readers solely through root scratch scripts as the canonical workflow.
  it('AC3: CLAUDE.md references docs/operations/booking-v2-rollback-runbook.md', () => {
    const path = join(REPO_ROOT, 'CLAUDE.md');
    const content = readFileSync(path, 'utf-8');
    assert.ok(
      content.includes('docs/operations/booking-v2-rollback-runbook.md'),
      'CLAUDE.md does not reference "docs/operations/booking-v2-rollback-runbook.md"'
    );
  });

  it('AC3: CLAUDE.md Database migrations section no longer cites root scratch scripts as the canonical migration workflow', () => {
    const path = join(REPO_ROOT, 'CLAUDE.md');
    const content = readFileSync(path, 'utf-8');
    // The old line routed readers to apply_migrations.sh / execute-migrations.* as canonical;
    // it should not appear verbatim any more.
    const stalePattern = /Migrations are applied via the scripts at the repo root \(`apply_migrations\.sh`, `execute-migrations\.\*`\)/;
    assert.ok(
      !stalePattern.test(content),
      'CLAUDE.md still contains the stale line routing readers to root scratch scripts as the canonical migration workflow'
    );
  });
});
