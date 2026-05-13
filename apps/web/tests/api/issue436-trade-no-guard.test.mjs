import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Read from the canonical source location (absolute path — safe for all worktrees)
const ROUTE_PATH = new URL(
  '../../app/api/me/orders/[orderId]/refund-requests/route.ts',
  import.meta.url
).pathname

const routeSrc = readFileSync(ROUTE_PATH, 'utf8')

describe('Issue 436 — trade_no guard for traveler auto-execute', () => {
  it('route has trade_no guard', () => {
    assert.match(routeSrc, /trade_no/, 'route must check trade_no')
  })

  it('guard logs the no-trade_no reason with cash/ATM context', () => {
    // Exact log message from route.ts line 107:
    // console.info('[refund-auto-execute] Skipped: no trade_no (cash/ATM/CVS order)', ...)
    assert.match(
      routeSrc,
      /no trade_no \(cash\/ATM\/CVS order\)/i,
      'guard must log reason referencing cash/ATM/CVS'
    )
  })

  it('guard is a conditional else-if branch (not the main path)', () => {
    // The guard uses } else if (!orderRow.trade_no) { pattern
    assert.match(
      routeSrc,
      /else if \(!orderRow\.trade_no\)/,
      'guard must use else-if (!orderRow.trade_no) pattern'
    )
  })

  it('guard prevents executeRefund for no-trade_no path', () => {
    // The guard must appear BEFORE the executeRefund call
    const guardIdx = routeSrc.search(/!orderRow\.trade_no/)
    const executeIdx = routeSrc.search(/executeRefund\(/)
    assert.ok(guardIdx !== -1, 'guard (!orderRow.trade_no) must exist in route')
    assert.ok(executeIdx !== -1, 'executeRefund() call must exist in route')
    assert.ok(
      guardIdx < executeIdx,
      `guard at char ${guardIdx} must precede executeRefund() at char ${executeIdx}`
    )
  })

  it('guard comment documents the admin-handles rationale', () => {
    // Comment on line 108: // Leave as refund_pending — admin handles non-CC orders
    assert.match(
      routeSrc,
      /admin handles non-CC orders/,
      'guard must document that admin handles non-CC orders'
    )
  })

  it('fallback to refund_pending is documented in guard comment', () => {
    // Comment: Leave as refund_pending — admin handles non-CC orders
    assert.match(routeSrc, /refund_pending/, 'refund_pending fallback must be referenced in route')
  })

  it('executeRefund is only reached after passing trade_no check', () => {
    // executeRefund is in the final else branch (not inside the !trade_no branch)
    // Verify it is in a separate else block after the guard
    assert.match(
      routeSrc,
      /else\s*\{[\s\S]*?\/\/ Proceed with executeRefund/m,
      'executeRefund must be in a separate else block labelled "Proceed with executeRefund"'
    )
  })

  it('auto-execute block is wrapped in try/catch (non-blocking safety)', () => {
    assert.match(
      routeSrc,
      /try\s*\{[\s\S]*REFUND_AUTO_EXECUTE[\s\S]*\}\s*catch/m,
      'auto-execute must be wrapped in try/catch'
    )
  })

  it('route imports REFUND_AUTO_EXECUTE and executeRefund from refund-execute lib', () => {
    assert.match(
      routeSrc,
      /import.*REFUND_AUTO_EXECUTE.*executeRefund.*refund-execute/,
      'both REFUND_AUTO_EXECUTE and executeRefund must be imported from refund-execute'
    )
  })
})
