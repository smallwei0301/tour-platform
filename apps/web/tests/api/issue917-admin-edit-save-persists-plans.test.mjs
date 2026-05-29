import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const editPageSrc = readFileSync(
  path.resolve(ROOT, 'app/admin/activities/[id]/edit/page.tsx'),
  'utf-8',
);

describe('GH-917 admin activity editor persists plans on save', () => {
  it('declares a plansTouched flag', () => {
    assert.match(editPageSrc, /const\s+\[plansTouched,\s*setPlansTouched\]\s*=\s*useState\(false\)/);
  });

  it('handleSave PUT body includes plans, guarded by plansTouched', () => {
    assert.match(editPageSrc, /\.\.\.\(plansTouched\s*\?\s*\{\s*plans\s*\}\s*:\s*\{\}\)/);
  });

  it('sets plansTouched=true when real plans are loaded from the activity', () => {
    // The load branch that sets real plans must also flip the flag.
    assert.match(
      editPageSrc,
      /setPlans\(d\.plans\);\s*\n\s*setPlansTouched\(true\)/,
    );
  });

  it('sets plansTouched=true when plans are imported from JSON', () => {
    // applyImportedActivity must flip the flag when the import carries plans.
    assert.match(
      editPageSrc,
      /if\s*\(Array\.isArray\(d\.plans\)\s*&&\s*d\.plans\.length\)\s*\{\s*\n\s*setPlans\(d\.plans\);\s*\n\s*setPlansTouched\(true\)/,
    );
  });

  it('does NOT flip plansTouched in the DEFAULT_PLANS fallback branches', () => {
    // Guard: DEFAULT_PLANS placeholder must never be treated as real (so it is not persisted).
    // There should be no `setPlansTouched(true)` immediately tied to a `setPlans(DEFAULT_PLANS)`.
    assert.doesNotMatch(
      editPageSrc,
      /setPlans\(DEFAULT_PLANS\);\s*\n\s*setPlansTouched\(true\)/,
    );
  });
});

describe('GH-917 save-body guard logic', () => {
  // Mirror of the guarded spread used in handleSave, to lock the rule independently of source text.
  function buildSaveBody({ plansTouched, plans }) {
    return {
      title: 'x',
      ...(plansTouched ? { plans } : {}),
    };
  }

  it('includes plans only when plansTouched is true', () => {
    const real = [{ id: 'half-day-morning', label: 'A', price: 1800 }];
    assert.deepEqual(buildSaveBody({ plansTouched: true, plans: real }).plans, real);
  });

  it('omits plans entirely when plansTouched is false (plan-less activity)', () => {
    const placeholder = [{ id: 'half-day', label: 'A. 半日行程', priceMultiplier: 1 }];
    const body = buildSaveBody({ plansTouched: false, plans: placeholder });
    assert.ok(!('plans' in body), 'plans must be absent so the placeholder is never persisted');
  });
});
