import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('issue #428 — refund_requests sync after REFUND_AUTO_EXECUTE success', () => {
  const routeSrc = readFileSync('app/api/v2/orders/[orderId]/refund-requests/route.ts', 'utf8')

  it('route updates refund_requests on auto-execute success path', () => {
    // After autoExecuted = true, the route must update refund_requests with status 'refunded'
    assert.match(routeSrc, /refund_requests[\s\S]{0,300}status.*refunded/m)
  })

  it('route uses .eq("status", "requested") guard on refund_requests update', () => {
    // Guard must prevent clobbering admin-set state
    assert.match(routeSrc, /\.eq\(['"]status['"],\s*['"]requested['"]\)/)
  })

  it('route sets approved_at in refund_requests update', () => {
    assert.match(routeSrc, /approved_at/)
  })

  it('route sets admin_note with [auto-execute] in refund_requests update', () => {
    assert.match(routeSrc, /admin_note[\s\S]{0,100}\[auto-execute\]/)
  })
})
