#!/usr/bin/env node
/**
 * Synthetic health probe — external liveness check before soft launch.
 * Issue #629
 *
 * Probes two targets:
 *   1. Root path  /          → must return 2xx
 *   2. Health API /api/health → must return 2xx + JSON { ok: true }
 *
 * Required env (at least one):
 *   NEXT_PUBLIC_VERCEL_URL   — base URL, e.g. "tour-platform.vercel.app"
 *
 * Optional env:
 *   TELEGRAM_BOT_TOKEN       — alert on failure
 *   TELEGRAM_CHAT_ID
 *   PROBE_TIMEOUT_MS         — per-request timeout in ms (default: 5000)
 *
 * Exit codes:
 *   0 — all probes passed (or env not configured — soft skip)
 *   1 — one or more probes failed
 */

const BASE_URL_RAW = process.env.NEXT_PUBLIC_VERCEL_URL ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? '5000');

// ---------------------------------------------------------------------------
// Graceful skip if base URL not configured
// ---------------------------------------------------------------------------
if (!BASE_URL_RAW) {
  console.warn(
    '[synthetic-health-probe] WARNING: NEXT_PUBLIC_VERCEL_URL not set — skipping probe. ' +
      'Configure it in GitHub repo Settings → Secrets → Actions to enable synthetic monitoring.',
  );
  process.exit(0);
}

// Normalise: ensure we have a full https:// URL
const BASE_URL = BASE_URL_RAW.startsWith('http') ? BASE_URL_RAW : `https://${BASE_URL_RAW}`;

// ---------------------------------------------------------------------------
// Telegram alert helper
// ---------------------------------------------------------------------------
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.warn('[synthetic-health-probe] Telegram send failed:', err?.message ?? err);
  }
}

// ---------------------------------------------------------------------------
// Probe helper
// ---------------------------------------------------------------------------
async function probe(label, url, opts = {}) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  let status = 0;
  let ok = false;
  let errorMsg = null;
  let responseBody = null;

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    status = res.status;
    ok = res.ok;

    if (opts.expectJson) {
      try {
        responseBody = await res.json();
      } catch {
        ok = false;
        errorMsg = 'response was not valid JSON';
      }

      if (ok && opts.expectJsonOk) {
        if (responseBody?.ok !== true) {
          ok = false;
          errorMsg = `expected { ok: true } but got ok=${responseBody?.ok}`;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      errorMsg = `request timed out after ${PROBE_TIMEOUT_MS}ms`;
    } else {
      errorMsg = err?.message ?? String(err);
    }
    ok = false;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - start;

  const result = {
    timestamp: new Date().toISOString(),
    label,
    target: url,
    status,
    ok,
    latencyMs,
    version: responseBody?.version ?? null,
    error: errorMsg,
  };

  if (ok) {
    console.log(JSON.stringify({ ...result }));
  } else {
    console.error(JSON.stringify({ ...result }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const targets = [
  { label: 'root', path: '/', expectJson: false, expectJsonOk: false },
  { label: 'api/health', path: '/api/health', expectJson: true, expectJsonOk: true },
];

const results = [];
for (const t of targets) {
  const url = `${BASE_URL}${t.path}`;
  const result = await probe(t.label, url, { expectJson: t.expectJson, expectJsonOk: t.expectJsonOk });
  results.push(result);
}

const failures = results.filter((r) => !r.ok);

if (failures.length > 0) {
  const lines = failures
    .map(
      (f) =>
        `  • \`${f.label}\` → status=${f.status || 'N/A'} latency=${f.latencyMs}ms${f.error ? ` error: ${f.error}` : ''}`,
    )
    .join('\n');

  const alertMsg = `*[Synthetic Health Probe FAILED]*\nBase: \`${BASE_URL}\`\n\n${lines}\n\nCheck GitHub Actions logs for details.`;

  console.error(`[synthetic-health-probe] ${failures.length} probe(s) FAILED`);
  await sendTelegram(alertMsg);
  process.exit(1);
} else {
  console.log(`[synthetic-health-probe] All ${results.length} probe(s) passed.`);
  process.exit(0);
}
