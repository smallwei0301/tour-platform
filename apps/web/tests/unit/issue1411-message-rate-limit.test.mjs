/**
 * Issue #1411 AC5 — 留言 rate limit：同一使用者 10 分鐘內第 11 則 POST 回 429。
 * 行為測試：transpile rate-limit.ts 後直接驗證 limiter 行為
 * （同 tests/api/issue1373-login-rate-limit.test.mjs 模式）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function importRateLimitModule() {
  const sourcePath = path.join(WEB_ROOT, 'src/lib/rate-limit.ts');
  const scratchDir = await mkdtemp(path.join(tmpdir(), 'tour-platform-rate-limit-'));
  const compiledPath = path.join(scratchDir, 'rate-limit.test.mjs');

  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  await copyFile(path.join(WEB_ROOT, 'src/lib/trusted-ip.mjs'), path.join(scratchDir, 'trusted-ip.mjs'));
  await writeFile(compiledPath, compiled, 'utf8');

  try {
    return await import(`${pathToFileURL(compiledPath).href}?t=${Date.now()}`);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

test('AC5: messageSendLimiter 第 1–10 則放行、第 11 則擋下且回 429', async () => {
  const mod = await importRateLimitModule();
  const { messageSendLimiter, createRateLimitResponse } = mod;
  const key = `order-message:traveler:ac5-${Date.now()}`;

  for (let i = 1; i <= 10; i += 1) {
    const r = messageSendLimiter.check(key);
    assert.equal(r.allowed, true, `第 ${i} 則應放行`);
    assert.equal(createRateLimitResponse(r), null, `第 ${i} 則不應回 429`);
  }

  const eleventh = messageSendLimiter.check(key);
  assert.equal(eleventh.allowed, false, '第 11 則應被擋下');
  const res = createRateLimitResponse(eleventh);
  assert.ok(res, '第 11 則應產生 429 回應');
  assert.equal(res.status, 429);

  // 不同使用者不互相佔額度
  const other = messageSendLimiter.check(`order-message:guide:ac5-other-${Date.now()}`);
  assert.equal(other.allowed, true);
});

test('AC5: 視窗為 10 分鐘（resetAt 距 check 時間約 600 秒）', async () => {
  const mod = await importRateLimitModule();
  const before = Date.now();
  const r = mod.messageSendLimiter.check(`order-message:traveler:window-${before}`);
  const windowMs = r.resetAt - before;
  assert.ok(windowMs > 9.5 * 60 * 1000 && windowMs <= 10.5 * 60 * 1000,
    `視窗應約 10 分鐘，實際 ${Math.round(windowMs / 1000)}s`);
  assert.equal(r.maxRequests, 10);
});
