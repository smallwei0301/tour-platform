import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMidaoRequestPushText, notifyGuideNewMidaoRequest } from '../../src/lib/midao-request-notify.mjs';

test('推播文案：含編號/稱呼/服務/日期/人數，不含聯絡資訊', () => {
  const text = buildMidaoRequestPushText({
    requestNo: 'R20260815001', travelerName: '王小姐',
    activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', participantsCount: 4,
  });
  assert.match(text, /R20260815001/);
  assert.match(text, /王小姐/);
  assert.match(text, /柴山私人秘境導覽/);
  assert.match(text, /2026-08-15/);
  assert.match(text, /4/);
});

test('notify：無綁定時回 skipped，永不 throw', async () => {
  const r = await notifyGuideNewMidaoRequest({
    guideId: 'guide-without-binding', requestNo: 'R20260815001',
    travelerName: '王小姐', activityTitle: '柴山', preferredDate: '2026-08-15', participantsCount: 4,
  });
  assert.equal(r.status, 'skipped');
});
