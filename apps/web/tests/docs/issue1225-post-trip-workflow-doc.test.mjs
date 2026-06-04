import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this test file: tests/docs/ -> ../../.. -> repo root
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const DOC_PATH = join(
  REPO_ROOT,
  'docs',
  '05-business',
  '07-operations-plan',
  '10-post-trip-workflow.md'
);

const doc = readFileSync(DOC_PATH, 'utf-8');

describe('issue-1225: post-trip-workflow.md aligned with PR #1222 reality', () => {
  it('AC1: doc no longer contains stale "尚未存在" phrase about guide_trip_reports', () => {
    assert.ok(
      !doc.includes('尚未存在'),
      'doc still says guide_trip_reports table "尚未存在" — stale after PR #1222'
    );
  });

  it('AC1: doc no longer contains stale "永遠為 null" phrase about submittedAt', () => {
    assert.ok(
      !doc.includes('永遠為 null'),
      'doc still says submittedAt "永遠為 null" — stale after PR #1222 wired real submitted_at'
    );
  });

  it('AC1: doc no longer contains stale "submittedAt: null" literal', () => {
    assert.ok(
      !doc.includes('submittedAt: null'),
      'doc still contains "submittedAt: null" — stale after PR #1222'
    );
  });

  it('AC2: doc contains the new trip-report POST endpoint', () => {
    assert.ok(
      doc.includes('/api/v2/guide/orders/[orderId]/trip-report') ||
        doc.includes('/api/v2/guide/orders/{orderId}/trip-report'),
      'doc is missing the POST /api/v2/guide/orders/[orderId]/trip-report endpoint added in PR #1222'
    );
  });
});
