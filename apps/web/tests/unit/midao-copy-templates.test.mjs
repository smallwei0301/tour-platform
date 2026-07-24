import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestSummaryText, buildLineReplyText, periodLabel } from '../../src/lib/midao/midao-copy-templates.mjs';

const REQ = {
  requestNo: 'R20260815001', travelerName: '王小姐', travelerLineId: 'wang123', travelerEmail: null,
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

test('需求摘要：含關鍵欄位、備用日期、註記與聯絡方式', () => {
  const t = buildRequestSummaryText(REQ);
  for (const s of ['R20260815001', '王小姐', '柴山私人秘境導覽', '2026-08-15', '備用 2026-08-16',
    '4 位', '含 1 位 8 歲兒童', '中文', '不需要接送', '膝蓋曾受傷', '是否需要接送：不需要', 'LINE ID：wang123']) {
    assert.ok(t.includes(s), `缺少片段：${s}\n---\n${t}`);
  }
});

test('需求摘要：缺省欄位不輸出空行', () => {
  const t = buildRequestSummaryText({ ...REQ, backupDate: null, specialNote: null, answers: [], travelerLineId: null, travelerEmail: 'a@b.c' });
  assert.ok(!t.includes('備用'));
  assert.ok(!t.includes('特殊需求'));
  assert.ok(t.includes('Email：a@b.c'));
});

test('LINE 回覆：含稱呼/導遊名/服務/日期，無禁用詞、驚嘆號至多 1', () => {
  const t = buildLineReplyText(REQ, 'Andy');
  for (const s of ['王小姐', 'Andy', '柴山私人秘境導覽', '2026-08-15', '4 位']) assert.ok(t.includes(s), s);
  for (const banned of ['療癒', '絕美', '夢幻', '網美', '打卡', '敬請']) assert.ok(!t.includes(banned), banned);
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
