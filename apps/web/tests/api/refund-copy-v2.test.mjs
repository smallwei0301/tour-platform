import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('refund policy v2 copy sync', () => {
  it('legal/refund page uses v2 tiers (7天/3-7天/72小時)', () => {
    const src = readFileSync('app/legal/refund/page.tsx', 'utf8')
    assert.match(src, /7\s*天/)
    assert.match(src, /70%|七成/)
    assert.match(src, /72\s*小時/)
  })
  it('FAQ page uses v2 tiers', () => {
    const src = readFileSync('app/faq/page.tsx', 'utf8')
    assert.match(src, /7\s*天|七天/)
  })
  it('home FaqSection uses v2 wording', () => {
    const src = readFileSync('src/components/home/FaqSection.tsx', 'utf8')
    assert.match(src, /7\s*天|七天/)
  })
})
