import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('guide dashboard GMV query bounds', () => {
  const src = readFileSync('app/api/guide/dashboard/route.ts', 'utf8')
  it('has lower bound gte on gmv query', () => {
    assert.match(src, /gmvMonthStart/)
  })
  it('has upper bound lt on gmv query', () => {
    assert.match(src, /gmvMonthEnd/)
    assert.match(src, /\.lt\(.*gmvMonthEnd/)
  })
})
