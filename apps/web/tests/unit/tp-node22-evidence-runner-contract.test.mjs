import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const readSource = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')
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

test('Node 22 evidence runner source locks the canonical real-binary toolchain', () => {
  const runner = readSource('scripts/toolchain/tp-node22.sh')

  assert.match(runner, /v22\.23\.1/)
  assert.match(runner, /bin\/node/)
  assert.match(runner, /bin\/npm/)
  assert.match(runner, /bin\/npx/)
  assert.match(runner, /realpath/)
  assert.match(runner, /process\.execPath/)
  assert.match(runner, /PATH=.*\/bin/)
  assert.match(runner, /--check/)
  assert.match(runner, /exec "\$@"/)
  assert.doesNotMatch(runner, /npx\s+-y\s+node@22/)
  assert.doesNotMatch(runner, /exec -a/)
  assert.doesNotMatch(runner, /\/tmp\/tp-node22-wrapper/)
})

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

test('formal check runner uses the Node 22 entry point and explicit TAP', () => {
  const checks = readSource('.claude/hooks/run-checks.sh')

  assert.match(checks, /scripts\/toolchain\/tp-node22\.sh/)
  assert.match(checks, /--check/)
  assert.match(checks, /--test-reporter=tap/)
  assert.ok(checks.includes('^# tests [0-9]+'))
})

test('Claude permissions keep formal checks and reject bare Node test entries', () => {
  const settings = JSON.parse(readSource('.claude/settings.json'))
  const allow = settings.permissions.allow

  assert.ok(allow.includes('Bash(.claude/hooks/run-checks.sh:*)'))
  assert.ok(allow.includes('Bash(scripts/toolchain/tp-node22.sh:*)'))
  assert.ok(!allow.includes('Bash(node --test:*)'))
  assert.ok(!allow.includes('Bash(npm test:*)'))
  assert.ok(!allow.includes('Bash(npm run typecheck:*)'))
  assert.ok(!allow.includes('Bash(npm run lint:*)'))
})
