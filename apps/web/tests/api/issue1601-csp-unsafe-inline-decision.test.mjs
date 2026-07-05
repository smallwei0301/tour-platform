/**
 * Issue #1601 — CSP unsafe-inline 移除評估的「有意識決策」守門。
 *
 * 移除 unsafe-inline 在本 codebase 架構下被雙重阻擋（hash 不可行 / nonce 需 dynamic＋凍結
 * middleware），故決策為「暫不移除（D），未來走選項 C」。本測試鎖住：
 *  - next.config 保留 unsafe-inline 且註解指向決策文件（非無聲漂移）
 *  - 決策文件存在且記錄選項 A/B 的不可行證據
 *  - 若未來真的移除 unsafe-inline（達成 C），本測試會 fail → 逼同步更新決策文件
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPO = path.resolve(ROOT, '..', '..');
const DECISION_DOC = 'docs/04-tech/04-tech-architecture/15-csp-unsafe-inline-decision.md';

test('T1601.1 — next.config 的 unsafe-inline 保留有註解指向決策文件', () => {
  const cfg = readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
  assert.match(cfg, /script-src 'self' 'unsafe-inline'/, 'production script-src 目前保留 unsafe-inline');
  assert.match(cfg, /#1601/, '應註記 #1601 決策');
  assert.match(cfg, /15-csp-unsafe-inline-decision\.md/, '應指向決策文件');
});

test('T1601.2 — 決策文件存在並記錄 A/B 不可行證據', () => {
  const full = path.join(REPO, DECISION_DOC);
  assert.equal(existsSync(full), true, `決策文件應存在：${DECISION_DOC}`);
  const doc = readFileSync(full, 'utf8');
  assert.match(doc, /self\.__next_f/, '應記錄 Next flight data 使 hash 不可行的證據');
  assert.match(doc, /middleware\.ts/, '應記錄 nonce 需改凍結 middleware 的阻擋');
  assert.match(doc, /#1344/, '應記錄 nonce 回歸 ISR/SSG 效能的成本');
  assert.match(doc, /選項 C|option C/i, '應留未來路徑（混合 nonce）');
});

test('T1601.3 — 提醒：若已移除 unsafe-inline，需更新本決策', () => {
  // 這是「反向哨兵」：當 production script-src 不再含 unsafe-inline，代表達成選項 C，
  // 應回來更新決策文件與本測試。此時本測試的 T1601.1 會先 fail，這裡再給一個明確訊息。
  const cfg = readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf8');
  const stillHasUnsafeInline = /script-src 'self' 'unsafe-inline'/.test(cfg);
  assert.ok(
    stillHasUnsafeInline,
    '若你已移除 unsafe-inline（達成 #1601 選項 C），請更新 15-csp-unsafe-inline-decision.md 的狀態並改寫本測試。',
  );
});
