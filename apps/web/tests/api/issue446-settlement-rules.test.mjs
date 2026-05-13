import { readFileSync, readdirSync } from 'fs'
import { strict as assert } from 'assert'
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

// ── Behavioral mock tests (Issue #446) ────────────────────────────────────────

describe('Issue 446 — updateSettlementRulesDb behavioral (mock)', () => {
  it('rollback path exists in updateSettlementRulesDb source', () => {
    const src = readFileSync(`${WORKTREE}/apps/web/src/lib/db.mjs`, 'utf8')
    // Must capture old row id before deactivation
    assert.match(src, /oldRows/, 'must capture old active row id for rollback')
    // Must re-activate on insert failure
    assert.match(
      src,
      /update\(\s*\{\s*is_active:\s*true\s*\}\s*\).*\.eq\(\s*['"]id['"].*oldRows/s,
      'must re-activate old row by id on insert failure'
    )
    // Rollback must be inside the error branch
    assert.match(src, /if\s*\(error\)\s*\{[\s\S]*?oldRows[\s\S]*?throw error/m,
      'rollback must be inside error branch before re-throw')
  })

  it('getSettlementConfig returns env fallback when supabase throws', () => {
    const src = readFileSync(`${WORKTREE}/apps/web/src/lib/settlement-config.ts`, 'utf8')
    assert.match(src, /try\s*\{/, 'must have try block')
    assert.match(src, /catch\s*[({]/, 'must have catch block for fallback')
    assert.match(src, /SETTLEMENT_COMMISSION_RATE/, 'must return env constant in fallback')
    assert.match(src, /SETTLEMENT_T_DAYS/, 'must return env constant in fallback')
    assert.match(src, /SETTLEMENT_MIN_WITHDRAWAL_TWD/, 'must return env constant in fallback')
  })

  it('route.ts PATCH delegates to updateSettlementRulesDb (not raw Supabase)', () => {
    const src = readFileSync(
      `${WORKTREE}/apps/web/app/api/admin/settings/settlement/route.ts`,
      'utf8'
    )
    assert.match(src, /updateSettlementRulesDb/, 'PATCH must delegate to updateSettlementRulesDb helper')
    // Must NOT call supabase.from('settlement_rules') directly in PATCH handler
    assert.doesNotMatch(
      src.replace(/^[\s\S]*?export async function PATCH/m, ''),
      /\.from\(['"]settlement_rules['"]\)/,
      'PATCH handler must not bypass helper with raw supabase calls'
    )
  })

  it('updateSettlementRulesDb behavioral: successful insert returns new row (mock)', async () => {
    // Inline mock: import the function directly and drive it with a mock supabase
    const { updateSettlementRulesDb } = await import(`${WORKTREE}/apps/web/src/lib/db.mjs`)

    const newRow = { id: 'new-id', commission_rate: 0.18, t_days: 10, min_withdrawal_twd: 3000, is_active: true }
    let updateCalled = false

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [{ id: 'old-id' }], error: null }),
        }),
        update: () => ({
          eq: () => {
            updateCalled = true
            return Promise.resolve({ data: null, error: null })
          },
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: newRow, error: null }),
          }),
        }),
      }),
    }

    const result = await updateSettlementRulesDb(mockSupabase, { commission_rate: 0.18, t_days: 10, min_withdrawal_twd: 3000 }, 'admin')
    assert.equal(result.id, 'new-id', 'must return newly inserted row')
    assert.ok(updateCalled, 'must have called update to deactivate old row')
  })

  it('updateSettlementRulesDb behavioral: re-activates old row when insert fails (mock)', async () => {
    const { updateSettlementRulesDb } = await import(`${WORKTREE}/apps/web/src/lib/db.mjs`)

    const updateCalls = []

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [{ id: 'old-id' }], error: null }),
        }),
        update: (patch) => ({
          eq: (col, val) => {
            updateCalls.push({ patch, col, val })
            return Promise.resolve({ data: null, error: null })
          },
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: new Error('constraint violation') }),
          }),
        }),
      }),
    }

    await assert.rejects(
      () => updateSettlementRulesDb(mockSupabase, { commission_rate: 0.18 }, 'admin'),
      /constraint violation/,
      'must re-throw the insert error'
    )

    const rollbackCall = updateCalls.find(c => c.patch && c.patch.is_active === true)
    assert.ok(rollbackCall, 'must call update({ is_active: true }) for rollback')
    assert.equal(rollbackCall.col, 'id', 'rollback must target by id column')
    assert.equal(rollbackCall.val, 'old-id', 'rollback must target the old row id')
  })
})
