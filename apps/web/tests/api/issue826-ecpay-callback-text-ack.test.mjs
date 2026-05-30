/**
 * Tests for issue #826 — ECPay text/plain 1|OK ack branch in submitEcpayCallback.
 *
 * PR #826 added text/plain ack handling to submitEcpayCallback in
 * apps/web/src/lib/client-api.ts but shipped without a dedicated unit test.
 * This file closes that coverage gap (tracked in issue #930).
 *
 * Since client-api.ts is TypeScript and cannot be directly imported by the Node
 * built-in test runner, we use source-level contract testing (readFileSync +
 * assert.match) — the same pattern used throughout tests/api/*.
 *
 * AC1: text/plain body `1|OK` + res.ok=true → { received: true, ack: '1|OK' }
 * AC2: text/plain `1|OK` + res.ok=false → does NOT return success (res.ok guard)
 * AC3: JSON response with ok:true → parsed JSON result (existing path is also guarded)
 * AC4: unexpected text or non-ok → throws with descriptive error
 */

import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../..');

const clientApiSrc = readFileSync(
  path.join(webRoot, 'src/lib/client-api.ts'),
  'utf-8'
);

// ---------------------------------------------------------------------------
// Helpers: extract the submitEcpayCallback function body for targeted checks
// ---------------------------------------------------------------------------
const fnStart = clientApiSrc.indexOf('export async function submitEcpayCallback');
const fnEnd = clientApiSrc.indexOf('\nexport ', fnStart + 1);
const fnSrc = fnEnd === -1 ? clientApiSrc.slice(fnStart) : clientApiSrc.slice(fnStart, fnEnd);

// ---------------------------------------------------------------------------
// AC1 — text/plain `1|OK` + res.ok=true path returns { received: true, ack: '1|OK' }
// ---------------------------------------------------------------------------
describe('issue #826 — AC1: text/plain 1|OK + res.ok=true → { received: true, ack }', () => {
  it('function checks res.ok before returning the ack object', () => {
    // The guard must be: res.ok && text === '1|OK'
    assert.match(
      fnSrc,
      /res\.ok\s*&&\s*text\s*===\s*['"]1\|OK['"]/,
      'submitEcpayCallback must guard ack return with res.ok AND text === "1|OK"'
    );
  });

  it('returns { received: true, ack: text } when guard passes', () => {
    assert.match(
      fnSrc,
      /return\s*\{\s*received\s*:\s*true\s*,\s*ack\s*:\s*text\s*\}/,
      'submitEcpayCallback must return { received: true, ack: text } for 1|OK branch'
    );
  });

  it('ack property carries the raw text value (not a hardcoded string)', () => {
    // Ensures the ack field is `text` (the trimmed response body) not '1|OK' literal
    assert.ok(
      fnSrc.includes('ack: text'),
      'ack property should be assigned the `text` variable so the exact server ack is preserved'
    );
  });
});

// ---------------------------------------------------------------------------
// AC2 — text/plain `1|OK` + res.ok=false does NOT return success
// ---------------------------------------------------------------------------
describe('issue #826 — AC2: res.ok=false guard prevents ack return', () => {
  it('res.ok is checked BEFORE returning ack (not after)', () => {
    const ackReturnIdx = fnSrc.indexOf('received: true');
    const resOkGuardIdx = fnSrc.search(/res\.ok\s*&&/);
    assert.ok(
      resOkGuardIdx !== -1 && resOkGuardIdx < ackReturnIdx,
      'res.ok guard must appear before the { received: true } return'
    );
  });

  it('non-ok path falls through to the throw statement', () => {
    // When res.ok=false, the res.ok && text === '1|OK' guard fails and we fall
    // through to throw — verify a throw exists after the ack block.
    // Note: the JSON branch also has an earlier throw; we want the one after ack.
    const ackIdx = fnSrc.indexOf('received: true');
    assert.ok(ackIdx !== -1, 'ack return must exist in function');

    // Find the last throw new Error( in the function — it must be after the ack block
    const lastThrowIdx = fnSrc.lastIndexOf('throw new Error(');
    assert.ok(
      lastThrowIdx > ackIdx,
      'a throw statement must appear after the { received: true } ack return (fallthrough for non-ok / unexpected text)'
    );
  });
});

// ---------------------------------------------------------------------------
// AC3 — JSON response with ok:true → parsed JSON data returned
// ---------------------------------------------------------------------------
describe('issue #826 — AC3: JSON response → parsed JSON result', () => {
  it('function checks content-type for application/json', () => {
    assert.match(
      fnSrc,
      /contentType\.includes\s*\(\s*['"]application\/json['"]\s*\)/,
      'submitEcpayCallback must branch on content-type application/json'
    );
  });

  it('JSON branch calls res.json() and checks json.ok', () => {
    assert.match(fnSrc, /await\s+res\.json\s*\(\s*\)/, 'must await res.json()');
    assert.match(fnSrc, /json\.ok/, 'must guard JSON response with json.ok check');
  });

  it('JSON branch returns json.data on success', () => {
    assert.match(
      fnSrc,
      /return\s+json\.data/,
      'JSON success path must return json.data'
    );
  });

  it('JSON branch throws when json.ok is falsy', () => {
    // Pattern: if (!json.ok) throw ...
    assert.match(
      fnSrc,
      /!\s*json\.ok\s*\)\s*throw/,
      'JSON error path must throw when !json.ok'
    );
  });
});

// ---------------------------------------------------------------------------
// AC4 — unexpected text or non-ok → throws with descriptive error
// ---------------------------------------------------------------------------
describe('issue #826 — AC4: unexpected text / non-ok → throws with message', () => {
  it('throw message includes text or fallback string', () => {
    // Pattern: throw new Error(text || 'some fallback message')
    assert.match(
      fnSrc,
      /throw new Error\(\s*text\s*\|\|/,
      'throw must use `text || fallback` so the server response is included in the error'
    );
  });

  it('fallback error message mentions payment callback', () => {
    assert.match(
      fnSrc,
      /failed to process payment callback/,
      'fallback error must say "failed to process payment callback" for debuggability'
    );
  });
});

// ---------------------------------------------------------------------------
// Structural checks — fetch setup
// ---------------------------------------------------------------------------
describe('issue #826 — fetch setup: correct method, content-type, endpoint', () => {
  it('POSTs to /api/payments/ecpay/callback', () => {
    assert.match(fnSrc, /\/api\/payments\/ecpay\/callback/);
  });

  it('uses application/x-www-form-urlencoded', () => {
    assert.match(fnSrc, /application\/x-www-form-urlencoded/);
  });

  it('sends orderId in the form body', () => {
    assert.match(fnSrc, /form\.set\s*\(\s*['"]orderId['"]/);
  });

  it('conditionally appends tradeNo when present', () => {
    assert.match(fnSrc, /tradeNo/);
  });
});
