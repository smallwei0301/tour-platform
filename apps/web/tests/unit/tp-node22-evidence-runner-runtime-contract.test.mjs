import { isExpectedAbortedDevDiagnostic } from '../../../../scripts/testing/policy-fixture-network.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, mkdirSync, existsSync, chmodSync, copyFileSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { originalLoaderSource } from '../../../../scripts/build/prepare-next-google-font-compat.mjs'

const repoRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const runnerPath = resolve(repoRoot, 'scripts/toolchain/tp-node22.sh')
const dispatchRejection = /^tp-node22 preflight failed: unsupported npm\/npx command$/m
const fontHelperPath = 'scripts/build/prepare-next-google-font-compat.mjs'
const nextRoot = dirname(createRequire(import.meta.url).resolve('next/package.json'))
const fontVendorRoot = 'dist/compiled/@next/font/dist'
const fontLoaderPath = `${fontVendorRoot}/google/loader.js`

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
  for (const path of [fontHelperPath, 'scripts/testing/policy-fixture-network.mjs', 'apps/web/e2e/issue1882-policy-display.spec.ts', 'scripts/testing/fixture-child-diagnostics.mjs', 'scripts/toolchain/offline-node-guard.cjs', 'scripts/check-lint-node.mjs', 'scripts/toolchain/tp-node22.sh', 'apps/web/playwright.config.ts', 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts', 'package.json', 'apps/web/package.json']) {
    const destination = resolve(root, path)
    mkdirSync(resolve(destination, '..'), { recursive: true })
    copyFileSync(resolve(repoRoot, path), destination)
  }
  return root
}
function fontVendorFixture(root) {
  // Copy real installed vendor bytes into an owned package; never patch shared Next.
  const target = resolve(root, 'node_modules/next')
  for (const path of ['package.json', `${fontVendorRoot}/fontkit/index.js`, fontLoaderPath]) {
    const destination = resolve(target, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(resolve(nextRoot, path), destination)
  }
  const loader = resolve(target, fontLoaderPath)
  writeFileSync(loader, originalLoaderSource(readFileSync(loader, 'utf8')))
  return { target, loader }
}
function preflight(root, args = e2eArgs, hostile = {}) {
  return spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--preflight-e2e', '--', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...hostile },
  })
}
test('exact reviewed E2E preflight verifies distinct empty configs and safe npm startup without E2E/browser, discarding hostile caller environment', () => {
  const root = e2eFixture()
  try {
    const result = preflight(root, e2eArgs, { NODE_OPTIONS: '--require=/missing-hostile-module', npm_config_script_shell: '/missing-shell', npm_config_userconfig: '/missing-config', CI: '1', SUPABASE_SERVICE_ROLE_KEY: 'sentinel-secret' })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /no E2E execution; sanitized environment; distinct empty npm configs; npm startup verified/)
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
    assert.match(result.stdout, /no E2E execution; sanitized environment; distinct empty npm configs; npm startup verified/)
    assert.equal(existsSync(startupMarker), false, 'caller BASH_ENV must not run before validation')
    assert.equal(existsSync(interpreterMarker), false, 'caller PATH must not choose the interpreter')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('canonical lint/build preflight accepts exact scripts in sanitized offline environment', () => {
  const root = e2eFixture()
  try {
    for (const target of ['lint', 'build']) {
      const result = spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--preflight-ci', '--', 'npm', 'run', target], {
        cwd: root, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, NODE_OPTIONS: '--require=/missing-hostile', SUPABASE_SERVICE_ROLE_KEY: 'sentinel-secret' },
      })
      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /CI preflight passed/)
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sentinel-secret/)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

const ciArgs = target => ['npm', 'run', target]
function ciPreflight(root, args = ciArgs('build'), hostile = {}) {
  return spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--preflight-ci', '--', ...args], {
    cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...hostile },
  })
}
test('CI rejects argv additions, workspace substitutions, package lifecycle/script drift and guard integrity drift', () => {
  for (const args of [['npm', 'run', 'lint', '--'], ['npm', 'run', 'build', '-w', '@tour/web'], ['node', '--version'], ['npm', 'run', 'other']]) {
    const root = e2eFixture()
    try { assert.notEqual(ciPreflight(root, args).status, 0) } finally { rmSync(root, { recursive: true, force: true }) }
  }
  const changes = [
    ...['prelint', 'postlint', 'prebuild', 'postbuild', 'pre', 'post', 'build', 'lint'].flatMap(key => ['package.json', 'apps/web/package.json'].map(path => root => {
      const file = resolve(root, path), p = JSON.parse(readFileSync(file)); p.scripts[key] = 'node evil'; writeFileSync(file, JSON.stringify(p))
    })),
    ...['scripts/toolchain/offline-node-guard.cjs', 'scripts/check-lint-node.mjs'].flatMap(path => [
      root => writeFileSync(resolve(root, path), 'tampered'),
      root => { unlinkSync(resolve(root, path)); symlinkSync(resolve(repoRoot, path), resolve(root, path)) },
    ]),
    ...['.npmrc', 'apps/.npmrc', 'apps/web/.npmrc'].map(path => root => writeFileSync(resolve(root, path), 'offline=false')),
  ]
  for (const change of changes) {
    const root = e2eFixture()
    try { change(root); const r = ciPreflight(root); assert.notEqual(r.status, 0); assert.equal(r.stdout, '') } finally { rmSync(root, { recursive: true, force: true }) }
  }
})
test('CI accepts only the exact guarded font build command; old, altered and extended commands fail closed', () => {
  const exact = 'node ../../scripts/build/prepare-next-google-font-compat.mjs && next build'
  const alternatives = [
    'next build',
    'node ../../scripts/build/other.mjs && next build',
    'node ../../scripts/build/prepare-next-google-font-compat.mjs; next build',
    'node ../../scripts/build/prepare-next-google-font-compat.mjs || next build',
    `${exact} --no-lint`, `${exact} && node extra`, `${exact} || next build`,
    `NODE_ENV=production ${exact}`, `env ${exact}`, ` ${exact}`, `${exact} `,
    'npm exec next build',
  ]
  for (const command of alternatives) {
    const root = e2eFixture()
    try {
      const file = resolve(root, 'apps/web/package.json'), pkg = JSON.parse(readFileSync(file))
      pkg.scripts.build = command; writeFileSync(file, JSON.stringify(pkg))
      const result = ciPreflight(root)
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0, command)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /CI package contract rejected/)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})
test('CI rejects missing, tampered and symlinked font helpers before lint or build executes', () => {
  const changes = [
    root => unlinkSync(resolve(root, fontHelperPath)),
    root => writeFileSync(resolve(root, fontHelperPath), 'tampered'),
    root => { const path = resolve(root, fontHelperPath); unlinkSync(path); symlinkSync(resolve(repoRoot, fontHelperPath), path) },
    root => { rmSync(resolve(root, 'scripts/build'), { recursive: true }); symlinkSync(resolve(repoRoot, 'scripts/build'), resolve(root, 'scripts/build')) },
  ]
  for (const change of changes) {
    const root = e2eFixture()
    try {
      change(root)
      for (const target of ['lint', 'build']) {
        const result = ciPreflight(root, ciArgs(target))
        assert.equal(result.error, undefined)
        assert.notEqual(result.status, 0)
        assert.equal(result.stdout, '')
        assert.match(result.stderr, /missing or noncanonical CI file|font compatibility helper digest mismatch/)
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})
test('CI actual execution denies TCP/fetch/DNS/UDP and retains guard in empty-env child and empty-execArgv worker; temp configs are cleaned', () => {
  const root = e2eFixture()
  const sourceLoader = readFileSync(resolve(nextRoot, fontLoaderPath), 'utf8')
  try {
    const vendor = fontVendorFixture(root)
    const original = readFileSync(vendor.loader, 'utf8')
    const bin = resolve(root, 'apps/web/node_modules/.bin'); mkdirSync(bin, { recursive: true })
    const next = resolve(bin, 'next')
    writeFileSync(next, `#!/usr/bin/env node
const assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['build']);
const loader = require('node:fs').readFileSync(require('node:path').resolve('../../node_modules/next/${fontLoaderPath}'), 'utf8');
assert.ok(loader.includes('const ext = tourGoogleFontExtension(googleFontFileUrl, fontFileBuffer);'));
const net = require('node:net');
for (const attempt of [() => net.connect(9, '127.0.0.1'), () => fetch('https://example.invalid'), () => require('node:dns').lookup('example.invalid', () => {}), () => require('node:dgram').createSocket('udp4')]) assert.throws(attempt, /offline outbound blocked/);
assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
const cp = require('node:child_process');
const child = cp.spawnSync(process.execPath, ['-e', "try { require('node:net').connect(9,'127.0.0.1'); process.exit(7); } catch(e) { console.log(e.message); }"], { env: {}, encoding: 'utf8' });
assert.equal(child.status, 0); assert.match(child.stdout, /offline outbound blocked/);
const { Worker } = require('node:worker_threads');
const worker = new Worker("const {parentPort}=require('node:worker_threads'); try { require('node:net').connect(9,'127.0.0.1'); parentPort.postMessage('ESCAPE'); } catch(e) { parentPort.postMessage(e.message); }", { eval: true, env: {}, execArgv: [] });
worker.on('message', message => { assert.match(message, /offline outbound blocked/); console.log('NETWORK_GUARD_OK'); console.log('OWNED_TEMP=' + process.env.TMPDIR); });
`)
    chmodSync(next, 0o755)
    for (const status of ['patched', 'already-patched']) {
      const result = spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--', ...ciArgs('build')], {
        cwd: root, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, NODE_OPTIONS: '--require=/missing-hostile', SUPABASE_SERVICE_ROLE_KEY: 'sentinel-secret', npm_config_script_shell: '/missing-shell' },
      })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
      assert.match(result.stdout, new RegExp(`Next Google-font compatibility: ${status}`))
      assert.match(result.stdout, /NETWORK_GUARD_OK/)
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sentinel-secret/)
      assert.notEqual(readFileSync(vendor.loader, 'utf8'), original)
      assert.equal(originalLoaderSource(readFileSync(vendor.loader, 'utf8')), original)
      const temp = result.stdout.match(/OWNED_TEMP=(.*)/)?.[1]
      assert.ok(temp); assert.equal(existsSync(temp), false)
      assert.equal(readFileSync(resolve(nextRoot, fontLoaderPath), 'utf8'), sourceLoader)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('real font helper rejects incomplete or changed vendor fixtures before the next probe executes', () => {
  const changes = [
    ...['package.json', `${fontVendorRoot}/fontkit/index.js`, fontLoaderPath].map(path => root => unlinkSync(resolve(root, 'node_modules/next', path))),
    root => { const file = resolve(root, 'node_modules/next/package.json'), pkg = JSON.parse(readFileSync(file)); pkg.version = '15.5.15'; writeFileSync(file, JSON.stringify(pkg)) },
    ...[`${fontVendorRoot}/fontkit/index.js`, fontLoaderPath].map(path => root => writeFileSync(resolve(root, 'node_modules/next', path), 'tampered')),
  ]
  const sourceLoader = readFileSync(resolve(nextRoot, fontLoaderPath), 'utf8')
  for (const change of changes) {
    const root = e2eFixture()
    try {
      fontVendorFixture(root); change(root)
      const bin = resolve(root, 'apps/web/node_modules/.bin'); mkdirSync(bin, { recursive: true })
      const next = resolve(bin, 'next')
      writeFileSync(next, '#!/usr/bin/env node\nconsole.log("UNEXPECTED_NEXT_EXECUTION");\n'); chmodSync(next, 0o755)
      assert.equal(ciPreflight(root).status, 0, 'read-only preflight verifies source contracts, not vendor execution')
      const result = spawnSync(resolve(root, 'scripts/toolchain/tp-node22.sh'), ['--', ...ciArgs('build')], {
        cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env },
      })
      assert.equal(result.error, undefined)
      assert.notEqual(result.status, 0)
      assert.match(`${result.stdout}${result.stderr}`, /MODULE_NOT_FOUND|ENOENT|NEXT_FONT_COMPAT_UNSUPPORTED_/)
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /UNEXPECTED_NEXT_EXECUTION/)
      assert.equal(readFileSync(resolve(nextRoot, fontLoaderPath), 'utf8'), sourceLoader)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})
test('policy E2E pin accepts only exact new spec and rejects tampered or symlinked spec/diagnostic dependency', () => {
  const args = e2eArgs.map(arg => arg.includes('upcoming-schedules') ? 'e2e/issue1882-policy-display.spec.ts' : arg)
  const root = e2eFixture()
  try { assert.equal(preflight(root, args).status, 0) } finally { rmSync(root, { recursive: true, force: true }) }
  for (const path of ['scripts/testing/policy-fixture-network.mjs', 'apps/web/e2e/issue1882-policy-display.spec.ts', 'scripts/testing/fixture-child-diagnostics.mjs']) {
    for (const symlink of [false, true]) {
      const root = e2eFixture()
      try {
        if (symlink) { unlinkSync(resolve(root, path)); symlinkSync(resolve(repoRoot, path), resolve(root, path)) } else writeFileSync(resolve(root, path), 'tamper')
        assert.notEqual(preflight(root, args).status, 0)
      } finally { rmSync(root, { recursive: true, force: true }) }
    }
  }
})

test('only exact loopback query-free dev diagnostic POST is classified as expected aborted; business/remote/variant requests remain failures', () => {
  const exact = 'http://127.0.0.1:3108/__nextjs_original-stack-frames'
  assert.equal(isExpectedAbortedDevDiagnostic(exact, 'POST'), true)
  for (const [url, method] of [
    ['http://127.0.0.1:3108/booking/fixture', 'POST'],
    ['http://127.0.0.1:3108/api/v2/bookings', 'POST'],
    ['http://127.0.0.1:3108/unknown', 'POST'],
    ['https://remote.invalid/__nextjs_original-stack-frames', 'POST'],
    [exact + '?query=1', 'POST'], [exact + '#fragment', 'POST'],
    [exact + '/', 'POST'], [exact, 'GET'], [exact, 'DELETE'], ['invalid', 'POST'],
  ]) assert.equal(isExpectedAbortedDevDiagnostic(url, method), false, `${method} ${url}`)
})
