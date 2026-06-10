import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This file lives at apps/web/tests/helpers/spawn-node.mjs → apps/web is two up.
export const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * #1281 — Shared spawn helper for child-process specs.
 *
 * Several security/middleware specs verify behavior by spawning a Node ESM
 * child that imports `next/server.js`, `middleware.ts`, or a `src/lib/*` module
 * and prints a result. Those imports resolve bare specifiers like `next`, which
 * the repo hoists to the workspace-root `node_modules`. If the child process
 * inherits an arbitrary cwd (e.g. `npm test` invoked from the repo root, a CI
 * shard, or any nested dir), bare-specifier resolution can walk a different
 * node_modules chain and fail with
 *   `ERR_MODULE_NOT_FOUND: Cannot find package 'next'`.
 *
 * Pinning `cwd` to `apps/web` (WEB_ROOT) makes resolution deterministic
 * regardless of the invoking cwd: the chain always walks apps/web → repo root
 * `node_modules`, where `next` is hoisted. No secrets are introduced here — the
 * caller supplies its own (test-only) env.
 *
 * @param {string} script - ESM source passed to `node -e`.
 * @param {{ env?: NodeJS.ProcessEnv, nodeArgs?: string[] }} [options]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
export function spawnNodeEsm(script, { env, nodeArgs = ['--experimental-strip-types'] } = {}) {
  return spawnSync(
    process.execPath,
    [...nodeArgs, '--input-type=module', '-e', script],
    {
      cwd: WEB_ROOT,
      env: env ?? process.env,
      encoding: 'utf8',
    },
  );
}
