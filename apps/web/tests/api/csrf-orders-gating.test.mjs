/**
 * 健檢 v2 S4（docs/operations/reports/repo-health-audit-20260702.md）：
 * middleware shouldRequireCsrf 的前綴白名單含 /api/orders，但 cookie-gating
 * 分支漏掉它 → mutation 實際不經 CSRF 檢查。修復需兩側：
 *   1. middleware.ts 補 /api/orders → hasTravelerAuthCookie gating 分支
 *   2. client-api.ts createOrder 補 csrfHeaders（否則登入旅客的 legacy 建單會被 403）
 *
 * Static-scan（source-contract）tests — middleware 為 edge 模組，依 repo 慣例
 * 以原始碼契約鎖定 wiring（範本：issue461a-csrf-me-guide.test.mjs）。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const middlewareSrc = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf8');
const clientApiSrc = fs.readFileSync(path.join(ROOT, 'src/lib/client-api.ts'), 'utf8');

describe('S4-1: middleware.ts — /api/orders CSRF gating 不再落空', () => {
  it('前綴白名單仍包含 /api/orders', () => {
    assert.match(middlewareSrc, /pathname\.startsWith\('\/api\/orders'\)/);
  });

  it('cookie-gating 段有 /api/orders 分支且以 traveler auth cookie 為條件', () => {
    // gating 段：對 /api/orders 的 mutation，有 traveler auth cookie 才要求 CSRF
    const gatingPattern =
      /if\s*\(pathname\.startsWith\('\/api\/orders'\)\)\s*return\s+hasTravelerAuthCookie\(req\);/;
    assert.match(
      middlewareSrc,
      gatingPattern,
      'shouldRequireCsrf 的 gating 段必須有 /api/orders → hasTravelerAuthCookie(req) 分支'
    );
  });

  it('gating 分支出現在 shouldRequireCsrf 函式內（fallback return false 之前）', () => {
    const fnStart = middlewareSrc.indexOf('function shouldRequireCsrf');
    assert.ok(fnStart !== -1);
    // 取函式起點到下一個 top-level function 之間的片段
    const fnEnd = middlewareSrc.indexOf('\nfunction ', fnStart + 10);
    const fnBody = middlewareSrc.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
    const branchIdx = fnBody.search(
      /if\s*\(pathname\.startsWith\('\/api\/orders'\)\)\s*return\s+hasTravelerAuthCookie\(req\);/
    );
    const fallbackIdx = fnBody.lastIndexOf('return false;');
    assert.ok(branchIdx !== -1, '/api/orders gating 分支必須在 shouldRequireCsrf 內');
    assert.ok(branchIdx < fallbackIdx, '/api/orders gating 分支必須在 fallback return false 之前');
  });
});

describe('S4-2: client-api.ts — createOrder 帶 CSRF header', () => {
  it('createOrder 的 POST /api/orders 附 csrfHeaders', () => {
    const createOrderIdx = clientApiSrc.indexOf('export async function createOrder');
    assert.ok(createOrderIdx !== -1);
    const nextFnIdx = clientApiSrc.indexOf('export async function', createOrderIdx + 10);
    const fnBody = clientApiSrc.slice(createOrderIdx, nextFnIdx === -1 ? undefined : nextFnIdx);
    assert.match(fnBody, /csrfHeaders\s*\(/, 'createOrder 必須以 csrfHeaders() 帶 x-csrf-token');
  });

  it('createOrder 先 ensureCsrfToken 確保 cookie 存在', () => {
    const createOrderIdx = clientApiSrc.indexOf('export async function createOrder');
    const nextFnIdx = clientApiSrc.indexOf('export async function', createOrderIdx + 10);
    const fnBody = clientApiSrc.slice(createOrderIdx, nextFnIdx === -1 ? undefined : nextFnIdx);
    assert.match(fnBody, /await\s+ensureCsrfToken\s*\(\s*\)/, 'createOrder 必須先 ensureCsrfToken()');
  });
});
