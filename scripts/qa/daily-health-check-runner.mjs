#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const expectedNodeMajor = 22;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dryRun = process.argv.includes('--dry-run');
const commands = ['npm run lint', 'npm run typecheck', 'npm test'];

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return {
    command: [command, ...args].join(' '),
    exitStatus: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function safeRemoteUrl(remoteUrl) {
  return remoteUrl.replace(/(https?:\/\/)[^/@]+@/i, '$1');
}

function now() {
  return {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  };
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function invalidBaseline(reason, extra = {}) {
  return {
    status: 'SCAN_INVALID_BASELINE',
    productRegressionCandidate: false,
    reason,
    expectedNodeMajor,
    actualNodeMajor: Number(process.versions.node.split('.')[0]),
    ...extra,
    ...now(),
  };
}

let temporaryWorktree;
let payload;
let exitCode = 0;
try {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor !== expectedNodeMajor) {
    payload = invalidBaseline('node_major_mismatch');
    exitCode = 2;
  } else {
    const fetchResult = run('git', ['fetch', '--quiet', 'origin', 'main'], repoRoot);
    if (fetchResult.exitStatus !== 0) {
      payload = invalidBaseline('fetch_origin_main_failed', { fetch: fetchResult.stderr.trim() });
      exitCode = 2;
    } else {
      const fetchedBaseSha = git(['rev-parse', 'origin/main'], repoRoot);
      temporaryWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-health-check-'));
      run('git', ['worktree', 'add', '--detach', temporaryWorktree, 'origin/main'], repoRoot);
      const testedSha = git(['rev-parse', 'HEAD'], temporaryWorktree);
      const dirtyFiles = git(['status', '--porcelain'], temporaryWorktree)
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3).trim())
        .filter(Boolean);
      const alignedWithOriginMain = testedSha === fetchedBaseSha;
      const dirtySummary = { count: dirtyFiles.length, files: dirtyFiles.slice(0, 20) };
      const remoteUrl = safeRemoteUrl(git(['config', '--get', 'remote.origin.url'], repoRoot));
      const provenance = {
        repo: { name: path.basename(remoteUrl, '.git'), url: remoteUrl },
        testedRef: 'main',
        testedBranch: 'main',
        testedSha,
        baseRef: 'origin/main',
        baseSha: fetchedBaseSha,
        alignedWithOriginMain,
        nodeVersion: process.version,
        npmVersion: run('npm', ['--version'], temporaryWorktree).stdout.trim(),
        dirtySummary,
        commands: commands.map((command) => ({ command, exitStatus: null })),
        ...now(),
      };
      const guardFailed = !alignedWithOriginMain || dirtyFiles.length > 0;
      if (guardFailed || dryRun) {
        payload = guardFailed
          ? invalidBaseline('canonical_guard_failed', provenance)
          : { status: 'PREFLIGHT_OK', productRegressionCandidate: false, ...provenance };
      } else {
        const results = commands.map((command) => {
          const [program, ...args] = command.split(' ');
          const result = run(program, args, temporaryWorktree);
          return { command, exitStatus: result.exitStatus };
        });
        const failed = results.some(({ exitStatus }) => exitStatus !== 0);
        payload = { status: failed ? 'CHECKS_FAILED' : 'CHECKS_PASSED', productRegressionCandidate: failed, ...provenance, commands: results };
        exitCode = failed ? 1 : 0;
      }
    }
  }
} catch (error) {
  payload = invalidBaseline('runner_preflight_error', { error: error.message });
  exitCode = 2;
} finally {
  if (temporaryWorktree) {
    run('git', ['worktree', 'remove', '--force', temporaryWorktree], repoRoot);
    fs.rmSync(temporaryWorktree, { recursive: true, force: true });
  }
}

emit(payload);
process.exitCode = exitCode;
