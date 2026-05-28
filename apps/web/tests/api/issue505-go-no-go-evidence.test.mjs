/**
 * Contract tests for issue #505: Admin Go/No-Go evidence-driven defaults to HOLD.
 *
 * These are static (source-analysis) tests — they verify the route.ts implementation
 * contains the required logic without making HTTP calls.
 *
 * Membership of the readiness array was refreshed by issue #844 to align with the
 * current first-payment / soft-launch gates (#714 / #828 / #838 / #724 / #605 /
 * #318 / #319). The three originally-asserted closed-issue gates (#402 / #500 /
 * #403) were retired together with this update — see issue844-go-no-go-current-gates.test.mjs
 * for the regression guard that keeps them out.
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

const EVIDENCE_GATES = [
  { id: 'evidence-alert-drill',      issueRef: '#714', env: 'EVIDENCE_714_SIGNED' },
  { id: 'evidence-first-payment-qa', issueRef: '#828', env: 'EVIDENCE_828_SIGNED' },
  { id: 'evidence-booking-v2-qa',    issueRef: '#838', env: 'EVIDENCE_838_SIGNED' },
  { id: 'evidence-restore-drill',    issueRef: '#724', env: 'EVIDENCE_724_SIGNED' },
  { id: 'evidence-guide-content',    issueRef: '#605', env: 'EVIDENCE_605_SIGNED' },
  { id: 'evidence-guide-onboarding', issueRef: '#318', env: 'EVIDENCE_318_SIGNED' },
  { id: 'evidence-cs-sop',           issueRef: '#319', env: 'EVIDENCE_319_SIGNED' },
];

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

  for (const gate of EVIDENCE_GATES) {
    it(`route has ${gate.id} item (issue ${gate.issueRef})`, () => {
      assert.ok(
        source.includes(`id: '${gate.id}'`),
        `readiness array must include ${gate.id} item`
      );
      assert.ok(
        source.includes(`issueRef: '${gate.issueRef}'`),
        `${gate.id} must reference issue ${gate.issueRef}`
      );
    });

    it(`route checks ${gate.env} env var`, () => {
      assert.ok(
        source.includes(gate.env),
        `route must check ${gate.env} env var`
      );
    });
  }

  it(`all ${EVIDENCE_GATES.length} evidence items are present`, () => {
    for (const gate of EVIDENCE_GATES) {
      assert.ok(
        source.includes(`id: '${gate.id}'`),
        `readiness array must include ${gate.id}`
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
