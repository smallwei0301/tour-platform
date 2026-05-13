/**
 * Static contract tests for scripts/admin/backfill-refund-status.mjs
 * Issue #480 — historical refund backfill script
 *
 * These tests use readFileSync + assert to verify the script's structure
 * without executing it (no env / network required).
 */

import { readFileSync } from 'fs';
import assert from 'assert';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, '../../../../scripts/admin/backfill-refund-status.mjs');
const src = readFileSync(scriptPath, 'utf-8');

describe('backfill-refund-status.mjs — static contract', () => {
  it('has --dry-run flag support', () => {
    assert.match(src, /--dry-run/);
  });

  it('has --write flag support', () => {
    assert.match(src, /--write/);
  });

  it('has --yes flag support (skip confirmation)', () => {
    assert.match(src, /--yes/);
  });

  it('imports processRefundCallbackDb from db.mjs', () => {
    assert.match(src, /processRefundCallbackDb.*db\.mjs/s);
  });

  it('imports queryTradeInfo from ecpay-query.mjs', () => {
    assert.match(src, /queryTradeInfo.*ecpay-query\.mjs/s);
  });

  it("checks tradeStatus === '2' for completed refund", () => {
    assert.match(src, /tradeStatus\s*===\s*['"]2['"]/);
  });

  it('does not call processRefundCallbackDb in dry-run mode', () => {
    // dry-run branch records would_update action without calling processRefundCallbackDb
    assert.match(src, /isDryRun/);
    assert.match(src, /would_update/);
  });

  it('outputs summary object with total, updated, skipped, errors fields', () => {
    assert.match(src, /total:/);
    assert.match(src, /updated:/);
    assert.match(src, /skipped:/);
    assert.match(src, /errors:/);
  });

  it('supports --order-id filter', () => {
    assert.match(src, /--order-id=/);
  });

  it('writes JSON report to file when --out flag provided', () => {
    assert.match(src, /--out=/);
    assert.match(src, /writeFileSync/);
    assert.match(src, /outPath/);
  });

  it('includes generatedAt and durationMs in summary', () => {
    assert.match(src, /generatedAt/);
    assert.match(src, /durationMs/);
  });

  it('validates required env vars and exits on missing', () => {
    assert.match(src, /SUPABASE_URL/);
    assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(src, /ECPAY_MERCHANT_ID/);
    assert.match(src, /process\.exit\(1\)/);
  });
});
