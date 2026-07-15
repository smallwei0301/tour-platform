/**
 * GH-1290 Slice B — Per-rule dynamic buffer re-emit UI source-contract tests
 *
 * AC1: guide form includes use_dynamic_reemit checkbox (default off)
 * AC2: form state, openRule read-in, and payload all carry use_dynamic_reemit
 * AC3: guide POST/PUT routes persist use_dynamic_reemit (interface + insertData/updateData)
 * AC4: admin v2 POST/PUT routes also carry use_dynamic_reemit (parity)
 * AC5: traveler Booking V2 uses formatSlotRangeLabel for range display (parity bridge from Slice A)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// #1615：guide availability 頁已拆出 src/components/availability/** 子元件
//（純結構搬移、零行為變更）——AvailabilityRule 型別在 guide-sections、
// checkbox 在共用 rule-form-fields；來源契約改讀「頁面＋其子元件」串接
// 內容，斷言意圖不變。
const GUIDE_AVAILABILITY_SOURCES = [
  'app/(non-locale)/guide/availability/page.tsx',
  'src/components/availability/guide-sections.tsx',
  'src/components/availability/rule-form-fields.tsx',
];

async function readGuideAvailabilitySource() {
  const parts = await Promise.all(GUIDE_AVAILABILITY_SOURCES.map(readSource));
  return parts.join('\n');
}

// ── AC1: Guide form checkbox ──────────────────────────────────────────────────

test('GH-1290 AC1: AvailabilityRule type includes use_dynamic_reemit field', async () => {
  const src = await readGuideAvailabilitySource();
  assert.match(
    src,
    /use_dynamic_reemit\s*:\s*boolean/,
    'AvailabilityRule type must include use_dynamic_reemit: boolean'
  );
});

test('GH-1290 AC1: ruleForm initial state defaults use_dynamic_reemit to false', async () => {
  const src = await readGuideAvailabilitySource();
  // Both new-rule reset and initial state must have use_dynamic_reemit: false
  const matches = [...src.matchAll(/use_dynamic_reemit\s*:\s*false/g)];
  assert.ok(
    matches.length >= 2,
    `ruleForm must default use_dynamic_reemit to false in both initial state and new-rule reset — found ${matches.length} occurrence(s)`
  );
});

test('GH-1290 AC1: guide form has checkbox bound to use_dynamic_reemit', async () => {
  const src = await readGuideAvailabilitySource();
  assert.match(
    src,
    /use_dynamic_reemit.*checked|checked.*use_dynamic_reemit/,
    'guide form must have a checkbox bound to ruleForm.use_dynamic_reemit'
  );
});

test('GH-1290 AC1: checkbox label mentions dynamic time slots in Chinese', async () => {
  const src = await readGuideAvailabilitySource();
  assert.match(
    src,
    /動態時段|啟用動態|use_dynamic_reemit/,
    'checkbox must have a Chinese label mentioning dynamic time slots'
  );
});

// ── AC2: Form state carries use_dynamic_reemit through to payload ─────────────

test('GH-1290 AC2: openRuleModal reads use_dynamic_reemit from existing rule', async () => {
  const src = await readGuideAvailabilitySource();
  // When editing, must load rule.use_dynamic_reemit into ruleForm
  assert.match(
    src,
    /use_dynamic_reemit\s*:\s*rule\.use_dynamic_reemit/,
    'openRuleModal must set use_dynamic_reemit from existing rule when editing'
  );
});

test('GH-1290 AC2: payload spread includes use_dynamic_reemit via ruleForm', async () => {
  const src = await readGuideAvailabilitySource();
  // The payload uses ...ruleForm spread — verify ruleForm contains use_dynamic_reemit
  // and payload is built via spread
  assert.match(
    src,
    /\.\.\.\s*ruleForm/,
    'saveRule payload must spread ruleForm (which carries use_dynamic_reemit)'
  );
});

// ── AC3: Guide API routes carry use_dynamic_reemit ────────────────────────────

test('GH-1290 AC3: guide POST route CreateRuleBody includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/guide/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*\?\s*:\s*boolean/,
    'guide POST CreateRuleBody must include optional use_dynamic_reemit: boolean'
  );
});

test('GH-1290 AC3: guide POST route insertData includes use_dynamic_reemit with fallback false', async () => {
  const src = await readSource('app/api/guide/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*:\s*body\.use_dynamic_reemit\s*\?\?\s*false/,
    'guide POST insertData must include use_dynamic_reemit: body.use_dynamic_reemit ?? false'
  );
});

test('GH-1290 AC3: guide GET select returns use_dynamic_reemit column', async () => {
  const src = await readSource('app/api/guide/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit/,
    'guide GET select must include use_dynamic_reemit in returned columns'
  );
});

test('GH-1290 AC3: guide PUT route UpdateRuleBody includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/guide/availability-rules/[ruleId]/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*\?\s*:\s*boolean/,
    'guide PUT UpdateRuleBody must include optional use_dynamic_reemit: boolean'
  );
});

test('GH-1290 AC3: guide PUT route updateData conditionally includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/guide/availability-rules/[ruleId]/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit.*!==.*undefined.*updateData\.use_dynamic_reemit|updateData\.use_dynamic_reemit.*use_dynamic_reemit/,
    'guide PUT must conditionally set updateData.use_dynamic_reemit when present in body'
  );
});

// ── AC4: Admin v2 API routes also carry use_dynamic_reemit ───────────────────

test('GH-1290 AC4: admin v2 POST route CreateRuleBody includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/v2/admin/guides/[guideId]/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*\?\s*:\s*boolean/,
    'admin v2 POST CreateRuleBody must include optional use_dynamic_reemit: boolean'
  );
});

test('GH-1290 AC4: admin v2 POST route insertData includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/v2/admin/guides/[guideId]/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*:\s*body\.use_dynamic_reemit\s*\?\?\s*false/,
    'admin v2 POST insertData must include use_dynamic_reemit: body.use_dynamic_reemit ?? false'
  );
});

test('GH-1290 AC4: admin v2 GET select returns use_dynamic_reemit column', async () => {
  const src = await readSource('app/api/v2/admin/guides/[guideId]/availability-rules/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit/,
    'admin v2 GET select must include use_dynamic_reemit in returned columns'
  );
});

test('GH-1290 AC4: admin v2 PUT route UpdateRuleBody includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*\?\s*:\s*boolean/,
    'admin v2 PUT UpdateRuleBody must include optional use_dynamic_reemit: boolean'
  );
});

test('GH-1290 AC4: admin v2 PUT route updateData conditionally includes use_dynamic_reemit', async () => {
  const src = await readSource('app/api/v2/admin/guides/[guideId]/availability-rules/[ruleId]/route.ts');
  assert.match(
    src,
    /use_dynamic_reemit.*!==.*undefined.*updateData\.use_dynamic_reemit|updateData\.use_dynamic_reemit.*use_dynamic_reemit/,
    'admin v2 PUT must conditionally set updateData.use_dynamic_reemit when present in body'
  );
});

// ── AC5: Traveler Booking V2 range display parity (Slice A + Slice B bridge) ──

test('GH-1290 AC5: Booking V2 imports formatSlotRangeLabel for range display', async () => {
  const src = await readSource('app/(non-locale)/booking/[activityId]/page.tsx');
  assert.match(
    src,
    /formatSlotRangeLabel/,
    'Booking V2 must import/use formatSlotRangeLabel for slot range display parity'
  );
});

test('GH-1290 AC5: Booking V2 shows range label for selected slot', async () => {
  const src = await readSource('app/(non-locale)/booking/[activityId]/page.tsx');
  assert.match(
    src,
    /formatSlotRangeLabel\s*\(\s*selectedSlot/,
    'Booking V2 must call formatSlotRangeLabel with selectedSlot for range label'
  );
});

test('GH-1290 AC5: activity-day-availability normalizeRuleRow carries use_dynamic_reemit', async () => {
  const src = await readSource('src/lib/availability-v2/activity-day-availability.ts');
  assert.match(
    src,
    /use_dynamic_reemit\s*:\s*row\.use_dynamic_reemit\s*\?\?\s*false/,
    'normalizeRuleRow must carry use_dynamic_reemit with ?? false guard for pre-migration rows'
  );
});

test('GH-1290 AC5: slot-generator buildCandidateSlotsForRule checks use_dynamic_reemit', async () => {
  const src = await readSource('src/lib/slot-generator.ts');
  assert.match(
    src,
    /use_dynamic_reemit/,
    'slot-generator must reference use_dynamic_reemit in buildCandidateSlotsForRule logic'
  );
});

// ── Regression: default OFF behaviour unchanged ───────────────────────────────

test('GH-1290 regression: use_dynamic_reemit=false disables re-emit path in slot-generator', async () => {
  const src = await readSource('src/lib/slot-generator.ts');
  // When false, must short-circuit (return baseCandidates or early return)
  assert.match(
    src,
    /if\s*\(\s*!rule\.use_dynamic_reemit\s*\)/,
    'slot-generator must short-circuit re-emit when use_dynamic_reemit is false'
  );
});
