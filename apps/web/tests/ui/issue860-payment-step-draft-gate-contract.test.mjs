import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const BOOKING_PAGE_PATH = path.join(ROOT, 'app/booking/[activityId]/page.tsx');

test('GH-860 contract: step2 creates draft before payment step and carries scheduleId source-of-truth', async () => {
  const src = await readFile(BOOKING_PAGE_PATH, 'utf8');

  assert.match(src, /async function handleCreateDraftBookingAndGoPayment\(\)/, 'step2 should create draft booking before entering payment step');
  assert.match(src, /onClick=\{handleCreateDraftBookingAndGoPayment\}/, 'step2 primary CTA should run draft creation instead of direct setStep(3)');
  // 排程預約（scheduled）起，scheduleId 以「選取的場次」為 source-of-truth，
  // 再退回 URL 帶入的 activeScheduleId。
  assert.match(src, /const draftScheduleId\s*=\s*selectedSlot\?\.scheduleId\s*\|\|\s*activeScheduleId\s*\|\|\s*undefined/, 'draft scheduleId should derive from the selected slot, falling back to activeScheduleId');
  assert.match(src, /scheduleId:\s*draftScheduleId/, 'draft payload should carry the resolved draftScheduleId');
  assert.doesNotMatch(src, /activeScheduleId:\s*activeScheduleId\s*\|\|\s*undefined/, 'draft payload must not use activeScheduleId as the only schedule key');
  assert.match(src, /const canConfirmPayment\s*=\s*Boolean\(createdBookingId\s*&&\s*canSubmit\)/, 'payment confirmation must require created booking/order id');
  // #1475 起 disabled 條件後面再串接匯款未設定的防呆；contract 仍要求含 loading || !canConfirmPayment。
  assert.match(src, /disabled=\{loading\s*\|\|\s*!canConfirmPayment\b/, 'final payment button must stay disabled when order id is missing');
  assert.doesNotMatch(src, /onClick=\{\(\)\s*=>\s*setStep\(3\)\}/, 'legacy direct jump to payment step should be removed');
});

test('GH-860 contract: V2 error fallback prefers messageZh and keeps Traditional Chinese fallback', async () => {
  const src = await readFile(BOOKING_PAGE_PATH, 'utf8');

  assert.match(
    src,
    /draftJson\?\.error\?\.messageZh\s*\|\|\s*draftJson\?\.error\?\.message\s*\|\|\s*'此場次目前無法預約，請重新整理或選擇其他日期。'/,
    'draft error fallback should prefer messageZh and keep zh-TW actionable fallback'
  );

  assert.match(
    src,
    /checkoutJson\?\.error\?\.messageZh\s*\|\|\s*checkoutJson\?\.error\?\.message\s*\|\|\s*'此場次目前無法預約，請重新整理或選擇其他日期。'/,
    'checkout error fallback should prefer messageZh and keep zh-TW actionable fallback'
  );
});
