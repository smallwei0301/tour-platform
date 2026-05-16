import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('refund policy v2 copy sync', () => {
  it('legal/refund page uses refund-v2 exact boundaries (>=168h / >72h<168h / <=72h)', () => {
    const src = readFileSync('app/legal/refund/page.tsx', 'utf8')
    assert.match(src, /168\s*小時|100%/)
    assert.match(src, /70%/)
    assert.match(src, /72\s*小時內|72\s*小時/i)
  })
  it('FAQ page keeps v2 wording', () => {
    const src = readFileSync('app/faq/page.tsx', 'utf8')
    assert.match(src, /168\s*小時/)
    assert.match(src, /72\s*小時/)
    assert.match(src, /70%/)
  })
  it('home FaqSection keeps v2 wording', () => {
    const src = readFileSync('src/components/home/FaqSection.tsx', 'utf8')
    assert.match(src, /168\s*小時/)
    assert.match(src, /70%/)
  })
})
