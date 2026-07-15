/**
 * Issue #387: settlement-config.ts contract test
 * Verifies that the settlement config v1 module exports
 * the required constants and functions, and is env-overridable.
 */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url';
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..')
const src = readFileSync(path.join(ROOT, 'src/lib/settlement-config.ts'), 'utf8')

describe('settlement-config.ts structure', () => {
  it('must export SETTLEMENT_COMMISSION_RATE', () => {
    assert.match(src, /SETTLEMENT_COMMISSION_RATE/, 'must export SETTLEMENT_COMMISSION_RATE')
  })

  it('must export SETTLEMENT_T_DAYS', () => {
    assert.match(src, /SETTLEMENT_T_DAYS/, 'must export SETTLEMENT_T_DAYS')
  })

  it('must export SETTLEMENT_MIN_WITHDRAWAL_TWD', () => {
    assert.match(src, /SETTLEMENT_MIN_WITHDRAWAL_TWD/, 'must export SETTLEMENT_MIN_WITHDRAWAL_TWD')
  })

  it('must export computeExpectedPayout', () => {
    assert.match(src, /computeExpectedPayout/, 'must export computeExpectedPayout')
  })

  it('must export computeNextPayoutDate', () => {
    assert.match(src, /computeNextPayoutDate/, 'must export computeNextPayoutDate')
  })

  it('must be env-overridable for SETTLEMENT_COMMISSION_RATE', () => {
    assert.match(src, /process\.env\.SETTLEMENT_COMMISSION_RATE/, 'must be env-overridable')
  })

  it('must be env-overridable for SETTLEMENT_T_DAYS', () => {
    assert.match(src, /process\.env\.SETTLEMENT_T_DAYS/, 'SETTLEMENT_T_DAYS must be env-overridable')
  })

  it('must use 0.15 as default commission rate', () => {
    assert.match(src, /0\.15/, 'default commission rate 0.15 (15%) must be present')
  })

  it('must use 7 as default T days', () => {
    assert.match(src, /'7'/, "default T+7 must be present as string '7'")
  })

  it('must use 5000 as default minimum withdrawal', () => {
    assert.match(src, /5000/, 'minimum withdrawal NT$5,000 must be present')
  })
})

describe('route wiring', () => {
  const routeSrc = readFileSync(
    path.join(ROOT, 'app/api/guide/dashboard/route.ts'),
    'utf8'
  )

  it('route imports computeExpectedPayout from settlement-config', () => {
    assert.match(routeSrc, /computeExpectedPayout/, 'route must import computeExpectedPayout')
  })

  it('route imports computeNextPayoutDate from settlement-config', () => {
    assert.match(routeSrc, /computeNextPayoutDate/, 'route must import computeNextPayoutDate')
  })

  it('route no longer returns hardcoded null for expectedPayoutTwd at end', () => {
    // The final return must use the computed variable, not null literal
    assert.match(routeSrc, /expectedPayoutTwd,/, 'route must return computed expectedPayoutTwd variable')
  })

  it('route no longer returns hardcoded null for nextPayoutDate at end', () => {
    assert.match(routeSrc, /nextPayoutDate,/, 'route must return computed nextPayoutDate variable')
  })
})

describe('page wiring', () => {
  const pageSrc = readFileSync(
    path.join(ROOT, 'app/(non-locale)/guide/dashboard/page.tsx'),
    'utf8'
  )

  it('page renders expectedPayoutTwd with NT$ formatting', () => {
    assert.match(pageSrc, /expectedPayoutTwd/, 'page must reference expectedPayoutTwd')
    assert.match(pageSrc, /NT\$/, 'page must render NT$ currency prefix')
  })

  it('page renders nextPayoutDate', () => {
    assert.match(pageSrc, /nextPayoutDate/, 'page must reference nextPayoutDate')
  })

  it('page shows settlement rule v1 annotation for payout card', () => {
    assert.match(pageSrc, /結算規則 v1/, 'page must show 結算規則 v1 annotation')
    assert.doesNotMatch(pageSrc, /Draft v1 結算規則/, 'page must not contain Draft copy')
  })

  it('page falls back to -- when values are null', () => {
    assert.match(pageSrc, /\?\? '--'|!= null/, 'page must show -- when values are null')
  })
})
