// #1475 — guide/profile 存檔在 production 尚未套用匯款欄位 migration 時須降級成功。
// 主因：PostgREST INSERT/UPDATE 缺欄位回 PGRST204「Could not find the 'account_name'
// column of 'guide_profiles' in the schema cache」，原 drift guard 只認 42703 → 存檔失敗。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, '..', '..');

const { isMissingColumnError } = await import('../../src/lib/schema-drift.mjs');

test('PostgREST schema cache miss（PGRST204 / 實際訊息）被視為缺欄位', () => {
  assert.equal(isMissingColumnError({ code: 'PGRST204' }), true);
  assert.equal(
    isMissingColumnError({ message: "Could not find the 'account_name' column of 'guide_profiles' in the schema cache" }),
    true,
  );
});

test('Postgres undefined_column（42703 / does not exist）被視為缺欄位', () => {
  assert.equal(isMissingColumnError({ code: '42703' }), true);
  assert.equal(isMissingColumnError({ message: 'column guide_profiles.bank_name does not exist' }), true);
});

test('其他錯誤不誤判', () => {
  assert.equal(isMissingColumnError(null), false);
  assert.equal(isMissingColumnError({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(isMissingColumnError({ message: 'permission denied for table payments' }), false);
});

test('guide/profile route 兩處 drift guard 皆改用 isMissingColumnError', () => {
  const src = readFileSync(join(webRoot, 'app/api/guide/profile/route.ts'), 'utf8');
  assert.match(src, /import \{ isMissingColumnError \} from/, '需 import helper');
  const calls = src.match(/isMissingColumnError\(/g) || [];
  // GET 1 次 + PATCH 1 次 呼叫點
  assert.ok(calls.length >= 2, `預期至少 2 處呼叫，實得 ${calls.length}`);
  assert.doesNotMatch(src, /\.code === '42703'/, '不應再殘留只認 42703 的舊判斷');
});
