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
  const resultsIndex = runnerSource.indexOf('const results =');
  assert.match(runnerSource.slice(resultsIndex), /failureDetail\(result\)/, '健檢結果必須呼叫共用輸出尾段收集器');
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


// 全部程序與 filesystem 副作用均使用 fake；不啟動 npm、git 或 runner 子程序。
import vm from 'node:vm';
import os from 'node:os';

function simulate({ checks = [], install, restore, dirtyAfter = '', worktree, dryRun = false } = {}, source = runnerSource) {
  const calls = [];
  const output = [];
  let statusReads = 0;
  let checkIndex = 0;
  const ok = { status: 0, stdout: '', stderr: '' };
  const fakeProcess = {
    argv: dryRun ? ['--dry-run'] : [], versions: { node: '22.23.1' }, version: 'v22.23.1',
    env: { NODE_ENV: 'production', SENTINEL: 'retained' }, stdout: { write: (text) => output.push(text) },
  };
  const spawnSync = (program, args, options) => {
    calls.push({ program, args, options });
    if (args[0] === 'install') return { ...ok, ...install };
    if (args[0] === 'checkout') return { ...ok, ...restore };
    if (args[0] === 'worktree' && args[1] === 'add') return { ...ok, ...worktree };
    if (program === 'npm' && args[0] === '--version') return { ...ok, stdout: '10.9.0' };
    if (program === 'npm') return { ...ok, ...checks[checkIndex++] };
    return ok;
  };
  const execFileSync = (program, args) => {
    assert.equal(program, 'git');
    if (args[0] === 'rev-parse') return 'abc123\n';
    if (args[0] === 'config') return 'https://github.com/example/tour-platform.git\n';
    if (args[0] === 'status') return statusReads++ === 0 ? '' : dirtyAfter;
    throw new Error(`Unexpected git command: ${args}`);
  };
  const executable = source.replace(/^import .*;\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify('file:///fake/repo/scripts/qa/daily-health-check-runner.mjs'));
  vm.runInNewContext(executable, {
    fs: { mkdtempSync: () => '/fake/worktree', rmSync: () => {} }, os, path, fileURLToPath,
    spawnSync, execFileSync, process: fakeProcess, Intl, Date,
  });
  assert.equal(output.length, 1);
  return { payload: JSON.parse(output[0]), exitCode: fakeProcess.exitCode, calls };
}

for (const code of ['ENOBUFS', 'ENOENT', 'EACCES']) {
  test(`#1670: ${code} 是執行環境失敗，保留 null status 與診斷`, () => {
    const { payload, exitCode } = simulate({ checks: [{ status: null, error: { code }, stderr: 'diagnostic' }] });
    assert.equal(payload.status, 'SCAN_INVALID_BASELINE');
    assert.equal(payload.reason, 'check_execution_failed');
    assert.equal(payload.productRegressionCandidate, false);
    assert.equal(exitCode, 2);
    assert.equal(payload.commands[0].exitStatus, null);
    assert.equal(payload.commands[0].spawnError, code);
    assert.equal(payload.commands[0].outputTail, 'diagnostic');
  });
}

for (const outcome of [{ status: null, signal: 'SIGTERM' }, { status: null }, { status: 0, error: { code: 'ENOBUFS' } }, { status: 1, signal: 'SIGKILL' }]) {
  test(`#1670: 不完整或中斷執行 ${JSON.stringify(outcome)} 不標產品回歸`, () => {
    const { payload, exitCode } = simulate({ checks: [outcome] });
    assert.equal(payload.status, 'SCAN_INVALID_BASELINE');
    assert.equal(payload.productRegressionCandidate, false);
    assert.equal(exitCode, 2);
    assert.equal(payload.commands[0].signal, outcome.signal ?? null);
  });
}

test('#1670: 真正非零退出保留 CHECKS_FAILED 與輸出尾段', () => {
  const { payload, exitCode } = simulate({ checks: [{ status: 1, stdout: 'x'.repeat(4000), stderr: 'failure' }] });
  assert.equal(payload.status, 'CHECKS_FAILED');
  assert.equal(payload.productRegressionCandidate, true);
  assert.equal(exitCode, 1);
  assert.equal(payload.commands[0].outputTail.length, 3000);
  assert.ok(payload.commands[0].outputTail.endsWith('failure'));
});

test('#1670: 全部成功，安裝與檢查 env、buffer、順序正確', () => {
  const { payload, exitCode, calls } = simulate();
  assert.equal(payload.status, 'CHECKS_PASSED');
  assert.equal(payload.productRegressionCandidate, false);
  assert.equal(exitCode, 0);
  const npm = calls.filter(({ program, args }) => program === 'npm' && args[0] !== '--version');
  assert.deepEqual(npm.map(({ args }) => Array.from(args).join(' ')), ['install --no-audit --no-fund --ignore-scripts', 'run lint', 'run typecheck', 'test']);
  for (const { options } of npm) {
    assert.equal(options.env.NODE_ENV, undefined);
    assert.equal(options.env.SENTINEL, 'retained');
    assert.equal(options.maxBuffer, 64 * 1024 * 1024);
  }
});

test('#1670: 混合真失敗與 spawn 失敗，以無效 baseline 優先，保留全部結果', () => {
  const { payload } = simulate({ checks: [{ status: 1 }, { status: null, error: { code: 'ENOENT' } }, { status: 0 }] });
  assert.equal(payload.status, 'SCAN_INVALID_BASELINE');
  assert.equal(payload.productRegressionCandidate, false);
  assert.deepEqual(payload.commands.map(({ exitStatus }) => exitStatus), [1, null, 0]);
});

for (const restore of [{ status: 1 }, { status: null, error: { code: 'EACCES' } }, { status: null, signal: 'SIGTERM' }]) {
  test(`#1670: lockfile 還原失敗阻擋檢查 ${JSON.stringify(restore)}`, () => {
    const { payload, exitCode, calls } = simulate({ restore });
    assert.equal(payload.reason, 'lockfile_restore_failed');
    assert.equal(payload.productRegressionCandidate, false);
    assert.equal(exitCode, 2);
    assert.equal(calls.filter(({ program, args }) => program === 'npm' && ['run', 'test'].includes(args[0])).length, 0);
  });
}

for (const install of [{ status: 1 }, { status: null, error: { code: 'ENOENT' } }, { status: null, signal: 'SIGTERM' }]) {
  test(`#1670: install 失敗保留原始狀態且不執行檢查 ${JSON.stringify(install)}`, () => {
    const { payload, exitCode, calls } = simulate({ install, restore: { status: 1 } });
    assert.equal(payload.reason, 'dependency_install_failed');
    assert.equal(payload.install.exitStatus, install.status);
    assert.equal(payload.restore.exitStatus, 1);
    assert.equal(payload.productRegressionCandidate, false);
    assert.equal(exitCode, 2);
    assert.equal(calls.some(({ args }) => args[0] === 'test' || args[0] === 'run'), false);
  });
}

test('#1670: 安裝後仍有其他 dirty 檔，不可進行產品判定', () => {
  const { payload, exitCode, calls } = simulate({ dirtyAfter: ' M package.json\n' });
  assert.equal(payload.reason, 'postinstall_dirty_worktree');
  assert.equal(payload.productRegressionCandidate, false);
  assert.equal(exitCode, 2);
  assert.equal(calls.some(({ args }) => args[0] === 'test' || args[0] === 'run'), false);
});

test('#1670: worktree 建立失敗立即中止', () => {
  const { payload, calls } = simulate({ worktree: { status: null, error: { code: 'EACCES' } } });
  assert.equal(payload.status, 'SCAN_INVALID_BASELINE');
  assert.match(payload.error, /worktree_add_failed/);
  assert.equal(calls.some(({ program }) => program === 'npm'), false);
});

test('#1670: dry-run 不安裝也不執行健檢', () => {
  const { payload, exitCode, calls } = simulate({ dryRun: true });
  assert.equal(payload.status, 'PREFLIGHT_OK');
  assert.equal(exitCode, 0);
  assert.equal(calls.some(({ args }) => ['install', 'run', 'test', 'checkout'].includes(args[0])), false);
});
