/**
 * Contract test: issue #478 — ECPay refund callback endpoint
 *
 * Static analysis via readFileSync + assert.match to verify structural
 * guarantees without spinning up a live server.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');

const routePath = path.join(
  webRoot,
  'app/api/payments/ecpay/refund-callback/route.ts'
);
const dbPath = path.join(webRoot, 'src/lib/db.mjs');

const routeSrc = readFileSync(routePath, 'utf8');
const dbSrc = readFileSync(dbPath, 'utf8');

describe('issue #478 — ECPay refund callback: route.ts contract', () => {
  it('exports POST handler', () => {
    assert.match(routeSrc, /export\s+async\s+function\s+POST\s*\(/);
  });

  it('imports verifyCheckMacValue from ecpay', () => {
    assert.match(routeSrc, /verifyCheckMacValue/);
    assert.match(routeSrc, /from\s+['"][^'"]*ecpay['"]/);
  });

  it('has idempotency guard: calls processRefundCallbackDb which checks payment_events', () => {
    // Route delegates to processRefundCallbackDb; idempotency is inside that function
    assert.match(routeSrc, /processRefundCallbackDb/);
    // Route checks alreadyRefunded to short-circuit
    assert.match(routeSrc, /alreadyRefunded/);
  });

  it('returns 400 on bad signature', () => {
    assert.match(routeSrc, /status:\s*400/);
    assert.match(routeSrc, /Invalid signature|INVALID_SIGNATURE/);
  });

  it('returns 1|OK for ECPay acknowledgment', () => {
    assert.match(routeSrc, /1\|OK/);
  });

  it('does not mutate DB when RtnCode is not 1', () => {
    // The route checks rtnCode !== '1' before calling processRefundCallbackDb
    const rtnCheck = /rtnCode\s*!==\s*['"]1['"]/;
    assert.match(routeSrc, rtnCheck);
  });

  it('records incident on refund failure', () => {
    assert.match(routeSrc, /recordIncident/);
  });
});

describe('issue #478 — ECPay refund callback: db.mjs contract', () => {
  it('exports processRefundCallbackDb', () => {
    assert.match(dbSrc, /export\s+async\s+function\s+processRefundCallbackDb\s*\(/);
  });

  it('checks payment_events for existing refunded event (idempotency)', () => {
    assert.match(dbSrc, /payment_events/);
    assert.match(dbSrc, /event_type.*refunded|refunded.*event_type/);
  });

  it('updates orders status to refunded', () => {
    assert.match(dbSrc, /status.*refunded.*payment_status.*refunded|update.*orders/);
  });

  it('updates refund_requests with refunded_at', () => {
    assert.match(dbSrc, /refund_requests/);
    assert.match(dbSrc, /refunded_at/);
  });

  it('inserts payment_events record with event_type refunded', () => {
    assert.match(dbSrc, /payment_events.*insert|insert.*payment_events/);
    assert.match(dbSrc, /event_type.*refunded/);
  });

  it('returns alreadyRefunded flag', () => {
    assert.match(dbSrc, /alreadyRefunded/);
  });
});
