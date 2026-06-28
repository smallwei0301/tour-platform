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

  // #multilingual: 文案移到 bookingFlow.minParticipantsNote；頁面用 m.minParticipantsNote 引用。
  const zh = JSON.parse(await readFile(path.join(WEB_ROOT, 'messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.bookingFlow.minParticipantsNote, /此行程最少 \{min\} 人成團/);
  assert.match(src, /m\.minParticipantsNote\.replace\('\{min\}', String\(baseMinParticipants\)\)/);
  assert.match(src, /!allowOnePersonAddOn/);
});

test('v2 shell prefers API Chinese copy and evaluator reason for blocked state messaging', async () => {
  const src = await readBookingSource();

  assert.match(src, /setAvailabilityReason\(json\?\.data\?\.reason \|\| ''\)/);
  // #multilingual: getBookingV2RecoveryMessage 改收 localized messages 參數；generic fallback 改為 messages.genericError。
  assert.match(src, /function getBookingV2RecoveryMessage\(\s*response: V2AvailableSlotsResponse/);
  assert.match(src, /response\?\.data\?\.messageZh, response\?\.error\?\.messageZh/);
  assert.match(src, /return errorMessage \|\| messages\.genericError/);
  assert.match(src, /setAvailabilityReason\(selectedDateEntry\?\.reason \|\| json\.data\?\.reason \|\| ''\)/);
  assert.match(src, /!slotsLoading && slots\.length === 0 && availabilityReason/);
  // #multilingual: 「目前狀態：」prefix 移到 bookingFlow.currentStatusPrefix；頁面用 m.currentStatusPrefix 引用。
  const zh = JSON.parse(await readFile(path.join(WEB_ROOT, 'messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.bookingFlow.currentStatusPrefix, /目前狀態：/);
  assert.match(src, /\{m\.currentStatusPrefix\}\{availabilityReason\}/);
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

test('v2 shell uses date-level availability UI and a multi-slot picker (#1306 restored multi-time selection)', async () => {
  // Issue #1306 reverted the "remove multi-time dropdown" decision: the
  // V2 API returns N available slots per date and the traveler must be
  // able to pick from them. The single-line date summary stays for the
  // common single-slot case; an additional `role=radiogroup` picker is
  // rendered only when slots.length > 1. The legacy `<select>` dropdown
  // is still gone — the new picker uses buttons + aria-checked.
  const src = await readBookingSource();

  // Date-level summary still present.
  // #multilingual: 文案移到 bookingFlow（v2GenericError 含「可預約日期」、slotAvailable 含「可預約，剩餘」）；
  // 頁面用 m.<key> 引用，內容類斷言改讀繁中 catalog + 驗 m.<key> 引用。
  const zh = JSON.parse(await readFile(path.join(WEB_ROOT, 'messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.bookingFlow.v2GenericError, /可預約日期/);
  assert.match(zh.bookingFlow.slotAvailable, /（可預約，剩餘/);
  assert.match(src, /m\.slotAvailable\.replace\('\{date\}', selectedDate\)/);

  // Legacy native-select dropdown stays removed.
  assert.doesNotMatch(src, /<select className="tp-input" value=\{selectedSlotStartAt\}/);

  // New multi-slot picker (#1306) is present and gated by slots.length > 1.
  assert.match(src, /data-testid=["']traveler-slot-picker["']/);
  assert.match(src, /slots\.length\s*>\s*1\s*&&/);
});

test('v2 shell uses evaluator capacityLeft from selected slot in booking summary displays', async () => {
  const src = await readBookingSource();

  assert.match(src, /const selectedSlot = slots\.find\(\(slot\) => slot\.startAt === selectedSlotStartAt\) \|\| slots\[0\] \|\| null/);
  assert.match(src, /const selectedCapacityLeft = selectedSlot\?\.capacityLeft \?\? 0/);
  // #multilingual: slotAvailable / summaryCapacityPrefix 文案移到 catalog；頁面用 m.<key>.replace(...) 引用。
  const zh = JSON.parse(await readFile(path.join(WEB_ROOT, 'messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.bookingFlow.slotAvailable, /（可預約，剩餘 \{n\}）/);
  assert.match(zh.bookingFlow.summaryCapacityPrefix, /可預約名額：/);
  assert.match(src, /m\.slotAvailable\.replace\('\{date\}', selectedDate\)\.replace\('\{n\}', String\(selectedCapacityLeft\)\)/);
  assert.match(src, /\{m\.summaryCapacityPrefix\}\{selectedCapacityLeft\}/);
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
  // #multilingual: over-capacity 文案移到 bookingFlow.overCapacity；頁面用 m.overCapacity 引用。
  const zh = JSON.parse(await readFile(path.join(WEB_ROOT, 'messages/zh-Hant.json'), 'utf8'));
  assert.match(zh.bookingFlow.overCapacity, /參加人數已超過此日期剩餘名額，請降低人數或選擇其他日期。/);
  assert.match(src, /\{m\.overCapacity\}/);
  assert.match(src, /disabled=\{step1CtaState\.disabled\}/);
  assert.match(src, /const participants = effectiveMinParticipants/);

  const depsMatch = src.match(/fetchSlots\(\);\n\s*\}, \[(.*?)\]\);/s);
  assert.ok(depsMatch, 'fetchSlots useEffect dependencies should exist');
  assert.ok(!depsMatch[1].includes('guests'), 'fetchSlots effect dependencies must not include guests');
});
