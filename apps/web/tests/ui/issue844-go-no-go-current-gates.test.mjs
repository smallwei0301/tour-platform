import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../../app/api/admin/go-no-go/route.ts', import.meta.url);
const pagePath = new URL('../../app/admin/go-no-go/page.tsx', import.meta.url);

const STALE_ITEM_IDS = [
  'evidence-real-payment',       // #402 closed
  'evidence-manual-regression',  // #500 closed
  'evidence-traveler-browser',   // #403 closed
];

const CURRENT_ITEM_IDS = [
  'evidence-alert-drill',        // #714
  'evidence-first-payment-qa',   // #828
  'evidence-booking-v2-qa',      // #838 (refs #824 / #839)
  'evidence-restore-drill',      // #724
  'evidence-guide-content',      // #605
  'evidence-guide-onboarding',   // #318 (kept)
  'evidence-cs-sop',             // #319 (kept)
];

const NEW_GATE_ENV_VARS = [
  'EVIDENCE_714_SIGNED',
  'EVIDENCE_828_SIGNED',
  'EVIDENCE_838_SIGNED',
  'EVIDENCE_724_SIGNED',
  'EVIDENCE_605_SIGNED',
];

test('issue #844: stale closed-issue gates removed from route', async () => {
  const src = await readFile(routePath, 'utf8');
  for (const id of STALE_ITEM_IDS) {
    assert.ok(
      !src.includes(id),
      `route.ts still references stale gate id "${id}" (issue #844)`,
    );
  }
});

test('issue #844: route exposes current first-payment gates', async () => {
  const src = await readFile(routePath, 'utf8');
  for (const id of CURRENT_ITEM_IDS) {
    assert.match(
      src,
      new RegExp(`id:\\s*['"]${id}['"]`),
      `route.ts missing current gate id "${id}"`,
    );
  }
});

test('issue #844: page has zh-TW copy for every current gate', async () => {
  const src = await readFile(pagePath, 'utf8');
  for (const id of CURRENT_ITEM_IDS) {
    assert.match(
      src,
      new RegExp(`['"]${id}['"]\\s*:`),
      `page.tsx READINESS_TEXT missing copy for "${id}"`,
    );
  }
  for (const id of STALE_ITEM_IDS) {
    assert.ok(
      !src.includes(id),
      `page.tsx still translates stale gate id "${id}"`,
    );
  }
});

test('issue #844: each current gate defaults to evidence_required (HOLD)', async () => {
  const src = await readFile(routePath, 'utf8');
  for (const env of NEW_GATE_ENV_VARS) {
    assert.match(
      src,
      new RegExp(`process\\.env\\.${env}[\\s\\S]{0,80}evidence_required`),
      `route.ts gate ${env} must fall back to evidence_required when unset (issue #844 conservative-default)`,
    );
  }
});
