import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('TypeScript strict mode', () => {
  it('tsconfig.json has strict: true', () => {
    const cfg = JSON.parse(readFileSync('tsconfig.json', 'utf8'))
    assert.strictEqual(cfg.compilerOptions.strict, true)
  })
})
