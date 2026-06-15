/**
 * guide-contact-qa.mjs 純函式單測。
 *
 * 「認識導遊」頁的「詢問導遊」訊息重用 activity_qa，但不綁定行程：
 * activity_id 以 sentinel `guide:<guideId>` 形狀儲存，讓訊息流進導遊後台收件匣，
 * 並可被 UI 辨識為「導遊頁面」訊息。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDE_CONTACT_QA_PREFIX,
  buildGuideContactActivityId,
  isGuideContactActivityId,
  parseGuideContactGuideId,
} from '../../src/lib/guide-contact-qa.mjs';

test('buildGuideContactActivityId 組出 guide:<guideId>', () => {
  assert.equal(buildGuideContactActivityId('g-123'), 'guide:g-123');
  assert.equal(buildGuideContactActivityId('  g-123  '), 'guide:g-123');
});

test('buildGuideContactActivityId 拒絕空 guideId', () => {
  assert.throws(() => buildGuideContactActivityId(''), /guideId is required/);
  assert.throws(() => buildGuideContactActivityId('   '), /guideId is required/);
});

test('isGuideContactActivityId 正確辨識 sentinel 與行程 id', () => {
  assert.equal(isGuideContactActivityId('guide:g-123'), true);
  assert.equal(isGuideContactActivityId('act-001'), false);
  // 只有前綴沒有 id → 不算合法 sentinel
  assert.equal(isGuideContactActivityId(GUIDE_CONTACT_QA_PREFIX), false);
  assert.equal(isGuideContactActivityId(null), false);
  assert.equal(isGuideContactActivityId(undefined), false);
  assert.equal(isGuideContactActivityId(123), false);
});

test('parseGuideContactGuideId 還原 guideId；非 sentinel 回 null', () => {
  assert.equal(parseGuideContactGuideId('guide:g-123'), 'g-123');
  assert.equal(parseGuideContactGuideId('act-001'), null);
  assert.equal(parseGuideContactGuideId('guide:'), null);
});

test('round-trip：build → parse 還原同一 guideId', () => {
  const guideId = 'a1b2c3d4-0000-4000-8000-000000000001';
  const activityId = buildGuideContactActivityId(guideId);
  assert.equal(parseGuideContactGuideId(activityId), guideId);
});
