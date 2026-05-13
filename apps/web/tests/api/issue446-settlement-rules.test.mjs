import { readFileSync, readdirSync } from 'fs'
import assert from 'assert'
import { describe, it } from 'node:test'

const WORKTREE = '/root/.openclaw/workspace/tour-platform-worktrees/issue-446-settlement-rules'

describe('Issue 446 — settlement_rules table + admin override API', () => {
  it('migration file exists', () => {
    const files = readdirSync(`${WORKTREE}/supabase/migrations`)
    assert.ok(
      files.some(f => f.includes('issue446') || f.includes('settlement_rules')),
      'migration file must exist'
    )
  })

  it('migration creates settlement_rules table with correct columns', () => {
    const files = readdirSync(`${WORKTREE}/supabase/migrations`)
    const f = files.find(f => f.includes('issue446') || f.includes('settlement_rules'))
    assert.ok(f, 'migration file must exist')
    const sql = readFileSync(`${WORKTREE}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /CREATE TABLE.*settlement_rules/s)
    assert.match(sql, /commission_rate/)
    assert.match(sql, /t_days/)
    assert.match(sql, /min_withdrawal_twd/)
    assert.match(sql, /is_active/)
    assert.match(sql, /INSERT.*settlement_rules.*0\.15.*7.*5000/s)
  })

  it('migration has unique index for active row', () => {
    const files = readdirSync(`${WORKTREE}/supabase/migrations`)
    const f = files.find(f => f.includes('issue446') || f.includes('settlement_rules'))
    const sql = readFileSync(`${WORKTREE}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /settlement_rules_active_unique/)
    assert.match(sql, /WHERE is_active = true/)
  })

  it('admin settlement route exists with GET and PATCH', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/app/api/admin/settings/settlement/route.ts`,
      'utf8'
    )
    assert.match(src, /export async function GET/)
    assert.match(src, /export async function PATCH/)
    // route delegates to DB helpers (getSettlementRulesDb / updateSettlementRulesDb)
    // rather than referencing the table name directly
    assert.match(src, /getSettlementRulesDb|settlement_rules/)
  })

  it('admin route uses ok/fail helpers', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/app/api/admin/settings/settlement/route.ts`,
      'utf8'
    )
    assert.match(src, /import.*ok.*fail.*from/)
    assert.match(src, /getSettlementRulesDb/)
    assert.match(src, /updateSettlementRulesDb/)
  })

  it('getSettlementConfig exported from settlement-config.ts', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/src/lib/settlement-config.ts`,
      'utf8'
    )
    assert.match(src, /export.*getSettlementConfig/)
    assert.match(src, /SettlementConfig/)
  })

  it('getSettlementConfig falls back to env constants', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/src/lib/settlement-config.ts`,
      'utf8'
    )
    assert.match(src, /env-fallback/)
    assert.match(src, /SETTLEMENT_COMMISSION_RATE/)
    assert.match(src, /SETTLEMENT_T_DAYS/)
    assert.match(src, /SETTLEMENT_MIN_WITHDRAWAL_TWD/)
  })

  it('db.mjs exports getSettlementRulesDb and updateSettlementRulesDb', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/src/lib/db.mjs`,
      'utf8'
    )
    assert.match(src, /export async function getSettlementRulesDb/)
    assert.match(src, /export async function updateSettlementRulesDb/)
  })
})
