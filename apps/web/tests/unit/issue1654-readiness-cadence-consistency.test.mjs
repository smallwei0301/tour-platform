import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// #1654：readiness snapshot 反覆「假 stale」的根因是 workflow 降頻為每日後，
// freshness 門檻（12h）與文件宣稱（every 6h）沒有跟上——每天有半天被誤判 stale。
// 本檔鎖住三者一致：workflow 節奏 ↔ freshness 門檻 ↔ 文件宣稱。

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const workflow = read('.github/workflows/readiness-snapshot-refresh.yml');
const checker = read('scripts/readiness/check-snapshot-freshness.mjs');
const generator = read('scripts/readiness/generate-live-state-snapshot.mjs');

test('#1654: freshness 門檻必須涵蓋 workflow 的刷新節奏（每日 → 門檻 > 24h）', () => {
  const cronMatch = workflow.match(/cron:\s*'([^']+)'/);
  assert.ok(cronMatch, 'workflow 必須有 cron 排程');
  const thresholdMatch = checker.match(/FRESHNESS_THRESHOLD_HOURS\s*=\s*(\d+)/);
  assert.ok(thresholdMatch, 'checker 必須宣告 FRESHNESS_THRESHOLD_HOURS');
  const threshold = Number(thresholdMatch[1]);

  const [minute, hour, dom, month, dow] = cronMatch[1].trim().split(/\s+/);
  let cadenceHours;
  if (hour.includes('*/')) {
    cadenceHours = Number(hour.split('*/')[1]);
  } else if (hour === '*') {
    cadenceHours = 1;
  } else {
    // 固定時刻清單（如 '0 5 * * *'）→ 每日 24h ÷ 時刻數
    cadenceHours = 24 / hour.split(',').length;
  }
  assert.ok(dom === '*' && month === '*' && dow === '*', `目前只支援每日內節奏的 cron 解析（實際: ${cronMatch[1]}）`);
  assert.ok(minute !== undefined, 'cron 需含 minute 欄位');
  assert.ok(
    threshold > cadenceHours,
    `freshness 門檻（${threshold}h）必須大於刷新節奏（${cadenceHours}h），否則快照必然週期性假 stale`,
  );
});

test('#1654: 產生器與 repo 文件不得再宣稱「every 6h / 12h stale」舊節奏', () => {
  for (const p of ['scripts/readiness/generate-live-state-snapshot.mjs', 'README.md', 'docs/README.md', 'docs/NEXT_PHASE_PLAN.md']) {
    const src = read(p);
    assert.doesNotMatch(src, /every 6h/, `${p} 仍宣稱 every 6h`);
    assert.doesNotMatch(src, /threshold:\s*12h|>12h/, `${p} 仍宣稱 12h stale 門檻`);
  }
});

test('#1654: 產生器 freshness_rule 與 checker 門檻數字一致', () => {
  const thresholdMatch = checker.match(/FRESHNESS_THRESHOLD_HOURS\s*=\s*(\d+)/);
  const ruleMatch = generator.match(/stale threshold:\s*(\d+)h/);
  assert.ok(ruleMatch, '產生器必須輸出 stale threshold 宣稱');
  assert.equal(ruleMatch[1], thresholdMatch[1], '產生器宣稱的門檻必須等於 checker 實際門檻');
});
