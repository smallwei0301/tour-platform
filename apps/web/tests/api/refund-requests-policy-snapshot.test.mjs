import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('refund-requests route — policy_snapshot wiring', () => {
  const src = readFileSync('app/api/me/orders/[orderId]/refund-requests/route.ts', 'utf8')

  it('imports calculateRefundAmount from refund-policy', () => {
    assert.match(src, /calculateRefundAmount/)
  })

  it('includes policy_snapshot in insert payload', () => {
    assert.match(src, /policy_snapshot/)
  })

  it('uses refund-policy module', () => {
    assert.match(src, /refund-policy/)
  })
})
