import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIDAO_REQUEST_STATUSES, isValidRequestTransition, normalizeRequestInput,
  createMidaoRequestDb, listMidaoRequestsDb, getMidaoRequestDb,
  updateMidaoRequestStatusDb, getMidaoSummaryDb, __resetMemMidaoRequests, __seedMemMidaoRequests,
} from '../../src/lib/db-midao-requests.mjs';

const G = 'guide-1';
function baseInput(over = {}) {
  return {
    travelerName: '王小姐', travelerLineId: 'wang123', travelerEmail: '',
    preferredDate: '2026-08-15', backupDate: '2026-08-16', preferredPeriod: 'morning',
    participantsCount: 4, participantsNote: '含 1 位 8 歲兒童', language: '中文',
    needPickup: false, specialNote: '膝蓋曾受傷', answers: [], ...over,
  };
}
async function create(over = {}) {
  const norm = normalizeRequestInput(baseInput(over));
  assert.equal(norm.ok, true, JSON.stringify(norm));
  return createMidaoRequestDb({
    guideId: G, activityId: 'act-1', activityTitle: '柴山私人秘境導覽',
    value: norm.value, source: 'public_page',
  });
}

test.beforeEach(() => __resetMemMidaoRequests());

test('狀態機：合法/非法轉換', () => {
  assert.deepEqual(MIDAO_REQUEST_STATUSES,
    ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done']);
  assert.equal(isValidRequestTransition('new', 'pending_reply'), true);
  assert.equal(isValidRequestTransition('pending_reply', 'replied'), true);
  assert.equal(isValidRequestTransition('replied', 'closed_won'), true);
  assert.equal(isValidRequestTransition('closed_won', 'closed_done'), true);
  assert.equal(isValidRequestTransition('new', 'closed_done'), true);      // 直接結案
  assert.equal(isValidRequestTransition('closed_won', 'replied'), true);   // 允許回退
  assert.equal(isValidRequestTransition('replied', 'new'), false);         // 不可回到 new
  assert.equal(isValidRequestTransition('replied', 'replied'), false);     // 同狀態非轉換
  assert.equal(isValidRequestTransition('new', 'bogus'), false);
});

test('normalizeRequestInput：聯絡方式至少一種、長度上限', () => {
  const r1 = normalizeRequestInput(baseInput({ travelerLineId: '', travelerEmail: '' }));
  assert.equal(r1.ok, false); assert.equal(r1.code, 'CONTACT_REQUIRED');
  const r2 = normalizeRequestInput(baseInput({ specialNote: 'x'.repeat(501) }));
  assert.equal(r2.ok, false); assert.equal(r2.code, 'NOTE_TOO_LONG');
  const r3 = normalizeRequestInput(baseInput({ travelerName: '' }));
  assert.equal(r3.ok, false); assert.equal(r3.code, 'INVALID_NAME');
  const r4 = normalizeRequestInput(baseInput({ preferredDate: 'not-a-date' }));
  assert.equal(r4.ok, false); assert.equal(r4.code, 'INVALID_DATE');
  const r5 = normalizeRequestInput(baseInput());
  assert.equal(r5.ok, true);
});

test('request_no：R+日期+3位流水，同日遞增', async () => {
  const a = await create(); const b = await create();
  assert.match(a.requestNo, /^R20260815\d{3}$/);
  assert.equal(Number(b.requestNo.slice(-3)), Number(a.requestNo.slice(-3)) + 1);
});

test('list：分頁計數與未回覆優先排序', async () => {
  const a = await create(); // new
  const b = await create(); // new → replied
  await updateMidaoRequestStatusDb(G, b.id, 'pending_reply');
  await updateMidaoRequestStatusDb(G, b.id, 'replied');
  const c = await create(); // new → closed_won
  await updateMidaoRequestStatusDb(G, c.id, 'closed_won');

  const all = await listMidaoRequestsDb(G, { status: 'all', sort: 'unreplied_first' });
  assert.deepEqual(all.tabCounts, { new: 1, pendingReply: 0, replied: 1, closed: 1 });
  assert.equal(all.items[0].id, a.id); // 未回覆（new）排最前
  const closed = await listMidaoRequestsDb(G, { status: 'closed' });
  assert.deepEqual(closed.items.map((r) => r.id), [c.id]);
  // 越權隔離：其他 guide 看不到
  const other = await listMidaoRequestsDb('guide-2', {});
  assert.equal(other.items.length, 0);
});

test('狀態更新：合法轉換過、非法擋、NOT_FOUND', async () => {
  const a = await create();
  const ok = await updateMidaoRequestStatusDb(G, a.id, 'pending_reply');
  assert.equal(ok.ok, true); assert.equal(ok.request.status, 'pending_reply');
  const bad = await updateMidaoRequestStatusDb(G, a.id, 'new');
  assert.equal(bad.ok, false); assert.equal(bad.code, 'INVALID_TRANSITION');
  const miss = await updateMidaoRequestStatusDb(G, 'nope', 'replied');
  assert.equal(miss.ok, false); assert.equal(miss.code, 'NOT_FOUND');
  // 越權：guide-2 動不了 guide-1 的單
  const foreign = await updateMidaoRequestStatusDb('guide-2', a.id, 'replied');
  assert.equal(foreign.ok, false); assert.equal(foreign.code, 'NOT_FOUND');
});

test('summary：counts/topRequest/recentRequests', async () => {
  const a = await create();
  const b = await create();
  await updateMidaoRequestStatusDb(G, b.id, 'pending_reply');
  const s = await getMidaoSummaryDb(G);
  assert.deepEqual(s.counts, { newRequests: 1, pendingReply: 1 });
  assert.equal(s.topRequest.id, a.id); // 最舊的 new 優先
  assert.equal(Array.isArray(s.recentRequests), true);
  assert.equal(s.recentRequests.some((r) => r.id === a.id), false); // 不含 topRequest
});

test('normalizeRequestInput：answers 超過 10KB 擋下', () => {
  const big = Array.from({ length: 20 }, (_, i) => ({
    questionId: 'q'.repeat(400) + i, label: 'x'.repeat(120), answer: 'y'.repeat(300),
  }));
  const r = normalizeRequestInput(baseInput({ answers: big }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ANSWERS_TOO_LONG');
});

test('request_no：撞號時重試遞增（in-memory 路徑）', async () => {
  // 種一筆佔住 R20260815002：count=1 → 第一次算出 002 撞號 → 重試 +1 → 003
  __seedMemMidaoRequests([{
    id: 'seed1', guide_id: G, request_no: 'R20260815002', status: 'closed_done',
    source: 'manual', traveler_name: '既有', participants_count: 1, answers: [],
    need_pickup: false, preferred_date: '2026-08-15',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    status_changed_at: '2026-01-01T00:00:00Z',
  }]);
  const a = await create();
  assert.equal(a.requestNo, 'R20260815003');
});
