/**
 * Contract tests for Issue #454
 * Verifies that guide dashboard route is wired to settlement_rules DB
 * and exposes guide balance fields.
 */
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = resolve(__dirname, '../../app/api/guide/dashboard/route.ts');
const PAGE_PATH = resolve(__dirname, '../../app/guide/dashboard/page.tsx');

const routeSrc = readFileSync(ROUTE_PATH, 'utf8');
const pageSrc = readFileSync(PAGE_PATH, 'utf8');

describe('issue #454 — guide dashboard settlement wire', () => {
  describe('route.ts imports', () => {
    it('imports getSettlementConfig from settlement-config', () => {
      assert.ok(
        routeSrc.includes('getSettlementConfig'),
        'route.ts must import getSettlementConfig'
      );
      assert.ok(
        routeSrc.includes("from '../../../../src/lib/settlement-config'"),
        'import path must point to settlement-config'
      );
    });
  });

  describe('route.ts — guide_balances query', () => {
    it('queries guide_balances table for balance_twd', () => {
      assert.ok(
        routeSrc.includes("'guide_balances'"),
        'route.ts must query guide_balances table'
      );
      assert.ok(
        routeSrc.includes('balance_twd'),
        'route.ts must select balance_twd from guide_balances'
      );
    });

    it('filters guide_balances by guide_id', () => {
      assert.ok(
        routeSrc.includes(".eq('guide_id', guideId)"),
        'route.ts must filter guide_balances by guide_id'
      );
    });
  });

  describe('route.ts — payouts query', () => {
    it('queries payouts table for pending state', () => {
      assert.ok(
        routeSrc.includes("'payouts'"),
        'route.ts must query payouts table'
      );
      assert.ok(
        routeSrc.includes("'pending'"),
        'route.ts must filter payouts by state = pending'
      );
    });

    it('selects total_twd from payouts', () => {
      assert.ok(
        routeSrc.includes('total_twd'),
        'route.ts must select total_twd from payouts'
      );
    });
  });

  describe('route.ts — response shape', () => {
    it('returns currentBalanceTwd in response', () => {
      assert.ok(
        routeSrc.includes('currentBalanceTwd'),
        'route.ts must include currentBalanceTwd in response'
      );
    });

    it('returns minWithdrawalTwd in response', () => {
      assert.ok(
        routeSrc.includes('minWithdrawalTwd'),
        'route.ts must include minWithdrawalTwd in response'
      );
    });

    it('returns pendingPayoutTwd in response', () => {
      assert.ok(
        routeSrc.includes('pendingPayoutTwd'),
        'route.ts must include pendingPayoutTwd in response'
      );
    });

    it('returns settlementRulesVersion in response', () => {
      assert.ok(
        routeSrc.includes('settlementRulesVersion'),
        'route.ts must include settlementRulesVersion in response'
      );
    });
  });

  describe('route.ts — settlement config usage', () => {
    it('calls getSettlementConfig with supabase', () => {
      assert.ok(
        routeSrc.includes('getSettlementConfig(supabase)'),
        'route.ts must call getSettlementConfig(supabase)'
      );
    });

    it('uses commission_rate from settlementConfig for payout calculation', () => {
      assert.ok(
        routeSrc.includes('settlementConfig.commission_rate'),
        'route.ts must use settlementConfig.commission_rate'
      );
    });

    it('uses t_days from settlementConfig for next payout date', () => {
      assert.ok(
        routeSrc.includes('settlementConfig.t_days'),
        'route.ts must use settlementConfig.t_days'
      );
    });
  });

  describe('page.tsx — balance card UI', () => {
    it('references currentBalanceTwd in UI', () => {
      assert.ok(
        pageSrc.includes('currentBalanceTwd'),
        'page.tsx must reference currentBalanceTwd'
      );
    });

    it('includes 可結算餘額 label', () => {
      assert.ok(
        pageSrc.includes('可結算餘額'),
        'page.tsx must include 可結算餘額 label'
      );
    });

    it('includes minWithdrawalTwd reference', () => {
      assert.ok(
        pageSrc.includes('minWithdrawalTwd'),
        'page.tsx must reference minWithdrawalTwd'
      );
    });

    it('includes pendingPayoutTwd reference', () => {
      assert.ok(
        pageSrc.includes('pendingPayoutTwd'),
        'page.tsx must reference pendingPayoutTwd'
      );
    });
  });
});
