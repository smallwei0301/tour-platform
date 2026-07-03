import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 契約測試（範本：issue1384-flow-contract.test.mjs）：
// in-memory 分支跑真行為；Supabase 分支用 source-contract 鎖實作形狀，
// 確保「先檢查 RESTRICT 表 → 刪活動 → 刪 profile → audit」的順序不被改壞。
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..');

const {
  deleteGuideApplicationDb,
  deleteGuideProfileDb,
  getGuideDeletePrecheckDb,
} = await import('../../src/lib/db-guide-delete.mjs');
const { createGuideApplication, listGuideApplications } = await import('../../src/lib/services.mjs');

// ── in-memory 行為 ──────────────────────────────────────

test('deleteGuideApplicationDb：建立 → 刪除 → 列表不再包含', async () => {
  const row = createGuideApplication({
    fullName: '刪除測試導遊',
    phone: '0912345678',
    email: 'delete-me@example.com',
    city: '台北市',
    bio: '測試用申請，建立後即刪除',
  });
  const out = await deleteGuideApplicationDb(row.id);
  assert.equal(out.ok, true);
  assert.equal(out.deleted.id, row.id);
  assert.equal(out.deleted.fullName, '刪除測試導遊');
  assert.ok(!listGuideApplications().some((a) => a.id === row.id), '列表仍含被刪申請');
});

test('deleteGuideApplicationDb：二次刪除（冪等安全）→ NOT_FOUND', async () => {
  const row = createGuideApplication({
    fullName: '二次刪除測試',
    phone: '0987654321',
    email: 'double-delete@example.com',
    city: '花蓮縣',
    bio: '測試二次刪除',
  });
  const first = await deleteGuideApplicationDb(row.id);
  assert.equal(first.ok, true);
  const second = await deleteGuideApplicationDb(row.id);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'NOT_FOUND');
});

test('deleteGuideApplicationDb：未知 id → NOT_FOUND', async () => {
  const out = await deleteGuideApplicationDb('ga_does_not_exist');
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NOT_FOUND');
});

test('deleteGuideProfileDb：in-memory 無 profile store → 一律 NOT_FOUND（明文契約）', async () => {
  const out = await deleteGuideProfileDb('166cb1ed-5562-479e-8714-f338f64b699b');
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NOT_FOUND');
});

test('getGuideDeletePrecheckDb：seeded application → kind=application、無阻擋', async () => {
  const row = createGuideApplication({
    fullName: 'Precheck 測試',
    phone: '0955555555',
    email: 'precheck@example.com',
    city: '台東縣',
    bio: '測試 precheck',
  });
  const out = await getGuideDeletePrecheckDb(row.id);
  assert.equal(out.ok, true);
  assert.equal(out.kind, 'application');
  assert.equal(out.activityCount, 0);
  assert.equal(out.blocked, null);
  await deleteGuideApplicationDb(row.id);
});

test('getGuideDeletePrecheckDb：未知 id → NOT_FOUND', async () => {
  const out = await getGuideDeletePrecheckDb('no-such-id-anywhere');
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NOT_FOUND');
});

// ── source-contract：db-guide-delete.mjs（Supabase 分支形狀）──

const domainSrc = readFileSync(join(WEB_ROOT, 'src/lib/db-guide-delete.mjs'), 'utf8');

test('source-contract：四張 RESTRICT 表都納入 pre-check 清單', () => {
  for (const table of ['bookings', 'payouts', 'payout_items', 'experiences']) {
    assert.match(
      domainSrc,
      new RegExp(`table:\\s*'${table}'`),
      `RESTRICT_TABLES 缺 ${table}`,
    );
  }
  // pre-check 用 count(head:true)，且逐表 .eq('guide_id', …)。
  assert.match(domainSrc, /count:\s*'exact',\s*head:\s*true/);
  assert.match(domainSrc, /\.eq\('guide_id', guideId\)/);
});

test('source-contract：先 pre-check、再刪活動、最後刪 profile（函式體內順序鎖定）', () => {
  const fnStart = domainSrc.indexOf('export async function deleteGuideProfileDb');
  assert.ok(fnStart > -1, '缺 deleteGuideProfileDb');
  const fnBody = domainSrc.slice(fnStart, domainSrc.indexOf('export async function', fnStart + 1));
  const countIdx = fnBody.indexOf('countGuideRecords(');
  const blockedIdx = fnBody.indexOf('GUIDE_HAS_RECORDS');
  const activityIdx = fnBody.indexOf('deleteActivityDb(');
  const profileDeleteIdx = fnBody.search(/from\('guide_profiles'\)\s*\n?\s*\.delete\(\)/);
  assert.ok(countIdx > -1 && blockedIdx > -1 && activityIdx > -1 && profileDeleteIdx > -1, '關鍵步驟缺失');
  assert.ok(countIdx < activityIdx, 'pre-check 必須在刪活動之前');
  assert.ok(blockedIdx < activityIdx, '擋刪判斷必須在刪活動之前');
  assert.ok(activityIdx < profileDeleteIdx, '刪活動必須在刪 profile row 之前');
});

test('source-contract：重用 db.mjs 的 deleteActivityDb，不得自行重寫活動刪除', () => {
  assert.match(domainSrc, /import\s*\{[^}]*deleteActivityDb[^}]*\}\s*from\s*'\.\/db\.mjs'/);
});

test('source-contract：頭像清理（guides bucket）與 GUIDE_HAS_RECORDS/counts/23503 映射存在', () => {
  assert.match(domainSrc, /storage\.from\('guides'\)/, '缺 guides bucket 頭像清理');
  assert.match(domainSrc, /GUIDE_HAS_RECORDS/, '缺 GUIDE_HAS_RECORDS code');
  assert.match(domainSrc, /counts/, '缺 counts');
  assert.match(domainSrc, /23503/, '缺 FK violation (23503) 後盾映射');
});

test('source-contract：audit log 在 profile delete 之後（記錄實際發生的刪除）', () => {
  const profileDeleteIdx = domainSrc.search(/from\('guide_profiles'\)\s*\n?\s*\.delete\(\)/);
  const auditIdx = domainSrc.indexOf('guide_profile_delete');
  assert.ok(profileDeleteIdx > -1 && auditIdx > -1);
  assert.ok(
    domainSrc.indexOf('insertAuditLogDb', profileDeleteIdx) > profileDeleteIdx,
    'audit 應在刪除成功後寫入',
  );
});

test('source-contract：每個 export 函式開頭都有 hasSupabaseEnv() guard', () => {
  const exported = domainSrc.split(/export async function /).slice(1);
  assert.ok(exported.length >= 3, '應至少有 3 個 export async function');
  for (const fn of exported) {
    const head = fn.slice(0, 400);
    assert.match(head, /hasSupabaseEnv\(\)/, `函式 ${fn.slice(0, 40)}… 開頭缺 hasSupabaseEnv guard`);
  }
});

// ── source-contract：route（DELETE 雙實體解析 + 409 + revalidate）──

const routeSrc = readFileSync(
  join(WEB_ROOT, 'app/api/admin/guides/[guideId]/route.ts'),
  'utf8',
);

test('source-contract：route DELETE 先解析 profile、再 fallback application', () => {
  const deleteIdx = routeSrc.indexOf('export async function DELETE');
  assert.ok(deleteIdx > -1, 'route 缺 DELETE handler');
  const profileCall = routeSrc.indexOf('deleteGuideProfileDb', deleteIdx);
  const appCall = routeSrc.indexOf('deleteGuideApplicationDb', deleteIdx);
  assert.ok(profileCall > -1 && appCall > -1, 'DELETE 需呼叫兩個領域函式');
  assert.ok(profileCall < appCall, '應先試 profile 再試 application（鏡射 GET）');
});

test('source-contract：route 對 GUIDE_HAS_RECORDS 回 409、revalidate 含 /guides', () => {
  const deleteIdx = routeSrc.indexOf('export async function DELETE');
  const tail = routeSrc.slice(deleteIdx);
  assert.match(tail, /GUIDE_HAS_RECORDS/);
  assert.match(tail, /409/);
  assert.match(tail, /localizeRevalidationPaths/);
  assert.match(tail, /'\/guides'/);
});
