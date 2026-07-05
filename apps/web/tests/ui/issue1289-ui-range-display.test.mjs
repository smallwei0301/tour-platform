/**
 * GH-1289 Slice B — UI range display parity + new-rule default + mismatch warning
 *
 * Source-contract tests for:
 * AC1: new-rule default interval = plan's durationMinutes when not manually edited
 * AC2: existing-rule mismatch warning when saved interval != plan duration
 * AC3: guide preview slot chips show full range via formatSlotRangeLabel
 * AC4: traveler booking V2 slot display shows same range labels
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
//（純結構搬移、零行為變更）——GuideActivityPlanOption 型別與時段預覽卡片
// 在 guide-sections；來源契約改讀「頁面＋其子元件」串接內容，斷言意圖不變。
const GUIDE_AVAILABILITY_SOURCES = [
  'app/guide/availability/page.tsx',
  'src/components/availability/guide-sections.tsx',
  'src/components/availability/rule-form-fields.tsx',
];

async function readGuideAvailabilitySource() {
  const parts = await Promise.all(GUIDE_AVAILABILITY_SOURCES.map(readSource));
  return parts.join('\n');
}

// ── AC1: GuideActivityPlanOption carries durationMinutes ──────────────────────

test('GH-1289 AC1: GuideActivityPlanOption type includes durationMinutes field', async () => {
  const src = await readGuideAvailabilitySource();
  // Type must carry durationMinutes
  assert.match(
    src,
    /durationMinutes[?]?\s*:\s*number/,
    'GuideActivityPlanOption must have durationMinutes: number field'
  );
});

test('GH-1289 AC1: plan select onChange also sets slot_interval_minutes when interval not manually edited', async () => {
  const src = await readGuideAvailabilitySource();
  // Plan onChange must do more than just set activity_plan_id — also sets slot_interval_minutes
  assert.match(
    src,
    /slot_interval_minutes.*durationMinutes|durationMinutes.*slot_interval_minutes/,
    'plan onChange must default slot_interval_minutes to plan durationMinutes'
  );
});

test('GH-1289 AC1: new-rule default interval only applies when interval not manually edited', async () => {
  const src = await readGuideAvailabilitySource();
  // Must track manual edit state (e.g. intervalManuallyEdited or intervalTouched state)
  assert.match(
    src,
    /intervalManuallyEdited|intervalTouched|manualInterval/,
    'must track whether guide manually edited interval to avoid overwriting'
  );
});

// ── AC2: Existing-rule mismatch warning ──────────────────────────────────────

test('GH-1289 AC2: existing-rule edit shows mismatch warning when saved interval != plan duration', async () => {
  const src = await readGuideAvailabilitySource();
  // Must compare slot_interval_minutes vs durationMinutes and show warning
  assert.match(
    src,
    /mismatch|不一致|間隔.*與.*方案|方案.*時長.*不同|與方案時長不符|duration.*mismatch|interval.*mismatch/i,
    'must show mismatch warning when saved interval != plan durationMinutes'
  );
});

test('GH-1289 AC2: mismatch warning only shown when editing existing rule (not new rule)', async () => {
  const src = await readGuideAvailabilitySource();
  // Warning condition must gate on editingRule being set (existing rule)
  assert.match(
    src,
    /editingRule.*mismatch|mismatch.*editingRule|editingRule.*interval.*duration|editingRule.*durationMinutes/,
    'mismatch warning must only show when editingRule is set (existing rule, not new)'
  );
});

// ── AC3: Guide preview range display ─────────────────────────────────────────

test('GH-1289 AC3: guide availability page imports formatSlotRangeLabel', async () => {
  const src = await readGuideAvailabilitySource();
  assert.match(
    src,
    /formatSlotRangeLabel/,
    'guide availability page must import/use formatSlotRangeLabel for range display'
  );
});

test('GH-1289 AC3: guide preview slot chips use formatSlotRangeLabel instead of start-only toLocaleTimeString', async () => {
  const src = await readGuideAvailabilitySource();
  // Must call formatSlotRangeLabel with slot startAt + endAt
  assert.match(
    src,
    /formatSlotRangeLabel\s*\(\s*slot\.startAt\s*,\s*slot\.endAt/,
    'guide preview chips must call formatSlotRangeLabel(slot.startAt, slot.endAt)'
  );
  // Should NOT use toLocaleTimeString for slot chips (only start-time display)
  // We check that the old start-only pattern no longer drives the chip label:
  assert.doesNotMatch(
    src,
    /new Date\(slot\.startAt\)\.toLocaleTimeString/,
    'guide preview chips must NOT use toLocaleTimeString(start-only) for slot label'
  );
});

test('GH-1289 AC3: guide preview shows buffer note when buffer_before_minutes or buffer_after_minutes > 0', async () => {
  const src = await readGuideAvailabilitySource();
  // Must show buffer metadata text (e.g. 前後N分鐘緩衝 or tooltip)
  assert.match(
    src,
    /buffer_before_minutes|buffer_after_minutes|緩衝|buffer/,
    'guide preview must surface buffer info when configured'
  );
});

// ── AC4: Traveler booking V2 slot display range parity ───────────────────────

test('GH-1289 AC4: booking V2 page imports formatSlotRangeLabel from slot-generator', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  assert.match(
    src,
    /formatSlotRangeLabel/,
    'booking V2 page must import formatSlotRangeLabel for range display parity'
  );
});

test('GH-1289 AC4: booking V2 page uses formatSlotRangeLabel to show selected slot range', async () => {
  const src = await readSource('app/booking/[activityId]/page.tsx');
  assert.match(
    src,
    /formatSlotRangeLabel\s*\(\s*selectedSlot(?:StartAt)?|formatSlotRangeLabel.*slot\.startAt|formatSlotRangeLabel.*startAt/,
    'booking V2 must call formatSlotRangeLabel with selected slot startAt for range display'
  );
});

// ── AC7: Timezone safety ──────────────────────────────────────────────────────

test('GH-1289 AC7: formatSlotRangeLabel calls in guide page pass timezone parameter', async () => {
  const src = await readGuideAvailabilitySource();
  // formatSlotRangeLabel(startAt, endAt, timezone) — timezone must be passed
  assert.match(
    src,
    /formatSlotRangeLabel\s*\([^)]*Asia\/Taipei[^)]*\)|formatSlotRangeLabel\s*\([^)]*timezone[^)]*\)/,
    'formatSlotRangeLabel calls must pass timezone to avoid TZ regressions'
  );
});
