/**
 * Issue #1376 — 收斂 faq-route-helpers .ts/.mjs 雙檔
 *
 * AC1: src/lib/ 下 faq-route-helpers 為單一 source of truth（.ts 僅型別 + re-export，無邏輯複本）
 * AC2: tests/api/activity-faq-route.test.mjs 測的模組（.mjs）與 production route
 *      引用的（.ts → re-export .mjs）是同一份
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { buildFaqPatch } from '../../src/lib/faq-route-helpers.mjs';

const tsSrc = readFileSync(path.resolve('src/lib/faq-route-helpers.ts'), 'utf8');
const routeSrc = readFileSync(
  path.resolve('app/api/admin/activities/[id]/route.ts'),
  'utf8'
);

test('AC1: .ts 不再內含邏輯複本（無 function 實作、無 MAX_CHARS）', () => {
  assert.ok(!tsSrc.includes('MAX_CHARS'), '.ts 不應再有 MAX_CHARS 常數複本');
  assert.ok(
    !/function\s+(validateFaqEntries|buildFaqPatch)/.test(tsSrc),
    '.ts 不應再有 validateFaqEntries / buildFaqPatch 實作複本'
  );
});

test('AC1+AC2: .ts re-export canonical .mjs 的 buildFaqPatch', () => {
  assert.match(
    tsSrc,
    /export\s*\{\s*buildFaqPatch\s*\}\s*from\s*'\.\/faq-route-helpers\.mjs'/,
    '.ts 應 re-export ./faq-route-helpers.mjs 的 buildFaqPatch'
  );
});

test('AC2: production route 仍從 faq-route-helpers 取得 buildFaqPatch', () => {
  assert.match(
    routeSrc,
    /import\s*\{\s*buildFaqPatch\s*\}\s*from\s*'[^']*faq-route-helpers(\.mjs)?'/,
    'route 應 import buildFaqPatch'
  );
});

test('行為基準: canonical buildFaqPatch 正規化 legacy {q,a} 形狀', () => {
  const result = buildFaqPatch([{ q: '怎麼去？', a: '搭船。' }]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.normalised, [{ question: '怎麼去？', answer: '搭船。' }]);
});

test('行為基準: canonical buildFaqPatch 拒絕超長與空白', () => {
  const tooLong = 'x'.repeat(501);
  const bad = buildFaqPatch([{ question: tooLong, answer: '' }]);
  assert.equal(bad.ok, false);
  assert.equal(bad.statusCode, 400);
  assert.match(bad.message, /exceeds 500/);
  assert.match(bad.message, /answer must not be empty/);
});
