/**
 * Issue #1373 — admin/guide login endpoints rate limit（暴力破解防護）
 *
 * AC1: POST /api/admin/auth/session 同 IP 失敗超過限額時回 429
 * AC2: POST /api/guide/auth/session 同 IP 失敗超過限額時回 429
 * AC3: 正常登入流程不受影響（成功登入不計數；錯誤憑證仍回 401）
 * AC4: 429 回應不洩漏 email/帳號存在與否
 *
 * 行為測試：transpile rate-limit.ts 後直接驗證 limiter 行為（同 tests/rate-limit.test.mjs 模式）。
 * 路由接線：source-contract 鎖定兩支 login route 的 peek/record 順序。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

async function importRateLimitModule() {
  const sourcePath = path.resolve('src/lib/rate-limit.ts');
  const compiledPath = path.resolve('src/lib/.tmp-rate-limit-issue1373.test.mjs');

  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  await writeFile(compiledPath, compiled, 'utf8');

  try {
    return await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
  } finally {
    await unlink(compiledPath).catch(() => {});
  }
}

// ── 行為：失敗計數 + 429 回應 ────────────────────────────────────────────────

test('adminLoginLimiter: 10 次失敗後 peek 變 not allowed，429 格式為 fail(RATE_LIMITED)', async () => {
  const { adminLoginLimiter, createLoginRateLimitResponse } = await importRateLimitModule();
  const key = 'admin-login:1.2.3.4';

  for (let i = 0; i < 10; i += 1) {
    assert.equal(adminLoginLimiter.peek(key).allowed, true, `第 ${i + 1} 次失敗前應仍可嘗試`);
    adminLoginLimiter.record(key);
  }

  const result = adminLoginLimiter.peek(key);
  assert.equal(result.allowed, false, '10 次失敗後應被擋下');

  const response = createLoginRateLimitResponse(result);
  assert.ok(response, '超限時應回 Response');
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('Retry-After'));

  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'RATE_LIMITED');
  // AC4：不得洩漏帳號/email 存在與否
  const raw = JSON.stringify(body).toLowerCase();
  assert.ok(!raw.includes('email'), '429 body 不得含 email');
  assert.ok(!raw.includes('account'), '429 body 不得含帳號資訊');
});

test('guideLoginLimiter: 同樣 10 次失敗/分鐘上限', async () => {
  const { guideLoginLimiter, createLoginRateLimitResponse } = await importRateLimitModule();
  const key = 'guide-login:5.6.7.8';

  for (let i = 0; i < 10; i += 1) {
    adminAssertAllowed(guideLoginLimiter.peek(key), i);
    guideLoginLimiter.record(key);
  }

  const result = guideLoginLimiter.peek(key);
  assert.equal(result.allowed, false);
  const response = createLoginRateLimitResponse(result);
  assert.equal(response.status, 429);

  function adminAssertAllowed(r, i) {
    assert.equal(r.allowed, true, `第 ${i + 1} 次失敗前應仍可嘗試`);
  }
});

test('AC3: peek 不累計 — 成功登入（只 peek 不 record）不會把使用者鎖住', async () => {
  const { adminLoginLimiter, createLoginRateLimitResponse } = await importRateLimitModule();
  const key = 'admin-login:9.9.9.9';

  for (let i = 0; i < 100; i += 1) {
    const r = adminLoginLimiter.peek(key);
    assert.equal(r.allowed, true, '只 peek 不 record 應永遠 allowed');
    assert.equal(createLoginRateLimitResponse(r), null);
  }
});

test('限額內（少量失敗）仍 allowed — 錯誤憑證可繼續重試拿 401', async () => {
  const { adminLoginLimiter } = await importRateLimitModule();
  const key = 'admin-login:8.8.8.8';

  for (let i = 0; i < 3; i += 1) adminLoginLimiter.record(key);
  assert.equal(adminLoginLimiter.peek(key).allowed, true, '3 次失敗遠低於限額，仍應可嘗試');
});

test('不同 IP 各自獨立計數', async () => {
  const { adminLoginLimiter } = await importRateLimitModule();
  for (let i = 0; i < 10; i += 1) adminLoginLimiter.record('admin-login:10.0.0.1');
  assert.equal(adminLoginLimiter.peek('admin-login:10.0.0.1').allowed, false);
  assert.equal(adminLoginLimiter.peek('admin-login:10.0.0.2').allowed, true);
});

// ── Source-contract：route 接線 ─────────────────────────────────────────────

const adminRouteSrc = readFileSync(
  path.resolve('app/api/admin/auth/session/route.ts'),
  'utf8'
);
const guideRouteSrc = readFileSync(
  path.resolve('app/api/guide/auth/session/route.ts'),
  'utf8'
);

test('AC1 接線: admin route POST 在 isAdminAuthorized 前 peek、401 前 record', () => {
  assert.match(adminRouteSrc, /adminLoginLimiter/, 'admin route 應使用 adminLoginLimiter');
  assert.match(adminRouteSrc, /createLoginRateLimitResponse/, 'admin route 應使用 createLoginRateLimitResponse');

  const postSrc = adminRouteSrc.slice(adminRouteSrc.indexOf('export async function POST'));
  const peekIdx = postSrc.indexOf('adminLoginLimiter.peek');
  const authIdx = postSrc.indexOf('isAdminAuthorized');
  const recordIdx = postSrc.indexOf('adminLoginLimiter.record');
  assert.ok(peekIdx >= 0, 'POST 內應有 peek');
  assert.ok(recordIdx >= 0, 'POST 內應有 record（失敗時計數）');
  assert.ok(peekIdx < authIdx, 'peek 應在 isAdminAuthorized 之前');
});

test('AC2 接線: guide route POST 在查詢前 peek、INVALID_CREDENTIALS/INVALID_TOKEN 前 record', () => {
  assert.match(guideRouteSrc, /guideLoginLimiter/, 'guide route 應使用 guideLoginLimiter');
  assert.match(guideRouteSrc, /createLoginRateLimitResponse/, 'guide route 應使用 createLoginRateLimitResponse');

  const postSrc = guideRouteSrc.slice(guideRouteSrc.indexOf('export async function POST'));
  const peekIdx = postSrc.indexOf('guideLoginLimiter.peek');
  const firstQueryIdx = postSrc.indexOf('guide_profiles');
  assert.ok(peekIdx >= 0, 'POST 內應有 peek');
  assert.ok(peekIdx < firstQueryIdx, 'peek 應在第一個 guide_profiles 查詢之前');

  // 每個 INVALID_CREDENTIALS / INVALID_TOKEN / TOKEN_EXPIRED 失敗分支都應 record
  const failureCodes = ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS'];
  for (const code of failureCodes) {
    let cursor = 0;
    while (true) {
      const idx = postSrc.indexOf(`fail('${code}'`, cursor);
      if (idx === -1) break;
      const windowBefore = postSrc.slice(Math.max(0, idx - 220), idx);
      assert.ok(
        windowBefore.includes('recordGuideLoginFailure') || windowBefore.includes('guideLoginLimiter.record'),
        `${code} 回傳前應 record 失敗（offset ${idx}）`
      );
      cursor = idx + 1;
    }
  }
});

test('AC3 接線: admin route 成功路徑不 record（record 只出現在 !auth.ok 分支）', () => {
  const postSrc = adminRouteSrc.slice(
    adminRouteSrc.indexOf('export async function POST'),
    adminRouteSrc.indexOf('export async function DELETE')
  );
  const recordCount = (postSrc.match(/adminLoginLimiter\.record/g) || []).length;
  assert.equal(recordCount, 1, 'record 應只有一處（失敗分支）');
  const failBranch = postSrc.slice(postSrc.indexOf('if (!auth.ok)'), postSrc.indexOf("fail('UNAUTHORIZED'"));
  assert.ok(failBranch.includes('adminLoginLimiter.record'), 'record 應位於 !auth.ok 分支內');
});
