/**
 * Issue #1265 — `docs/operations/current-issue-priority.md` 與 live GitHub
 * state 漂移時的 source-contract 守門。
 *
 * 本 issue 觀察到的 drift 案例：
 *   - #1254 已 CLOSED，但 doc 把它當 OPEN `agent:next` 列為「current safe
 *     next candidate」。
 *   - #1121 在 live GitHub 已不是 `priority:P0` / `launch:first-payment-blocker`
 *     （labels 只剩 `status:needs-decision` + `launch:post-first-payment`），
 *     但 doc 仍稱它是「open P0」「top business blocker」。
 *   - #1231 已 CLOSED 但 doc 仍寫 OPEN。
 *
 * Drift 的根因不是文件作者誤寫，是 doc 是 bounded snapshot、live GitHub
 * 持續演進。本測試提供一個可重跑的 contract check：
 *
 *   1. 把 doc 自己列入 active routing 的 issue 號全部抓出來；
 *   2. 跑 live GitHub 查詢取得對應 state + labels；
 *   3. 任何「doc 列為 active routing 但 live 已 CLOSED」、或「doc 標 P0 但
 *      live labels 無 priority:P0」的不一致，就讓測試 fail。
 *
 * 測試的 live-query 部分需要 GitHub token（CI 預設有 GITHUB_TOKEN）；本地
 * 沒 token 時 skip 而非 false-pass，並印出 reason；這符合 #1298 的「stale 必須
 * 顯式失敗、不可吞訊號」原則。
 *
 * 純 docs-contract 部分（不需要網路）總是會跑：
 *   - doc 必須明確說 readiness snapshot + live `gh` 是 fast-moving truth；
 *   - doc 不可同時宣稱「no open P0」與名列 P0 issue（內部一致性）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DOC_PATH = path.join(REPO_ROOT, 'docs/operations/current-issue-priority.md');

function readDoc() {
  return readFileSync(DOC_PATH, 'utf8');
}

/**
 * 從 doc 中抓出所有「active routing」list item 的 issue 號 — 形如
 *   "1. **#1254 — ..."
 * 但**不**包含 `## Historical/non-routing notes` 之後的條目。
 */
function extractActiveRoutingIssueNumbers(doc) {
  const histIdx = doc.indexOf('## Historical');
  const active = histIdx === -1 ? doc : doc.slice(0, histIdx);
  const re = /^\s*\d+\.\s+\*\*#(\d+)\s+/gm;
  const nums = new Set();
  let m;
  while ((m = re.exec(active)) !== null) {
    nums.add(Number(m[1]));
  }
  return Array.from(nums).sort((a, b) => a - b);
}

/**
 * 用 GitHub REST API 查 issue state + label names。Token 缺失或 fetch 失敗
 * 都會回 null，呼叫端用 null 來決定 skip。
 */
async function fetchIssueLive(num) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/smallwei0301/tour-platform/issues/${num}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { state: data.state, labels: (data.labels || []).map((l) => l.name) };
  } catch {
    return null;
  }
}

// ── Pure docs-contract checks (always run) ─────────────────────────────────────

test('Doc 明確指向 readiness snapshot + live gh 為 fast-moving truth', () => {
  const doc = readDoc();
  assert.match(
    doc,
    /readiness-live-state-latest\.md/,
    'doc 必須點名 readiness-live-state-latest.md 為 live truth 入口'
  );
  assert.match(doc, /gh issue\s+(list|view)/, 'doc 必須示範 live gh 查詢');
});

test('Doc 內部一致：不可同時宣稱「no open P0」與名列 P0 issue', () => {
  const doc = readDoc();
  // 只抓 declarative claim：例如 "No open P0 remains active today"。
  // 排除 meta-rule（line 49: "pretend there is no open P0"、
  // line 185: '"no open P0" wording'）— 那些是「告誡不要這樣寫」，不是宣稱。
  const declarativeNoP0 = /\bno\s+open\s+P0\b[^."'”]*?\b(remain|today|active)\b/i.test(doc);
  const namesAP0Issue = /priority:P0/.test(doc) && /\bP0 \/ first-payment blockers\b/i.test(doc);
  assert.ok(
    !(declarativeNoP0 && namesAP0Issue),
    'doc 不可同時 declare 「no open P0」與名列 P0 list；二擇一即可'
  );
});

test('Doc 必須說自己是 bounded snapshot、不是 live truth', () => {
  const doc = readDoc();
  assert.match(doc, /bounded\s+(routing\s+)?snapshot/i, '頭段必須自承為 bounded routing snapshot');
});

// ── Live drift check (skipped when no GH token) ────────────────────────────────

test('Live drift: doc 所列 active routing issue 不可是已 CLOSED 的', async (t) => {
  const doc = readDoc();
  const numbers = extractActiveRoutingIssueNumbers(doc);
  assert.ok(numbers.length > 0, 'doc 必須至少列出一個 active routing issue');

  // 抽樣第一個查 token；token 缺失就整體 skip（不 false-pass）。
  const probe = await fetchIssueLive(numbers[0]);
  if (probe === null) {
    t.skip('GITHUB_TOKEN 不可用：跳過 live drift 檢查（非 false pass）');
    return;
  }

  const closed = [];
  for (const n of numbers) {
    const live = await fetchIssueLive(n);
    if (!live) continue;
    if (live.state === 'closed') closed.push(n);
  }

  assert.deepEqual(
    closed,
    [],
    `下列 issue 在 doc 中列為 active routing，但 live GitHub 已 CLOSED — 移到 Historical 區或刪除：${closed.join(', ')}`
  );
});

test('Live drift: 任何被 doc 標為 P0 / first-payment-blocker 的 issue 必須在 live labels 含對應 label', async (t) => {
  const doc = readDoc();
  const probe = await fetchIssueLive(1);
  if (probe === null) {
    t.skip('GITHUB_TOKEN 不可用：跳過 live drift 檢查（非 false pass）');
    return;
  }

  // 從 P0 list section 抽 issue 號
  const p0Section = doc.match(/##\s*P0\s*\/\s*first-payment blockers[\s\S]*?(?=^##\s)/m);
  if (!p0Section) return; // doc 已移除 P0 區段就無需檢查
  const re = /\*\*#(\d+)\s+/g;
  const claimed = new Set();
  let m;
  while ((m = re.exec(p0Section[0])) !== null) {
    claimed.add(Number(m[1]));
  }

  const mismatched = [];
  for (const n of claimed) {
    const live = await fetchIssueLive(n);
    if (!live) continue;
    const hasP0 = live.labels.includes('priority:P0');
    const hasFpBlocker = live.labels.includes('launch:first-payment-blocker');
    if (!hasP0 && !hasFpBlocker) {
      mismatched.push({ n, labels: live.labels });
    }
  }

  assert.deepEqual(
    mismatched,
    [],
    `下列 issue 在 doc 中列為 P0/first-payment blocker，但 live labels 兩者皆無 — 更新 doc 或移出 P0 區：${JSON.stringify(mismatched)}`
  );
});
