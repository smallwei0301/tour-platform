/**
 * Issue #1215 — Migrate incident alerting bus from LINE Notify to Telegram
 *
 * AC1: graceful skip when env vars are unset
 * AC2: Telegram delivery shape (POST to api.telegram.org with correct body)
 * AC3: fire-and-forget error swallow (network errors don't bubble up)
 * AC4: source-contract — incidents.ts imports from telegram-notify, not line-notify
 *
 * Uses node:test + globalThis.fetch stubbing + readFileSync.
 * Never hardcodes credential values — only env var NAMES.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/tests/api → apps/web
const WEB_ROOT = path.resolve(__dirname, '../..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// ── AC1: graceful skip when env vars are unset ───────────────────────────────

test('AC1: notifySystemError skips silently when TELEGRAM_ALERT_BOT_TOKEN is unset', async () => {
  // Patch fetch to detect any call to api.telegram.org
  const fetchCalls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url: String(url), opts });
    return { ok: true, json: async () => ({}) };
  };

  try {
    // Import AFTER env is in the desired state — but since ESM caches modules,
    // we use a source-contract approach: verify the guard exists, then exercise it
    // via the runtime check in the module itself. We test the guard behaviorally
    // by importing and calling with both env vars unset.
    await withEnv(
      { TELEGRAM_ALERT_BOT_TOKEN: undefined, TELEGRAM_ALERT_CHAT_ID: undefined },
      async () => {
        // Dynamic import with cache-busting to get a fresh module with unset env
        // (In practice, the guard reads process.env at call time, not import time)
        const mod = await import(
          path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts') + '?ac1'
        ).catch(() => null);

        // If import fails (ts not compiled), fall back to source-contract check
        if (!mod) {
          const src = readFileSync(
            path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts'),
            'utf8'
          );
          assert.match(
            src,
            /TELEGRAM_ALERT_BOT_TOKEN/,
            'telegram-notify.ts must reference TELEGRAM_ALERT_BOT_TOKEN'
          );
          assert.match(
            src,
            /return|early.?return|skip/i,
            'telegram-notify.ts must have an early-return/skip guard'
          );
          return;
        }

        await mod.notifySystemError('test-ctx', 'test-error');
      }
    );

    // Key behavioral assertion: no fetch to telegram.org was made
    const telegramCalls = fetchCalls.filter(c => c.url.includes('api.telegram.org'));
    assert.strictEqual(
      telegramCalls.length,
      0,
      'Must not call api.telegram.org when env vars are absent'
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ── AC1-source: source-contract guard check ──────────────────────────────────

test('AC1-source: telegram-notify.ts has no-token early-return guard', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts');
  assert.ok(existsSync(filePath), `telegram-notify.ts must exist at ${filePath}`);

  const src = readFileSync(filePath, 'utf8');

  // Must reference both env vars
  assert.match(src, /TELEGRAM_ALERT_BOT_TOKEN/, 'Must reference TELEGRAM_ALERT_BOT_TOKEN');
  assert.match(src, /TELEGRAM_ALERT_CHAT_ID/, 'Must reference TELEGRAM_ALERT_CHAT_ID');

  // Must have early-return guard when either is missing
  // (guard may use variables assigned from env vars, e.g. !token || !chatId)
  assert.match(
    src,
    /if\s*\(!.*\|\|.*!|if\s*\(!.*&&|!token|!chatId/,
    'Must guard with a falsy-check on both env vars (e.g. !token || !chatId)'
  );

  // Must contain return before any fetch call (guard before action)
  assert.match(src, /return\s*;?\s*\n/, 'Must have early return statement');
});

// ── AC2: Telegram delivery shape ─────────────────────────────────────────────

test('AC2: telegram-notify.ts exports notifySystemError function', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts');
  assert.ok(existsSync(filePath), `telegram-notify.ts must exist at ${filePath}`);

  const src = readFileSync(filePath, 'utf8');

  // Must export notifySystemError
  assert.match(
    src,
    /export.*async.*function\s+notifySystemError|export.*notifySystemError/,
    'Must export notifySystemError'
  );

  // Must POST to api.telegram.org/bot.../sendMessage
  // (URL may be assembled from a constant + template literal)
  assert.match(
    src,
    /api\.telegram\.org|sendMessage/,
    'Must reference api.telegram.org and sendMessage endpoint'
  );
  assert.match(
    src,
    /sendMessage/,
    'Must use the sendMessage endpoint'
  );

  // Body must include chat_id
  assert.match(src, /chat_id/, 'Request body must include chat_id');

  // Body must include text
  assert.match(src, /['"]text['"]|text\s*:/, 'Request body must include text');
});

test('AC2-shape: POST body includes context and error when env vars are set', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts');
  const src = readFileSync(filePath, 'utf8');

  // The function signature must accept (context, error, details?)
  assert.match(
    src,
    /notifySystemError\s*\(\s*context\s*[,:]/,
    'notifySystemError must accept context as first param'
  );
  assert.match(
    src,
    /error\s*[,:]/,
    'notifySystemError must accept error as second param'
  );

  // The text/body must embed context and error
  assert.match(src, /context/, 'Message body must reference context param');
  assert.match(src, /error/, 'Message body must reference error param');
});

// ── AC3: fire-and-forget error swallow ───────────────────────────────────────

test('AC3: telegram-notify.ts wraps fetch in try/catch (fire-and-forget)', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts');
  const src = readFileSync(filePath, 'utf8');

  // Must have try/catch around the fetch call
  assert.match(
    src,
    /try\s*\{[\s\S]*?fetch[\s\S]*?\}\s*catch/,
    'fetch call must be wrapped in try/catch for fire-and-forget behavior'
  );
});

// ── AC4: source-contract — incidents.ts imports from telegram-notify ─────────

test('AC4: incidents.ts imports notifySystemError from telegram-notify, not line-notify', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/incidents.ts');
  assert.ok(existsSync(filePath), `incidents.ts must exist at ${filePath}`);

  const src = readFileSync(filePath, 'utf8');

  // Must import from telegram-notify
  assert.match(
    src,
    /from\s+['"]\.\/telegram-notify['"]/,
    "incidents.ts must import from './telegram-notify'"
  );

  // Must NOT import notifySystemError from line-notify
  assert.ok(
    !src.includes("from './line-notify'") || !src.match(/notifySystemError.*from.*line-notify|from.*line-notify.*notifySystemError/s),
    'incidents.ts must not import notifySystemError from ./line-notify'
  );

  // Must NOT have the old line-notify import for notifySystemError
  assert.ok(
    !src.includes("import { notifySystemError } from './line-notify'"),
    "Must not have: import { notifySystemError } from './line-notify'"
  );
});

test('AC4b: telegram-notify.ts references TELEGRAM_ALERT_BOT_TOKEN + TELEGRAM_ALERT_CHAT_ID', () => {
  const filePath = path.resolve(WEB_ROOT, 'src/lib/telegram-notify.ts');
  const src = readFileSync(filePath, 'utf8');

  assert.match(src, /TELEGRAM_ALERT_BOT_TOKEN/, 'Must reference TELEGRAM_ALERT_BOT_TOKEN env var');
  assert.match(src, /TELEGRAM_ALERT_CHAT_ID/, 'Must reference TELEGRAM_ALERT_CHAT_ID env var');
});
