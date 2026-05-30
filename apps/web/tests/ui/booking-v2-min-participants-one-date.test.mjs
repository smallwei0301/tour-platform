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
  assert.match(src, /if \(nextSlots\.length === 0 && json\.data\?\.messageZh\)/);
  assert.match(src, /目前狀態：\{availabilityReason\}/);
});

test('v2 shell uses selected plan base price from available-slots selectedPlan metadata', async () => {
  const src = await readBookingSource();

  assert.match(src, /if \(selectedPlan && Number\.isFinite\(Number\(selectedPlan\.basePrice\)\)\)/);
  assert.match(src, /basePrice: Number\(selectedPlan\.basePrice\)/);
  assert.match(src, /const unitPrice = selectedPlanMeta\?\.basePrice \?\? activity\.priceTwd/);
  assert.match(src, /const total = selectedPlanMeta\?\.priceType === 'per_group' \? unitPrice : unitPrice \* guests/);
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
