import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapMyQaRows, qaStatusLabel } from '../../src/lib/my-qa.mjs';

test('qaStatusLabel：依狀態與是否有回覆給正確標籤', () => {
  assert.equal(qaStatusLabel('pending_moderation', false), '審核中');
  assert.equal(qaStatusLabel('approved', true), '已回覆');
  assert.equal(qaStatusLabel('approved', false), '已公開');
  assert.equal(qaStatusLabel('rejected', false), '未通過');
  assert.equal(qaStatusLabel('unknown', false), '審核中');
});

test('mapMyQaRows：一般行程提問解析 title + canonical /activities/<region>/<slug> 連結', () => {
  const rows = [
    { id: 'q1', activity_id: 'act-uuid-1', question: '有停車場嗎？', answer: '有，免費停車。', status: 'approved', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-02T00:00:00Z' },
  ];
  // 帶 regionSlug 時直接採用（與 buildActivityHref／buildCanonicalActivityDetailPath 一致）
  const activityById = new Map([['act-uuid-1', { title: '柴山秘境之旅', slug: 'chaishan-cave', region: '高雄市', regionSlug: 'kaohsiung' }]]);
  const [item] = mapMyQaRows(rows, { activityById });
  assert.equal(item.targetKind, 'activity');
  assert.equal(item.targetTitle, '柴山秘境之旅');
  // 必須帶 region segment：少了 region 會打到 [region] 相容頁多一次查詢 + 轉址（載入過久根因）
  assert.equal(item.targetHref, '/activities/kaohsiung/chaishan-cave');
  assert.equal(item.answer, '有，免費停車。');
  assert.equal(item.answered, true);
  assert.equal(item.statusLabel, '已回覆');
});

test('mapMyQaRows：只有中文 region（無 regionSlug）時正規化成英文 segment', () => {
  const rows = [
    { id: 'q1b', activity_id: 'act-2', question: 'Q', answer: 'A', status: 'approved', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-02T00:00:00Z' },
  ];
  const activityById = new Map([['act-2', { title: '花蓮溯溪', slug: 'hualien-river', region: '花蓮' }]]);
  const [item] = mapMyQaRows(rows, { activityById });
  assert.equal(item.targetHref, '/activities/hualien/hualien-river');
});

test('mapMyQaRows：sentinel guide:<id> 解析導遊名稱 + /guides/<slug> 連結', () => {
  const rows = [
    { id: 'q2', activity_id: 'guide:g-123', question: '可以客製行程嗎？', answer: null, status: 'pending_moderation', created_at: '2026-06-03T00:00:00Z', updated_at: '2026-06-03T00:00:00Z' },
  ];
  const guideById = new Map([['g-123', { slug: 'amei', display_name: '阿美' }]]);
  const [item] = mapMyQaRows(rows, { guideById });
  assert.equal(item.targetKind, 'guide');
  assert.equal(item.targetTitle, '阿美（導遊）');
  assert.equal(item.targetHref, '/guides/amei');
  assert.equal(item.answer, null);
  assert.equal(item.answered, false);
  assert.equal(item.statusLabel, '審核中');
});

test('mapMyQaRows：查不到 activity/guide 時用 fallback 標題且 href 為 null（不破連結）', () => {
  const rows = [
    { id: 'q3', activity_id: 'missing', question: '?', answer: '', status: 'rejected', created_at: '2026-06-01T00:00:00Z', updated_at: null },
    { id: 'q4', activity_id: 'guide:gone', question: '?', answer: '', status: 'approved', created_at: '2026-06-01T00:00:00Z', updated_at: null },
  ];
  const items = mapMyQaRows(rows, {});
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(byId.q3.targetTitle, '行程提問');
  assert.equal(byId.q3.targetHref, null);
  assert.equal(byId.q3.statusLabel, '未通過');
  assert.equal(byId.q4.targetTitle, '向導遊提問');
  assert.equal(byId.q4.targetHref, null);
});

test('mapMyQaRows：依 updatedAt 由新到舊排序', () => {
  const rows = [
    { id: 'old', activity_id: 'a', question: 'x', status: 'approved', answer: 'a', created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
    { id: 'new', activity_id: 'a', question: 'x', status: 'approved', answer: 'a', created_at: '2026-06-05T00:00:00Z', updated_at: '2026-06-05T00:00:00Z' },
    { id: 'mid', activity_id: 'a', question: 'x', status: 'approved', answer: 'a', created_at: '2026-06-03T00:00:00Z', updated_at: '2026-06-03T00:00:00Z' },
  ];
  const ids = mapMyQaRows(rows, {}).map((i) => i.id);
  assert.deepEqual(ids, ['new', 'mid', 'old']);
});

test('mapMyQaRows：空輸入回空陣列', () => {
  assert.deepEqual(mapMyQaRows(null, {}), []);
  assert.deepEqual(mapMyQaRows([], {}), []);
});
