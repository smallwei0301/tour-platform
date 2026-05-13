/**
 * Contract tests for Issue #447 — guide_balances + payout_items + settlement sweep cron
 * Leaf B of #310
 *
 * Coverage:
 * - Migration files exist with correct columns and constraints
 * - sweep route: auth guard, payout_items insert, guide_balances upsert
 * - db.mjs: getUnsettledOrdersDb + recordSettlementDb exported
 * - Behavioral mock: sweep math with 2 orders → correct net_twd
 */
import { readFileSync, readdirSync } from 'fs'
import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '../../../..')

// ── Migration: guide_balances ──────────────────────────────────────────────────

describe('Issue 447 — guide_balances migration', () => {
  it('migration file exists', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    assert.ok(
      files.some(f => f.includes('issue447') && f.includes('guide_balances')),
      'guide_balances migration file must exist'
    )
  })

  it('migration creates guide_balances table with correct columns', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    const f = files.find(f => f.includes('issue447') && f.includes('guide_balances'))
    assert.ok(f, 'guide_balances migration file must exist')
    const sql = readFileSync(`${REPO_ROOT}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /CREATE TABLE.*guide_balances/s, 'must CREATE TABLE guide_balances')
    assert.match(sql, /guide_id.*uuid.*PRIMARY KEY/, 'must have guide_id as PRIMARY KEY')
    assert.match(sql, /balance_twd.*integer/, 'must have balance_twd integer column')
    assert.match(sql, /last_settled_at.*timestamptz/, 'must have last_settled_at timestamptz')
    assert.match(sql, /updated_at.*timestamptz/, 'must have updated_at timestamptz')
  })

  it('migration enables RLS and creates service_role policy', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    const f = files.find(f => f.includes('issue447') && f.includes('guide_balances'))
    const sql = readFileSync(`${REPO_ROOT}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'must enable RLS on guide_balances')
    assert.match(sql, /service_role_all/, 'must create service_role_all policy')
  })
})

// ── Migration: payout_items ────────────────────────────────────────────────────

describe('Issue 447 — payout_items migration', () => {
  it('migration file exists', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    assert.ok(
      files.some(f => f.includes('issue447') && f.includes('payout_items')),
      'payout_items migration file must exist'
    )
  })

  it('migration creates payout_items table with correct columns', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    const f = files.find(f => f.includes('issue447') && f.includes('payout_items'))
    assert.ok(f, 'payout_items migration file must exist')
    const sql = readFileSync(`${REPO_ROOT}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /CREATE TABLE.*payout_items/s, 'must CREATE TABLE payout_items')
    assert.match(sql, /order_id.*uuid.*NOT NULL/, 'must have order_id uuid NOT NULL')
    assert.match(sql, /guide_id.*uuid.*NOT NULL/, 'must have guide_id uuid NOT NULL')
    assert.match(sql, /gmv_twd.*integer.*NOT NULL/, 'must have gmv_twd integer NOT NULL')
    assert.match(sql, /commission_twd.*integer.*NOT NULL/, 'must have commission_twd integer NOT NULL')
    assert.match(sql, /net_twd.*integer.*NOT NULL/, 'must have net_twd integer NOT NULL')
    assert.match(sql, /rules_version.*text/, 'must have rules_version text column')
    assert.match(sql, /settled_at.*timestamptz/, 'must have settled_at timestamptz')
  })

  it('migration has idempotency UNIQUE constraint on order_id', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    const f = files.find(f => f.includes('issue447') && f.includes('payout_items'))
    const sql = readFileSync(`${REPO_ROOT}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /payout_items_order_unique/, 'must have named UNIQUE constraint')
    assert.match(sql, /UNIQUE.*order_id/, 'UNIQUE must target order_id')
  })

  it('migration enables RLS and creates service_role policy', () => {
    const files = readdirSync(`${REPO_ROOT}/supabase/migrations`)
    const f = files.find(f => f.includes('issue447') && f.includes('payout_items'))
    const sql = readFileSync(`${REPO_ROOT}/supabase/migrations/${f}`, 'utf8')
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/, 'must enable RLS on payout_items')
    assert.match(sql, /service_role_all/, 'must create service_role_all policy')
  })
})

// ── Sweep route: structural checks ────────────────────────────────────────────

describe('Issue 447 — settlement sweep route structural checks', () => {
  const routePath = join(__dirname, '../../app/api/internal/settlement/sweep/route.ts')

  it('sweep route file exists', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.ok(src.length > 0, 'route.ts must not be empty')
  })

  it('sweep route exports POST handler', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /export async function POST/, 'must export POST handler')
  })

  it('sweep route has x-internal-token auth guard', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /x-internal-token/, 'must check x-internal-token header')
    assert.match(src, /INTERNAL_ALERT_TOKEN/, 'must compare against INTERNAL_ALERT_TOKEN env var')
    assert.match(src, /401/, 'must return 401 on auth failure')
  })

  it('sweep route uses getSettlementConfig for commission_rate and t_days', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /getSettlementConfig/, 'must call getSettlementConfig')
    assert.match(src, /commission_rate/, 'must use commission_rate from config')
    assert.match(src, /t_days/, 'must use t_days from config')
  })

  it('sweep route filters on status IN paid/confirmed/completed', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /paid/, 'must include paid status')
    assert.match(src, /confirmed/, 'must include confirmed status')
    assert.match(src, /completed/, 'must include completed status')
  })

  it('sweep route filters by activity_schedules.start_at (not tour_date)', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /activity_schedules.*start_at/s, 'must use activity_schedules.start_at for cutoff')
    assert.doesNotMatch(src, /tour_date/, 'must NOT use non-existent tour_date column')
  })

  it('sweep route inserts into payout_items with ON CONFLICT DO NOTHING', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /payout_items/, 'must upsert/insert into payout_items')
    assert.match(src, /onConflict.*order_id/, 'must use onConflict on order_id')
    // Supabase upsert with ignoreDuplicates=true maps to ON CONFLICT DO NOTHING
    assert.match(src, /ignoreDuplicates.*true|\.ignore\(\)/, 'must use ignoreDuplicates:true or .ignore() for idempotency')
  })

  it('sweep route accumulates guide_balances via fetch+upsert', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /guide_balances/, 'must upsert guide_balances')
    assert.match(src, /balance_twd/, 'must include balance_twd in upsert')
    assert.match(src, /last_settled_at/, 'must include last_settled_at in upsert')
    // Must fetch existing balance before upserting (accumulate, not replace)
    assert.match(src, /existing.*balance_twd|balance_twd.*existing/s, 'must fetch existing balance before upserting')
  })

  it('sweep route snapshots rules_version per row', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /rules_version/, 'must set rules_version on each payout_item')
  })

  it('sweep route uses floor for commission and net math', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /Math\.floor.*commission_rate/, 'must floor commission_twd')
    assert.match(src, /Math\.floor.*1\s*-\s*config\.commission_rate/, 'must floor net_twd using (1 - commission_rate)')
  })

  it('sweep route returns ok/settled/guides_updated on success', () => {
    const src = readFileSync(routePath, 'utf8')
    assert.match(src, /ok:\s*true/, 'must return ok: true on success')
    assert.match(src, /settled/, 'must return settled count')
    assert.match(src, /guides_updated/, 'must return guides_updated count')
  })
})

// ── db.mjs: new helper exports ─────────────────────────────────────────────────

describe('Issue 447 — db.mjs new settlement helpers', () => {
  const dbPath = join(__dirname, '../../src/lib/db.mjs')

  it('getUnsettledOrdersDb is exported', () => {
    const src = readFileSync(dbPath, 'utf8')
    assert.match(src, /export async function getUnsettledOrdersDb/, 'must export getUnsettledOrdersDb')
  })

  it('getUnsettledOrdersDb uses tDays cutoff', () => {
    const src = readFileSync(dbPath, 'utf8')
    // Find the function body
    const fnStart = src.indexOf('export async function getUnsettledOrdersDb')
    const fnEnd = src.indexOf('\nexport ', fnStart + 1)
    const fnBody = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)
    assert.match(fnBody, /tDays/, 'must use tDays parameter')
    assert.match(fnBody, /cutoff/, 'must compute cutoff date')
    assert.match(fnBody, /lte.*start_at|start_at.*lte/s, 'must filter by start_at lte cutoff')
    assert.match(fnBody, /paid.*confirmed.*completed|paid|confirmed|completed/s, 'must filter by status')
  })

  it('recordSettlementDb is exported', () => {
    const src = readFileSync(dbPath, 'utf8')
    assert.match(src, /export async function recordSettlementDb/, 'must export recordSettlementDb')
  })

  it('recordSettlementDb upserts payout_items with ignoreDuplicates on conflict', () => {
    const src = readFileSync(dbPath, 'utf8')
    const fnStart = src.indexOf('export async function recordSettlementDb')
    const fnEnd = src.indexOf('\nexport ', fnStart + 1)
    const fnBody = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)
    assert.match(fnBody, /payout_items/, 'must upsert into payout_items')
    assert.match(fnBody, /ignoreDuplicates.*true|\.ignore\(\)/, 'must use ignoreDuplicates:true or .ignore() for idempotency')
  })

  it('recordSettlementDb accumulates guide_balances (fetch + upsert)', () => {
    const src = readFileSync(dbPath, 'utf8')
    const fnStart = src.indexOf('export async function recordSettlementDb')
    const fnEnd = src.indexOf('\nexport ', fnStart + 1)
    const fnBody = src.slice(fnStart, fnEnd === -1 ? undefined : fnEnd)
    assert.match(fnBody, /guide_balances/, 'must upsert guide_balances')
    assert.match(fnBody, /existing/, 'must fetch existing balance before upserting')
    assert.match(fnBody, /balance_twd/, 'must upsert balance_twd')
  })
})

// ── Behavioral mock: settlement math ──────────────────────────────────────────

describe('Issue 447 — settlement sweep behavioral (mock)', () => {
  it('net_twd = floor(total * (1 - 0.15)), commission_twd = floor(total * 0.15)', () => {
    // Inline math test — mirrors what the sweep route does
    const COMMISSION_RATE = 0.15
    const orders = [
      { id: 'order-1', total_twd: 3000, guide_id: 'guide-A' },
      { id: 'order-2', total_twd: 1500, guide_id: 'guide-A' },
    ]
    const items = orders.map(o => ({
      order_id: o.id,
      guide_id: o.guide_id,
      gmv_twd: o.total_twd,
      commission_twd: Math.floor(o.total_twd * COMMISSION_RATE),
      net_twd: Math.floor(o.total_twd * (1 - COMMISSION_RATE)),
    }))

    // order-1: gmv=3000, commission=floor(450)=450, net=floor(2550)=2550
    assert.equal(items[0].commission_twd, 450, 'order-1 commission must be 450')
    assert.equal(items[0].net_twd, 2550, 'order-1 net must be 2550')

    // order-2: gmv=1500, commission=floor(225)=225, net=floor(1275)=1275
    assert.equal(items[1].commission_twd, 225, 'order-2 commission must be 225')
    assert.equal(items[1].net_twd, 1275, 'order-2 net must be 1275')
  })

  it('guide balance accumulates correctly across 2 orders for same guide', () => {
    // Both orders from guide-A: net = 2550 + 1275 = 3825
    const items = [
      { guide_id: 'guide-A', net_twd: 2550 },
      { guide_id: 'guide-A', net_twd: 1275 },
    ]
    const balanceDeltas = {}
    for (const item of items) {
      balanceDeltas[item.guide_id] = (balanceDeltas[item.guide_id] ?? 0) + item.net_twd
    }
    assert.equal(balanceDeltas['guide-A'], 3825, 'guide-A total net must be 3825')
  })

  it('recordSettlementDb behavioral: inserts payout_items and accumulates balances (mock)', async () => {
    const { recordSettlementDb } = await import(join(__dirname, '../../src/lib/db.mjs'))

    const upsertedPayoutItems = []
    const upsertedBalances = []

    const mockSupabase = {
      from: (table) => ({
        // payout_items use upsert with ignoreDuplicates=true
        upsert: (rows, opts) => {
          if (table === 'payout_items') {
            const arr = Array.isArray(rows) ? rows : [rows]
            upsertedPayoutItems.push(...arr)
          }
          if (table === 'guide_balances') {
            upsertedBalances.push(rows)
          }
          return Promise.resolve({ error: null })
        },
        select: () => ({
          eq: () => ({
            // Return null existing balance (first settlement)
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }

    const items = [
      { order_id: 'order-1', guide_id: 'guide-A', gmv_twd: 3000, commission_twd: 450, net_twd: 2550, rules_version: 'v1', settled_at: new Date().toISOString() },
      { order_id: 'order-2', guide_id: 'guide-A', gmv_twd: 1500, commission_twd: 225, net_twd: 1275, rules_version: 'v1', settled_at: new Date().toISOString() },
    ]

    await recordSettlementDb(mockSupabase, items)

    assert.equal(upsertedPayoutItems.length, 2, 'must upsert 2 payout_items')
    assert.equal(upsertedBalances.length, 1, 'must upsert balance for 1 guide')
    // With no existing balance, net = 0 + (2550 + 1275) = 3825
    assert.equal(upsertedBalances[0].balance_twd, 3825, 'accumulated balance must be 3825')
    assert.equal(upsertedBalances[0].guide_id, 'guide-A', 'balance must be for guide-A')
    assert.ok(upsertedBalances[0].last_settled_at, 'must set last_settled_at')
  })

  it('recordSettlementDb behavioral: accumulates on top of existing balance (mock)', async () => {
    const { recordSettlementDb } = await import(join(__dirname, '../../src/lib/db.mjs'))

    const upsertedBalances = []

    const mockSupabase = {
      from: (table) => ({
        upsert: (rows, opts) => {
          if (table === 'guide_balances') upsertedBalances.push(rows)
          return Promise.resolve({ error: null })
        },
        select: () => ({
          eq: () => ({
            // Existing balance is 5000
            single: () => Promise.resolve({ data: { balance_twd: 5000 }, error: null }),
          }),
        }),
      }),
    }

    const items = [
      { order_id: 'order-3', guide_id: 'guide-B', gmv_twd: 2000, commission_twd: 300, net_twd: 1700, rules_version: 'v1', settled_at: new Date().toISOString() },
    ]

    await recordSettlementDb(mockSupabase, items)

    // Existing 5000 + net 1700 = 6700
    assert.equal(upsertedBalances[0].balance_twd, 6700, 'must accumulate on top of existing balance')
  })

  it('recordSettlementDb is a no-op for empty items array', async () => {
    const { recordSettlementDb } = await import(join(__dirname, '../../src/lib/db.mjs'))

    let upsertCalled = false
    const mockSupabase = {
      from: () => ({
        upsert: () => {
          upsertCalled = true
          return Promise.resolve({ error: null })
        },
      }),
    }

    await recordSettlementDb(mockSupabase, [])
    assert.equal(upsertCalled, false, 'must not call upsert for empty items')
  })
})
