import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('refund auto-execute', () => {
  const routeSrc = readFileSync('app/api/me/orders/[orderId]/refund-requests/route.ts', 'utf8')
  const execSrc = readFileSync('src/lib/refund-execute.ts', 'utf8')

  it('REFUND_AUTO_EXECUTE flag defaults to false (not true hardcoded)', () => {
    // The flag should read from process.env, not be hardcoded to true
    assert.match(execSrc, /REFUND_AUTO_EXECUTE.*process\.env/)
  })

  it('route conditionally calls executeRefund when flag enabled', () => {
    assert.match(routeSrc, /REFUND_AUTO_EXECUTE/)
    assert.match(routeSrc, /executeRefund/)
  })

  it('auto-execute is wrapped in try/catch (non-blocking)', () => {
    // Check there is a try/catch around the auto-execute block
    assert.match(routeSrc, /try\s*\{[\s\S]*REFUND_AUTO_EXECUTE[\s\S]*\}\s*catch/m)
  })

  it('REFUND_AUTO_EXECUTE is imported from refund-execute lib', () => {
    assert.match(routeSrc, /import.*REFUND_AUTO_EXECUTE.*refund-execute/)
  })

  it('executeRefund is imported from refund-execute lib', () => {
    assert.match(routeSrc, /import.*executeRefund.*refund-execute/)
  })

  it('flag evaluates process.env string "true" not boolean', () => {
    assert.match(execSrc, /process\.env\.REFUND_AUTO_EXECUTE\s*===\s*['"]true['"]/)
  })
})
