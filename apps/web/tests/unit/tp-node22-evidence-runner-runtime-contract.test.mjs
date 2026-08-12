import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const runnerPath = resolve(repoRoot, 'scripts/toolchain/tp-node22.sh')
const dispatchRejection = /^tp-node22 preflight failed: unsupported npm\/npx command$/m

function runRunner(args) {
  const cache = mkdtempSync(resolve(tmpdir(), 'tp-node22-npm-cache-'))

  try {
    return spawnSync(runnerPath, ['--', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NPM_CONFIG_CACHE: cache,
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
        NPM_CONFIG_OFFLINE: 'true',
        npm_config_cache: cache,
        npm_config_ignore_scripts: 'true',
        npm_config_offline: 'true',
      },
      timeout: 30_000,
    })
  } finally {
    rmSync(cache, { force: true, recursive: true })
  }
}

test('Node 22 evidence runner permits only the documented npm and npx forms', () => {
  const safeCommands = [
    ['npm', '--version'],
    ['npm', 'test'],
    ['npm', 'run', 'typecheck'],
    ['npx', '--version'],
  ]

  for (const args of safeCommands) {
    const result = runRunner(args)
    const output = `${result.stdout}${result.stderr}`

    assert.equal(result.error, undefined, `${args.join(' ')} must not time out`)
    assert.notEqual(result.status, null, `${args.join(' ')} must execute`)
    assert.doesNotMatch(output, dispatchRejection)
  }
})

test('Node 22 evidence runner rejects runtime-replacement npm and npx forms before execution', () => {
  const dangerousCommands = [
    ['npx', '-y', 'node@22', '--version'],
    ['npx', '--yes', 'node@22', '--version'],
    ['npm', 'exec', '--package=node@22', 'node', '--version'],
    ['npm', 'exec', '--package', 'node@22', 'node', '--version'],
  ]

  for (const args of dangerousCommands) {
    const result = runRunner(args)

    assert.equal(result.error, undefined, `${args.join(' ')} must not time out`)
    assert.notEqual(result.status, 0, `${args.join(' ')} must fail closed`)
    assert.equal(result.stdout, '', `${args.join(' ')} must not produce substitute-process output`)
    assert.match(result.stderr, dispatchRejection, `${args.join(' ')} must be rejected before npm/npx executes`)
  }
})
