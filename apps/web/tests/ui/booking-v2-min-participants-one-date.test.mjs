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
  assert.match(src, /setGuests\(Math\.max\(effectiveMinParticipants, Number\(e\.target\.value\) \|\| effectiveMinParticipants\)\)/);
  assert.match(src, /participants: Math\.max\(guests, effectiveMinParticipants\)/);
});

test('v2 shell shows Traditional Chinese min-participants hint for unformed group', async () => {
  const src = await readBookingSource();

  assert.match(src, /此行程最少 \{baseMinParticipants\} 人成團/);
  assert.match(src, /!allowOnePersonAddOn/);
});

test('v2 shell prefers API Chinese copy for below-min or slot rule errors', async () => {
  const src = await readBookingSource();

  assert.match(src, /json\?\.data\?\.messageZh \|\| json\?\.error\?\.message/);
  assert.match(src, /if \(nextSlots\.length === 0 && json\.data\?\.messageZh\)/);
});

test('v2 shell uses date-level availability UI and removes multi-time dropdown', async () => {
  const src = await readBookingSource();

  assert.match(src, /可預約日期/);
  assert.match(src, /selectedDate}（可預約，剩餘/);
  assert.doesNotMatch(src, /可預約時段/);
  assert.doesNotMatch(src, /<select className="tp-input" value=\{selectedSlotStartAt\}/);
});

test('v2 shell deduplicates same-date slots and keeps canonical earliest startAt', async () => {
  const src = await readBookingSource();

  assert.match(src, /const nextSlotsByDate = new Map<string, V2Slot>\(\)/);
  assert.match(src, /new Date\(slot\.startAt\)\.toLocaleDateString\('sv-SE', \{ timeZone: timezone \}\)/);
  assert.match(src, /new Date\(slot\.startAt\)\.getTime\(\) < new Date\(existing\.startAt\)\.getTime\(\)/);
  assert.match(src, /setSelectedSlotStartAt\(nextSlots\[0\]\?\.startAt \|\| ''\)/);
});

test('v2 shell keeps initial URL scheduleId guard and resolves matching scheduleId after date change', async () => {
  const src = await readBookingSource();

  assert.match(src, /const urlDate = searchParams\.get\('date'\) \|\| ''/);
  assert.match(src, /const activeUrlScheduleId = urlScheduleId && \(!urlDate \|\| urlDate === selectedDate\) \? urlScheduleId : ''/);
  assert.match(src, /const matchedScheduleIdForSelectedDate = useMemo\(\(\) => \{/);
  assert.match(src, /const sameDateSchedules = activity\.schedules\.filter\(\(schedule\) => \{/);
  assert.match(src, /const exactPlanMatch = candidateSchedules\.find\(\(schedule\) => schedule\.planId === v2PlanKey\)/);
  assert.match(src, /const allPlanFallback = candidateSchedules\.find\(\(schedule\) => !schedule\.planId\)/);
  assert.match(src, /const activeScheduleId = activeUrlScheduleId \|\| matchedScheduleIdForSelectedDate/);
  assert.match(src, /const scheduleParam = activeScheduleId \? `&scheduleId=\$\{encodeURIComponent\(activeScheduleId\)\}` : ''/);
});
