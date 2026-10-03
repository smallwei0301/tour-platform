import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, cpSync, mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const runner = resolve(repo, 'scripts/toolchain/tp-node22.sh')
const provision = resolve(repo, 'scripts/toolchain/provision-node22.23.1.sh')
const approved = process.env.TP_NODE22_ROOT
function run(script, args, env = {}) {
  const result = spawnSync(script, args, { cwd: repo, encoding: 'utf8',
    env: { ...process.env, ...env }, timeout: 30_000 })
  assert.equal(result.error, undefined)
  return result
}

test('workspace official artifact executes allowed gate and rejects malformed gate', () => {
  assert.ok(approved, 'run this contract through the workspace canonical runner')
  for (const args of [['--check'], ['--', 'node', '--version'], ['--', 'npm', '--version'], ['--', 'npx', '--version']]) {
    assert.equal(run(runner, args).status, 0, args.join(' '))
  }
  for (const args of [[], ['--'], ['--check', 'node'], ['--', 'bash'], ['--', 'npm', 'exec', 'node']]) {
    assert.notEqual(run(runner, args).status, 0, args.join(' '))
  }
})

test('workspace rejects impostor version, changed artifact, escaped root and symlink', () => {
  const scratch = mkdtempSync(resolve(tmpdir(), 'tp-node22-cloud-'))
  try {
    const root = resolve(scratch, 'runtime')
    cpSync(approved, root, { recursive: true, dereference: false })
    const node = resolve(root, 'bin/node')
    writeFileSync(node, '#!/bin/sh\necho v22.23.1\n', { mode: 0o755 })
    assert.match(run(runner, ['--check'], { TP_NODE22_ROOT: root }).stderr, /file digest mismatch/)
    writeFileSync(node, '#!/bin/sh\necho v20.0.0\n', { mode: 0o755 })
    assert.notEqual(run(runner, ['--check'], { TP_NODE22_ROOT: root }).status, 0)
    rmSync(node)
    assert.match(run(runner, ['--check'], { TP_NODE22_ROOT: root }).stderr, /file digest mismatch/)
    cpSync(resolve(approved, 'bin/node'), node)
    rmSync(resolve(root, 'bin/npm'))
    symlinkSync('/usr/bin/node', resolve(root, 'bin/npm'))
    assert.match(run(runner, ['--check'], { TP_NODE22_ROOT: root }).stderr, /symlink digest mismatch/)
    symlinkSync(approved, resolve(scratch, 'alias'))
    assert.match(run(runner, ['--check'], { TP_NODE22_ROOT: resolve(scratch, 'alias') }).stderr, /must be canonical/)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
})

test('provision rejects wrong archive hash before installing a workspace runtime', () => {
  const scratch = mkdtempSync('/workspace/tp-node22-archive-')
  try {
    const archive = resolve(scratch, 'wrong.tar.xz')
    writeFileSync(archive, 'untrusted archive')
    const result = run(provision, ['--operator-approved'], {
      TP_NODE22_ROOT: resolve(scratch, 'toolchains/node/22.23.1'), TP_NODE22_ARCHIVE: archive,
    })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /SHA-256 mismatch/)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
})

test('provision rejects broad targets and preserves unrelated existing target before staging', () => {
  const scratch = mkdtempSync('/workspace/tp-node22-target-')
  try {
    const target = resolve(scratch, 'toolchains/node/22.23.1')
    mkdirSync(target, { recursive: true })
    const sentinel = resolve(target, 'unrelated-project.txt')
    writeFileSync(sentinel, 'preserve this project')
    const env = { TP_NODE22_ROOT: target, TP_NODE22_ARCHIVE: '/nonexistent/archive' }
    const result = run(provision, ['--operator-approved'], env)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /existing target is not the approved official artifact/)
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve this project')
    assert.deepEqual(readdirSync(resolve(target, '..')), ['22.23.1'])
    for (const broad of ['/workspace', scratch, resolve(scratch, 'project'), resolve(scratch, 'toolchains/node')]) {
      const rejection = run(provision, ['--operator-approved'], { ...env, TP_NODE22_ROOT: broad })
      assert.notEqual(rejection.status, 0)
      assert.match(rejection.stderr, /dedicated .* subtree/)
    }
    assert.equal(existsSync(resolve(scratch, 'project')), false)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
})
