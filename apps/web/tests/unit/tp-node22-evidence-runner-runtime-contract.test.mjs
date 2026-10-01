import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, mkdirSync, existsSync, chmodSync, copyFileSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs'
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
      timeout: 120_000,
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

const e2eArgs = ['npm', 'run', 'test:e2e', '-w', '@tour/web', '--', 'e2e/issue1882-upcoming-schedules.spec.ts']
function e2eFixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'tp-node22-e2e-contract-'))
  for (const path of ['scripts/toolchain/tp-node22.sh', 'apps/web/playwright.config.ts', 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts', 'package.json', 'apps/web/package.json']) {
    const destination = resolve(root, path)
    mkdirSync(resolve(destination, '..'), { recursive: true })
    copyFileSync(resolve(repoRoot, path), destination)
  }
  return root
}
function preflight(root, args = e2eArgs, hostile = {}) {
  return spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--preflight-e2e', '--', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...hostile },
  })
}
test('exact reviewed E2E preflight passes without starting npm or browser and discards hostile caller environment', () => {
  const root = e2eFixture()
  try {
    const result = preflight(root, e2eArgs, { NODE_OPTIONS: '--require=/missing-hostile-module', npm_config_script_shell: '/missing-shell', npm_config_userconfig: '/missing-config', CI: '1', SUPABASE_SERVICE_ROLE_KEY: 'sentinel-secret' })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /no execution; sanitized environment/)
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sentinel-secret/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('E2E preflight rejects extra, missing, different workspace/spec and replacement runtime argv', () => {
  const root = e2eFixture()
  try {
    for (const args of [[...e2eArgs, '--list'], e2eArgs.slice(0, -1), e2eArgs.map(x => x === '@tour/web' ? '@tour/other' : x), e2eArgs.map(x => x.startsWith('e2e/') ? 'e2e/other.spec.ts' : x), ['npx', '-y', 'node@22', '--version'], ['node', '--version']]) {
      const result = preflight(root, args)
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0, args.join(' '))
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /preflight failed/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('E2E preflight rejects missing files, symlink escape, reviewed byte tampering, scripts, lifecycle and npmrc', () => {
  const mutations = [
    root => unlinkSync(resolve(root, 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts')),
    root => { const path = resolve(root, 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts'); unlinkSync(path); symlinkSync(resolve(repoRoot, 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts'), path) },
    ...['apps/web/playwright.config.ts', 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts'].map(path => root => writeFileSync(resolve(root, path), 'tampered')),
    ...[['apps/web/package.json', 'test:e2e', 'node replacement'], ['apps/web/package.json', 'pretest:e2e', 'evil'], ['apps/web/package.json', 'posttest:e2e', 'evil'], ['package.json', 'pretest:e2e', 'evil'], ['package.json', 'posttest:e2e', 'evil']].map(([path, key, value]) => root => { const file = resolve(root, path), p = JSON.parse(readFileSync(file)); p.scripts[key] = value; writeFileSync(file, JSON.stringify(p)) }),
    ...[['package.json', 'name', 'other'], ['package.json', 'workspaces', ['other/*']], ['apps/web/package.json', 'name', '@tour/other']].map(([path, key, value]) => root => { const file = resolve(root, path), p = JSON.parse(readFileSync(file)); p[key] = value; writeFileSync(file, JSON.stringify(p)) }),
    ...['.npmrc', 'apps/.npmrc', 'apps/web/.npmrc'].map(path => root => writeFileSync(resolve(root, path), 'script-shell=/missing-shell')),
  ]
  for (const mutate of mutations) {
    const root = e2eFixture()
    try {
      mutate(root)
      const result = preflight(root)
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /preflight failed/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test('E2E entry ignores BASH_ENV startup and caller PATH interpreter replacement before its first command', () => {
  const root = e2eFixture()
  try {
    const startup = resolve(root, 'startup.sh'), startupMarker = resolve(root, 'startup-marker')
    const fakeBin = resolve(root, 'fake-bin'), interpreterMarker = resolve(root, 'interpreter-marker')
    mkdirSync(fakeBin)
    writeFileSync(startup, `printf startup > '${startupMarker}'\n`)
    const fakeBash = resolve(fakeBin, 'bash')
    writeFileSync(fakeBash, `#!/bin/sh\nprintf replacement > '${interpreterMarker}'\nexit 99\n`)
    chmodSync(fakeBash, 0o755)
    const result = preflight(root, e2eArgs, { BASH_ENV: startup, PATH: `${fakeBin}:/usr/bin:/bin` })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /no execution; sanitized environment/)
    assert.equal(existsSync(startupMarker), false, 'caller BASH_ENV must not run before validation')
    assert.equal(existsSync(interpreterMarker), false, 'caller PATH must not choose the interpreter')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
