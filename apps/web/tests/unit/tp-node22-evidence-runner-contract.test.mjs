import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const readSource = (relativePath) => readFileSync(resolve(repoRoot, relativePath), 'utf8')

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
