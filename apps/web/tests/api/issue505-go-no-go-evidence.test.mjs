/**
 * Contract tests for issue #505: Admin Go/No-Go evidence-driven defaults to HOLD.
 *
 * These are static (source-analysis) tests — they verify the route.ts implementation
 * contains the required logic without making HTTP calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routePath = path.resolve(
  __dirname,
  '../../app/api/admin/go-no-go/route.ts'
);

const source = readFileSync(routePath, 'utf-8');

describe('issue #505 — go-no-go evidence-driven HOLD', () => {
  it('ReadinessStatus type includes evidence_required', () => {
    assert.ok(
      source.includes("'evidence_required'"),
      'ReadinessStatus union must include evidence_required'
    );
  });

  it('ReadinessItem interface has optional issueRef field', () => {
    assert.ok(
      source.includes('issueRef?:'),
      'ReadinessItem must have optional issueRef field'
    );
  });

  it('route has evidence-real-payment item (issue #402)', () => {
    assert.ok(
      source.includes("id: 'evidence-real-payment'"),
      'readiness array must include evidence-real-payment item'
    );
    assert.ok(
      source.includes("issueRef: '#402'"),
      'evidence-real-payment must reference issue #402'
    );
  });

  it('route checks EVIDENCE_402_SIGNED env var', () => {
    assert.ok(
      source.includes('EVIDENCE_402_SIGNED'),
      'route must check EVIDENCE_402_SIGNED env var'
    );
  });

  it('route has evidence-manual-regression item (issue #500)', () => {
    assert.ok(
      source.includes("id: 'evidence-manual-regression'"),
      'readiness array must include evidence-manual-regression item'
    );
    assert.ok(
      source.includes("issueRef: '#500'"),
      'evidence-manual-regression must reference issue #500'
    );
  });

  it('route checks EVIDENCE_500_SIGNED env var', () => {
    assert.ok(
      source.includes('EVIDENCE_500_SIGNED'),
      'route must check EVIDENCE_500_SIGNED env var'
    );
  });

  it('route has evidence-traveler-browser item (issue #403)', () => {
    assert.ok(
      source.includes("id: 'evidence-traveler-browser'"),
      'readiness array must include evidence-traveler-browser item'
    );
    assert.ok(
      source.includes("issueRef: '#403'"),
      'evidence-traveler-browser must reference issue #403'
    );
  });

  it('route checks EVIDENCE_403_SIGNED env var', () => {
    assert.ok(
      source.includes('EVIDENCE_403_SIGNED'),
      'route must check EVIDENCE_403_SIGNED env var'
    );
  });

  it('route has evidence-guide-onboarding item (issue #318)', () => {
    assert.ok(
      source.includes("id: 'evidence-guide-onboarding'"),
      'readiness array must include evidence-guide-onboarding item'
    );
    assert.ok(
      source.includes("issueRef: '#318'"),
      'evidence-guide-onboarding must reference issue #318'
    );
  });

  it('route checks EVIDENCE_318_SIGNED env var', () => {
    assert.ok(
      source.includes('EVIDENCE_318_SIGNED'),
      'route must check EVIDENCE_318_SIGNED env var'
    );
  });

  it('route has evidence-cs-sop item (issue #319)', () => {
    assert.ok(
      source.includes("id: 'evidence-cs-sop'"),
      'readiness array must include evidence-cs-sop item'
    );
    assert.ok(
      source.includes("issueRef: '#319'"),
      'evidence-cs-sop must reference issue #319'
    );
  });

  it('route checks EVIDENCE_319_SIGNED env var', () => {
    assert.ok(
      source.includes('EVIDENCE_319_SIGNED'),
      'route must check EVIDENCE_319_SIGNED env var'
    );
  });

  it('all 5 evidence items are present', () => {
    const evidenceIds = [
      'evidence-real-payment',
      'evidence-manual-regression',
      'evidence-traveler-browser',
      'evidence-guide-onboarding',
      'evidence-cs-sop',
    ];
    for (const id of evidenceIds) {
      assert.ok(
        source.includes(`id: '${id}'`),
        `readiness array must include ${id}`
      );
    }
  });

  it('computeVerdict returns HOLD when evidence_required items exist', () => {
    assert.ok(
      source.includes("r.status === 'evidence_required'"),
      'computeVerdict must check for evidence_required status'
    );
    assert.ok(
      source.includes("'Required pre-launch evidence items are unsigned or incomplete'"),
      'computeVerdict must return specific HOLD reason for evidence_required'
    );
  });

  it('computeVerdict HOLD for evidence_required appears before final GO return', () => {
    const evidenceHoldIdx = source.indexOf("'Required pre-launch evidence items are unsigned or incomplete'");
    const goReturnIdx = source.indexOf("state: 'GO'");
    assert.ok(
      evidenceHoldIdx !== -1,
      'HOLD reason for evidence_required must exist in source'
    );
    assert.ok(
      goReturnIdx !== -1,
      "state: 'GO' must exist in source"
    );
    assert.ok(
      evidenceHoldIdx < goReturnIdx,
      'evidence_required HOLD check must appear before final GO return'
    );
  });
});
