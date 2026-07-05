// 首頁精選 gateway 契約測試（範本：issue1384-flow-contract.test.mjs）
// 1) in-memory fallback 行為實測（同輸入 → 同輸出 shape／同狀態轉移）
// 2) Supabase 分支 source-contract：掃 db.mjs 源碼確保 snake_case mapping 涵蓋契約欄位
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 強制 in-memory path
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { getHomepageFeaturedDb, setHomepageFeaturedDb } = await import('../../src/lib/db.mjs');
const { auditLogs } = await import('../../src/lib/store.mjs');

const SETTINGS_SHAPE_KEYS = ['editorPickSlug', 'moreFeaturedSlugs', 'updatedAt', 'updatedBy'];
const CATALOG = ['kaohsiung-chaishan-cave-experience', 'hualien-river-trekking', 'dadadaocheng-walk'];

test('contract/get: in-memory 初始值 shape 完整且為未設定狀態', async () => {
  const settings = await getHomepageFeaturedDb();
  for (const key of SETTINGS_SHAPE_KEYS) {
    assert.ok(key in settings, `settings 缺 ${key}`);
  }
  assert.equal(settings.editorPickSlug, null);
  assert.deepEqual(settings.moreFeaturedSlugs, []);
});

test('contract/set: in-memory 設定溯溪為編輯精選 → get 回讀一致 + audit log', async () => {
  const auditBefore = auditLogs.length;
  const saved = await setHomepageFeaturedDb({
    editorPickSlug: 'hualien-river-trekking',
    moreFeaturedSlugs: ['kaohsiung-chaishan-cave-experience', 'hualien-river-trekking'], // 故意夾帶衝突
    validSlugs: CATALOG,
    actor: 'qa@midao.tw',
  });
  for (const key of SETTINGS_SHAPE_KEYS) {
    assert.ok(key in saved, `saved 缺 ${key}`);
  }
  assert.equal(saved.editorPickSlug, 'hualien-river-trekking');
  // 衝突防呆：編輯精選自動從更多精選排除
  assert.deepEqual(saved.moreFeaturedSlugs, ['kaohsiung-chaishan-cave-experience']);
  assert.equal(saved.updatedBy, 'qa@midao.tw');
  assert.ok(saved.updatedAt);

  const readBack = await getHomepageFeaturedDb();
  assert.deepEqual(readBack, saved);

  // audit log 經由 audit-log.mjs 單一實作寫入
  assert.equal(auditLogs.length, auditBefore + 1);
  const log = auditLogs[auditLogs.length - 1];
  assert.equal(log.action, 'homepage_featured_update');
  assert.equal(log.actor, 'qa@midao.tw');
});

test('contract/set: 無效 slug 拋 HOMEPAGE_FEATURED_INVALID，狀態不變', async () => {
  const before = await getHomepageFeaturedDb();
  await assert.rejects(
    () => setHomepageFeaturedDb({ editorPickSlug: 'ghost-tour', validSlugs: CATALOG }),
    (err) => err.code === 'HOMEPAGE_FEATURED_INVALID',
  );
  const after = await getHomepageFeaturedDb();
  assert.deepEqual(after, before);
});

test('contract/set: 清空設定（editorPickSlug=null）→ 回到未設定狀態', async () => {
  const saved = await setHomepageFeaturedDb({ editorPickSlug: null, moreFeaturedSlugs: [], validSlugs: CATALOG });
  assert.equal(saved.editorPickSlug, null);
  assert.deepEqual(saved.moreFeaturedSlugs, []);
});

test('contract/set: 文案覆寫 roundtrip — editorPickCopy / moreFeaturedCopy 回讀一致、清洗無效值', async () => {
  const saved = await setHomepageFeaturedDb({
    editorPickSlug: 'hualien-river-trekking',
    moreFeaturedSlugs: ['dadadaocheng-walk'],
    editorPickCopy: { title: '  手寫大標  ', subtitle: '', difficulty: 9, ratingCount: -1, bogus: 'x' },
    moreFeaturedCopy: {
      'dadadaocheng-walk': { title: '客製卡片', tagline: '', imageUrl: '' },
      'ghost': { title: '不在選取內' },
    },
    validSlugs: CATALOG,
    actor: 'qa@midao.tw',
  });
  // 編輯精選 copy：trim、空值移除、難度夾 5、負 count 移除、未知欄位剔除
  assert.equal(saved.editorPickCopy.title, '手寫大標');
  assert.ok(!('subtitle' in saved.editorPickCopy));
  assert.equal(saved.editorPickCopy.difficulty, 5);
  assert.ok(!('ratingCount' in saved.editorPickCopy));
  assert.ok(!('bogus' in saved.editorPickCopy));
  // 更多精選 copy：僅保留有選取的 slug、空 entry 移除
  assert.deepEqual(saved.moreFeaturedCopy, { 'dadadaocheng-walk': { title: '客製卡片' } });

  const readBack = await getHomepageFeaturedDb();
  assert.deepEqual(readBack.editorPickCopy, saved.editorPickCopy);
  assert.deepEqual(readBack.moreFeaturedCopy, saved.moreFeaturedCopy);
});

test('contract/set: 編輯精選清空（slug=null）→ editorPickCopy 一併清空', async () => {
  const saved = await setHomepageFeaturedDb({ editorPickSlug: null, editorPickCopy: { title: '不該保留' }, validSlugs: CATALOG });
  assert.deepEqual(saved.editorPickCopy, {});
});

// ── Supabase 分支 source-contract ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbSrc = fs.readFileSync(path.join(__dirname, '../../src/lib/db-homepage-featured.mjs'), 'utf8');

test('contract/supabase: getHomepageFeaturedDb mapping 涵蓋契約欄位（snake_case → camelCase）', () => {
  const fnStart = dbSrc.indexOf('export async function getHomepageFeaturedDb');
  assert.ok(fnStart > -1, 'db.mjs 缺 getHomepageFeaturedDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 1500);
  assert.match(fnSrc, /homepage_featured_settings/, 'Supabase 分支必須讀 homepage_featured_settings 表');
  for (const col of ['editor_pick_slug', 'more_featured_slugs', 'updated_at', 'updated_by']) {
    assert.match(fnSrc, new RegExp(col), `select/mapping 缺 ${col}`);
  }
  for (const key of SETTINGS_SHAPE_KEYS) {
    assert.match(fnSrc, new RegExp(`${key}\\s*[:,]`), `camelCase mapping 缺 ${key}`);
  }
});

test('contract/supabase: setHomepageFeaturedDb 先 normalize 再 upsert singleton + audit', () => {
  const fnStart = dbSrc.indexOf('export async function setHomepageFeaturedDb');
  assert.ok(fnStart > -1, 'db.mjs 缺 setHomepageFeaturedDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 2200);
  const normalizeAt = fnSrc.indexOf('normalizeHomepageFeatured(');
  const upsertAt = fnSrc.indexOf(".upsert(");
  assert.ok(normalizeAt > -1, '必須呼叫 normalizeHomepageFeatured');
  assert.ok(upsertAt > -1, '必須 upsert homepage_featured_settings');
  assert.ok(normalizeAt < upsertAt, 'normalize 必須在 upsert 之前（驗證先於寫入）');
  assert.match(fnSrc, /id:\s*'default'/, 'singleton row 必須固定 id=default');
  assert.match(fnSrc, /insertAuditLogDb/, 'Supabase 分支需寫 audit log');
});
