/**
 * Issue #1599 — 分散式 rate limiter 行為測試（mock store，不需 Redis）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemoryRateStore,
  peekDistributed,
  recordDistributed,
  resolveRateStore,
  UpstashRateStore,
  __resetStoreCache,
} from '../../src/lib/rate-limit-distributed.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CFG = { maxRequests: 3, windowMs: 60_000 };

test('T1599.1 — 記憶體 store：record 累加、超額後 peek 拒絕', async () => {
  const store = new MemoryRateStore();
  const key = 'admin-login:1.2.3.4';
  assert.equal((await peekDistributed(key, CFG, store)).allowed, true);
  await recordDistributed(key, CFG, store);
  await recordDistributed(key, CFG, store);
  await recordDistributed(key, CFG, store); // count=3 == max
  assert.equal((await peekDistributed(key, CFG, store)).allowed, false, '達上限後 peek 應拒絕');
});

test('T1599.2 — 不同 key 互不影響', async () => {
  const store = new MemoryRateStore();
  await recordDistributed('a:1', CFG, store);
  await recordDistributed('a:1', CFG, store);
  await recordDistributed('a:1', CFG, store);
  assert.equal((await peekDistributed('a:1', CFG, store)).allowed, false);
  assert.equal((await peekDistributed('b:2', CFG, store)).allowed, true);
});

test('T1599.3 — store 拋錯 → fail-open（peek/record 皆 allowed，不拋）', async () => {
  const boom = {
    peekCount: async () => { throw new Error('redis down'); },
    hit: async () => { throw new Error('redis down'); },
  };
  const p = await peekDistributed('k', CFG, boom);
  assert.equal(p.allowed, true, 'peek 應 fail-open');
  const r = await recordDistributed('k', CFG, boom);
  assert.equal(r.allowed, true, 'record 應 fail-open');
});

test('T1599.4 — resolveRateStore：無 Upstash env → 記憶體；有 env → Upstash', () => {
  __resetStoreCache();
  assert.ok(resolveRateStore({}) instanceof MemoryRateStore, '無 env 回記憶體 store');
  const up = resolveRateStore({
    UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'tok',
  });
  assert.ok(up instanceof UpstashRateStore, '有 env 回 Upstash store');
  __resetStoreCache();
});

test('T1599.5 — UpstashRateStore：以 mock fetch 驗 INCR+PEXPIRE 序列與 peek GET', async () => {
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const args = JSON.parse(init.body);
    calls.push(args);
    if (args[0] === 'INCR') return { ok: true, json: async () => ({ result: 1 }) };
    if (args[0] === 'PEXPIRE') return { ok: true, json: async () => ({ result: 1 }) };
    if (args[0] === 'GET') return { ok: true, json: async () => ({ result: '2' }) };
    if (args[0] === 'PTTL') return { ok: true, json: async () => ({ result: 30_000 }) };
    return { ok: true, json: async () => ({ result: null }) };
  };
  const orig = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    const store = new UpstashRateStore('https://x.upstash.io', 'tok');
    const hit = await store.hit('admin-login:1.1.1.1', 60_000);
    assert.equal(hit.count, 1);
    assert.deepEqual(calls[0], ['INCR', 'admin-login:1.1.1.1']);
    assert.equal(calls[1][0], 'PEXPIRE', '首次命中應設 PEXPIRE');
    const c = await store.peekCount('admin-login:1.1.1.1');
    assert.equal(c, 2, 'peek 應回 GET 的數值');
  } finally {
    globalThis.fetch = orig;
  }
});

test('T1599.6 — 兩支 login route 疊加分散式層（保留既有記憶體 peek/record）', () => {
  const admin = readFileSync(path.join(ROOT, 'app/api/admin/auth/session/route.ts'), 'utf8');
  const guide = readFileSync(path.join(ROOT, 'app/api/guide/auth/session/route.ts'), 'utf8');
  for (const [name, src, sync] of [['admin', admin, 'adminLoginLimiter'], ['guide', guide, 'guideLoginLimiter']]) {
    assert.match(src, new RegExp(`${sync}\\.peek`), `${name} 應保留記憶體 peek`);
    assert.match(src, new RegExp(`${sync}\\.record`), `${name} 應保留記憶體 record`);
    assert.match(src, /peekDistributed/, `${name} 應加分散式 peek`);
    assert.match(src, /recordDistributed/, `${name} 應加分散式 record`);
  }
});
