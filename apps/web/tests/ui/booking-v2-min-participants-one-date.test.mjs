import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readBookingSource() {
  return readFile(path.join(WEB_ROOT, 'app/booking/[activityId]/page.tsx'), 'utf8');
}

test('v2 shell clamps participants to effective minimum and never posts below-min draft', async () => {
  const src = await readBookingSource();

  assert.match(src, /const effectiveMinParticipants = allowOnePersonAddOn \? 1 : baseMinParticipants/);
  assert.match(src, /min=\{effectiveMinParticipants\}/);
  // Semantic check: the people-count handler must clamp the typed value up to
  // effectiveMinParticipants. (Pre-PR #902 this lived in a single-line
  // expression; PR #902 split it across lines to also clamp against
  // baseMaxParticipants for the new stepper. Either shape is fine.)
  assert.match(src, /Math\.max\(effectiveMinParticipants,/);
  assert.match(src, /Number\(e\.target\.value\)\s*\|\|\s*effectiveMinParticipants/);
  assert.match(src, /participants: Math\.max\(guests, effectiveMinParticipants\)/);
});

test('v2 shell shows Traditional Chinese min-participants hint for unformed group', async () => {
  const src = await readBookingSource();

  assert.match(src, /此行程最少 \{baseMinParticipants\} 人成團/);
  assert.match(src, /!allowOnePersonAddOn/);
});

test('v2 shell prefers API Chinese copy and evaluator reason for blocked state messaging', async () => {
  const src = await readBookingSource();

  assert.match(src, /setAvailabilityReason\(json\?\.data\?\.reason \|\| ''\)/);
  assert.match(src, /json\?\.data\?\.messageZh \|\| json\?\.error\?\.messageZh \|\| json\?\.error\?\.message/);
  assert.match(src, /setAvailabilityReason\(selectedDateEntry\?\.reason \|\| json\.data\?\.reason \|\| ''\)/);
  assert.match(src, /!slotsLoading && slots\.length === 0 && availabilityReason/);
  assert.match(src, /目前狀態：\{availabilityReason\}/);
});

test('v2 shell uses selected plan base price from available-slots selectedPlan metadata', async () => {
  const src = await readBookingSource();

  assert.match(src, /if \(selectedPlan && Number\.isFinite\(Number\(selectedPlan\.basePrice\)\)\)/);
  assert.match(src, /basePrice: Number\(selectedPlan\.basePrice\)/);
  // Issue #1108: unitPrice falls back through effectivePlanMeta first to avoid
  // a ~1.5s transient where activity.priceTwd is shown before selectedPlanMeta loads.
  assert.match(src, /const unitPrice = effectivePlanMeta\?\.basePrice \?\? activity\.priceTwd/);
  assert.match(src, /const total = effectivePlanMeta\?\.priceType === 'per_group' \? unitPrice : unitPrice \* guests/);
});

test('v2 shell uses date-level availability UI and removes multi-time dropdown', async () => {
  const src = await readBookingSource();

  assert.match(src, /可預約日期/);
  assert.match(src, /selectedDate}（可預約，剩餘/);
  assert.doesNotMatch(src, /可預約時段/);
  assert.doesNotMatch(src, /<select className="tp-input" value=\{selectedSlotStartAt\}/);
});

test('v2 shell uses evaluator capacityLeft from selected slot in booking summary displays', async () => {
  const src = await readBookingSource();

  assert.match(src, /const selectedSlot = slots\.find\(\(slot\) => slot\.startAt === selectedSlotStartAt\) \|\| slots\[0\] \|\| null/);
  assert.match(src, /const selectedCapacityLeft = selectedSlot\?\.capacityLeft \?\? 0/);
  assert.match(src, /selectedDate}（可預約，剩餘 \$\{selectedCapacityLeft\}）/);
  assert.match(src, /可預約名額：\{selectedCapacityLeft\}/);
});

test('v2 shell keeps scheduleId as URL-date hint only and never re-derives schedule from local activity.schedules', async () => {
  const src = await readBookingSource();

  assert.match(src, /const urlDate = searchParams\.get\('date'\) \|\| ''/);
  assert.match(src, /const activeUrlScheduleId = urlScheduleId && \(!urlDate \|\| urlDate === selectedDate\) \? urlScheduleId : ''/);
  assert.match(src, /const activeScheduleId = activeUrlScheduleId;/);
  assert.match(src, /const scheduleParam = activeScheduleId \? `&scheduleId=\$\{encodeURIComponent\(activeScheduleId\)\}` : ''/);
  assert.doesNotMatch(src, /const matchedScheduleIdForSelectedDate = useMemo\(\(\) => \{/);
});

test('v2 shell keeps selected date visible when participants exceed capacity and does not refetch slots on guests change', async () => {
  const src = await readBookingSource();

  assert.match(src, /getBookingV2Step1CtaState\(/);
  assert.match(src, /參加人數已超過此日期剩餘名額，請降低人數或選擇其他日期。/);
  assert.match(src, /disabled=\{step1CtaState\.disabled\}/);
  assert.match(src, /const participants = effectiveMinParticipants/);

  const depsMatch = src.match(/fetchSlots\(\);\n\s*\}, \[(.*?)\]\);/s);
  assert.ok(depsMatch, 'fetchSlots useEffect dependencies should exist');
  assert.ok(!depsMatch[1].includes('guests'), 'fetchSlots effect dependencies must not include guests');
});
