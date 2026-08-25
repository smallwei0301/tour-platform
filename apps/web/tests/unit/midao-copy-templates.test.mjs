import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestSummaryText, buildLineReplyText, periodLabel } from '../../src/lib/midao/midao-copy-templates.mjs';

const REQ = {
  id: '11111111-1111-4111-8111-111111111111', requestRef: 'inquiry_22222222-2222-4222-8222-222222222222', token: 'secret-request-token',
  requestNo: 'R20260815001', travelerName: '王小姐', travelerLineId: 'wang123', travelerEmail: 'a@b.c', travelerPhone: '+886-912-345-678', internalNote: '僅供內部確認',
  activityTitle: '柴山私人秘境導覽', preferredDate: '2026-08-15', backupDate: '2026-08-16',
  preferredPeriod: 'morning', participantsCount: 4, participantsNote: '含 1 位 8 歲兒童',
  language: '中文', needPickup: false, specialNote: '其中一位旅客膝蓋曾受傷',
  answers: [{ questionId: 'q1', label: '是否需要接送', answer: '不需要' }],
};

test('periodLabel 對映', () => {
  assert.equal(periodLabel('morning'), '上午');
  assert.equal(periodLabel('afternoon'), '下午');
  assert.equal(periodLabel('evening'), '晚上');
  assert.equal(periodLabel(null), '');
});

test('需求摘要：只保留行程安排白名單，不含識別碼、聯絡與自由填答', () => {
  const t = buildRequestSummaryText(REQ);
  for (const s of ['王小姐', '柴山私人秘境導覽', '2026-08-15', '備用 2026-08-16',
    '4 位', '中文', '不需要接送']) {
    assert.ok(t.includes(s), `缺少片段：${s}\n---\n${t}`);
  }
  for (const forbidden of ['11111111-1111-4111-8111-111111111111', 'inquiry_22222222-2222-4222-8222-222222222222', 'secret-request-token', 'R20260815001', '+886-912-345-678', '僅供內部確認', '含 1 位 8 歲兒童', '膝蓋曾受傷', '是否需要接送：不需要', 'wang123', 'LINE ID', 'Email']) {
    assert.ok(!t.includes(forbidden), `不得輸出：${forbidden}\n---\n${t}`);
  }
});

test('需求摘要：忽略任何聯絡欄位，且缺省欄位不輸出空行', () => {
  const t = buildRequestSummaryText({ ...REQ, backupDate: null, specialNote: null, answers: [], travelerLineId: null, travelerEmail: 'a@b.c' });
  assert.ok(!t.includes('備用'));
  assert.ok(!t.includes('特殊需求'));
  assert.ok(!t.includes('a@b.c'));
});

test('LINE 回覆：含稱呼/導遊名/服務/日期，無識別碼或自由填答', () => {
  const t = buildLineReplyText(REQ, 'Andy');
  for (const s of ['王小姐', 'Andy', '柴山私人秘境導覽', '2026-08-15', '4 位']) assert.ok(t.includes(s), s);
  for (const banned of ['療癒', '絕美', '夢幻', '網美', '打卡', '敬請', '11111111-1111-4111-8111-111111111111', 'inquiry_22222222-2222-4222-8222-222222222222', 'secret-request-token', 'R20260815001', '+886-912-345-678', '僅供內部確認', '膝蓋曾受傷', 'wang123', 'a@b.c']) assert.ok(!t.includes(banned), banned);
  assert.ok((t.match(/[！!]/g) ?? []).length <= 1);
});

test('需求摘要：帶 planTitle 時服務行顯示「服務名（方案名）」', () => {
  const t = buildRequestSummaryText({ ...REQ, planTitle: '半日方案' });
  assert.ok(t.includes('柴山私人秘境導覽（半日方案）'));
});

test('LINE 回覆：帶 planTitle 時服務段落顯示「服務名（方案名）」', () => {
  const t = buildLineReplyText({ ...REQ, planTitle: '半日方案' }, 'Andy');
  assert.ok(t.includes('柴山私人秘境導覽（半日方案）'));
});
