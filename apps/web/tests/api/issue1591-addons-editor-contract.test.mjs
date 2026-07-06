/**
 * Issue #1591 後台編輯 — 加購 CRUD db 層＋驗證＋route 接線 契約測試。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeAddonInput, listActivityAddonsForEditDb, createActivityAddonDb,
  updateActivityAddonDb, deleteActivityAddonDb, getAddonActivityIdDb,
  listActivityAddonsDb, __seedMemAddons, __getMemAddons,
} from '../../src/lib/db-addons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('T1591edit.1 — normalizeAddonInput 驗證', () => {
  assert.equal(normalizeAddonInput({ name: '', priceTwd: 100, unit: 'per_person' }).ok, false);
  assert.equal(normalizeAddonInput({ name: 'x', priceTwd: -1, unit: 'per_person' }).ok, false);
  assert.equal(normalizeAddonInput({ name: 'x', priceTwd: 100, unit: 'bad' }).ok, false);
  assert.equal(normalizeAddonInput({ name: 'x', priceTwd: 100, unit: 'per_person', stock: -3 }).ok, false);
  const ok = normalizeAddonInput({ name: ' 午餐 ', priceTwd: '250', unit: 'per_person', stock: '' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: '午餐', price_twd: 250, unit: 'per_person', stock: null });
  // partial（更新）：只驗證有給的欄
  assert.equal(normalizeAddonInput({ isActive: false }, true).ok, true);
});

test('T1591edit.2 — CRUD 生命週期（in-memory）＋ 只回啟用項給旅客', async () => {
  __seedMemAddons([]);
  const created = await createActivityAddonDb('act-1', normalizeAddonInput({ name: '器材', priceTwd: 300, unit: 'per_group', stock: 5 }).value);
  assert.equal(created.name, '器材');
  assert.equal(created.isActive, true);
  assert.equal(await getAddonActivityIdDb(created.id), 'act-1');

  // 後台列出（含停用）
  let all = await listActivityAddonsForEditDb('act-1');
  assert.equal(all.length, 1);

  // 停用 → 旅客端（listActivityAddonsDb 只回啟用）看不到，但後台仍看得到
  await updateActivityAddonDb(created.id, { is_active: false });
  assert.equal((await listActivityAddonsDb('act-1')).length, 0);
  assert.equal((await listActivityAddonsForEditDb('act-1')).length, 1);

  // 改價
  const upd = await updateActivityAddonDb(created.id, { price_twd: 350, is_active: true });
  assert.equal(upd.priceTwd, 350);
  assert.equal((await listActivityAddonsDb('act-1')).length, 1);

  // 刪除
  await deleteActivityAddonDb(created.id);
  assert.equal((await listActivityAddonsForEditDb('act-1')).length, 0);
  assert.equal(__getMemAddons().length, 0);
});

test('T1591edit.3 — guide 路由：session＋ownership＋CSRF＋jsonOk', () => {
  const list = read('app/api/v2/guide/activities/[activityId]/addons/route.ts');
  assert.match(list, /verifyGuideSession/);
  assert.match(list, /assertActivityBelongsToGuide/);
  assert.match(list, /validateCsrf/);
  assert.match(list, /jsonOk|jsonError/);
  assert.doesNotMatch(list, /Response\.json\(/); // 走 helper，不手刻
  const item = read('app/api/v2/guide/activities/[activityId]/addons/[addonId]/route.ts');
  assert.match(item, /getAddonActivityIdDb/); // addon 屬於此活動
  assert.match(item, /validateCsrf/);
});

test('T1591edit.4 — admin 路由：middleware 把關＋CSRF＋jsonOk＋不讀 process.env', () => {
  const list = read('app/api/v2/admin/activities/[activityId]/addons/route.ts');
  assert.match(list, /validateCsrf/);
  assert.match(list, /jsonOk|jsonError/);
  assert.doesNotMatch(list, /process\.env/); // 靠 middleware，不加 env 天花板
  const item = read('app/api/v2/admin/activities/[activityId]/addons/[addonId]/route.ts');
  assert.match(item, /getAddonActivityIdDb/);
});

test('T1591edit.5 — 導遊＋管理者編輯頁掛載 AddonsEditor', () => {
  const guide = read('app/guide/activities/[id]/edit/page.tsx');
  assert.match(guide, /<AddonsEditor/);
  assert.match(guide, /\/api\/v2\/guide\/activities\/\$\{id\}\/addons/);
  const admin = read('app/admin/activities/[id]/edit/page.tsx');
  assert.match(admin, /<AddonsEditor/);
  assert.match(admin, /\/api\/v2\/admin\/activities\/\$\{activityId\}\/addons/);
  // 編輯器：未設定預設隱藏的說明
  const editor = read('src/components/activity/AddonsEditor.tsx');
  assert.match(editor, /預設隱藏|不顯示加購/);
});
