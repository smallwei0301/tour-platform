import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const runnerPath = path.join(repoRoot, 'scripts/qa/daily-health-check-runner.mjs');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

test('#1670: 臨時 worktree 在健檢指令前必須先安裝依賴', () => {
  const installIndex = runnerSource.indexOf("['install', '--no-audit', '--no-fund', '--ignore-scripts']");
  const resultsIndex = runnerSource.indexOf('const results =');
  assert.notEqual(installIndex, -1, 'runner 必須包含 npm install 步驟');
  assert.notEqual(resultsIndex, -1);
  assert.ok(installIndex < resultsIndex, 'npm install 必須在 lint/typecheck/test 之前執行');
});

test('#1670: 安裝失敗歸類為 SCAN_INVALID_BASELINE，不得標成產品回歸', () => {
  assert.match(runnerSource, /dependency_install_failed/);
  const installFailIndex = runnerSource.indexOf('dependency_install_failed');
  const invalidBaselineCall = runnerSource.slice(installFailIndex - 40, installFailIndex);
  assert.match(invalidBaselineCall, /invalidBaseline\(/, '安裝失敗必須走 invalidBaseline 分類');
});

test('#1670: 安裝與健檢指令都必須清除 NODE_ENV（避免漏裝 devDependencies）', () => {
  assert.match(runnerSource, /delete installEnv\.NODE_ENV/);
  const guardIndex = runnerSource.indexOf('canonical_guard_failed');
  const envIndex = runnerSource.indexOf('delete installEnv.NODE_ENV');
  assert.ok(envIndex > guardIndex, 'NODE_ENV 清除發生在 guard 通過之後的執行分支');
});

test('#1670: 健檢指令失敗時必須保留輸出尾段供診斷', () => {
  assert.match(runnerSource, /outputTail/);
  const tailIndex = runnerSource.indexOf('outputTail');
  const resultsIndex = runnerSource.indexOf('const results =');
  assert.ok(tailIndex > resultsIndex, '輸出尾段收集發生在健檢指令執行內');
});

test('#1670: spawnSync maxBuffer 必須大於 npm test 的 TAP 輸出（預設 1MB 會 ENOBUFS 誤判失敗）', () => {
  const match = runnerSource.match(/maxBuffer:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  assert.ok(match, 'run() 必須顯式設定 maxBuffer');
  assert.ok(Number(match[1]) >= 16, `maxBuffer 至少 16MB（實際: ${match[1]}MB）`);
  assert.match(runnerSource, /spawnError/, 'spawn 層錯誤（如 ENOBUFS）必須被記錄，不可與指令失敗混淆');
});

test('#1670: npm install 產生的 yarn.lock churn 必須在健檢前還原', () => {
  const checkoutIndex = runnerSource.indexOf("['checkout', '--', 'yarn.lock']");
  const resultsIndex = runnerSource.indexOf('const results =');
  assert.notEqual(checkoutIndex, -1, 'runner 必須還原 yarn.lock');
  assert.ok(checkoutIndex < resultsIndex, 'yarn.lock 還原必須在健檢指令之前');
});
