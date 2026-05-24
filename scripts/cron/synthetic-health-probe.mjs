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
 *   GITHUB_TOKEN / GH_TOKEN  — create/update GitHub issues on failure
 *   GITHUB_REPOSITORY        — "owner/repo" (e.g. "smallwei0301/tour-platform")
 *   GITHUB_REF_NAME          — branch/tag name (defaults to "staging")
 *   GITHUB_SHA               — commit SHA
 *   DRY_RUN                  — if "1", print issue JSON to stdout instead of posting
 *
 * Exit codes:
 *   0 — all probes passed (or env not configured — soft skip)
 *   1 — one or more probes failed
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

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
// Issue pipeline helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build a stable fingerprint string for a failure.
 * @param {{ checkName: string, endpoint: string, httpStatus: number|string, errorMsg: string }} opts
 * @returns {string}
 */
function buildFingerprint({ checkName, endpoint, httpStatus, errorMsg }) {
  const normalizedName = (checkName ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const normalizedEndpoint = (endpoint ?? '').trim();
  const normalizedStatus = String(httpStatus ?? 'N/A');
  const normalizedError = (errorMsg ?? '')
    // Strip ISO timestamps like 2024-01-02T03:04:05.123Z (before lowercasing so T matches)
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/gi, '')
    .toLowerCase()
    // Strip version segments like 1.2.3
    .replace(/\d+\.\d+\.\d+/g, '')
    // Collapse whitespace to hyphens
    .replace(/\s+/g, '-')
    // Truncate to 80 chars
    .slice(0, 80);

  return `${normalizedName}|${normalizedEndpoint}|${normalizedStatus}|${normalizedError}`;
}

/**
 * Redact secrets and PII from text, then truncate to 120 lines.
 * @param {string} text
 * @returns {string}
 */
function sanitizeForIssueBody(text) {
  if (!text) return '';

  let sanitized = text
    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [REDACTED]')
    // JWTs (eyJ...)
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[REDACTED]')
    // Postgres/PostgreSQL connection strings
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[REDACTED]')
    // GitHub personal access tokens
    .replace(/ghp_[A-Za-z0-9]{36}/g, '[REDACTED]')
    // Slack tokens
    .replace(/xox[baprs]-[A-Za-z0-9\-]+/g, '[REDACTED]')
    // AWS access key IDs
    .replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED]')
    // Resend API keys
    .replace(/re_[A-Za-z0-9]{32,}/g, '[REDACTED]')
    // Supabase service role / anon keys
    .replace(/sbp_[A-Za-z0-9]{32,}/g, '[REDACTED]')
    // Email addresses
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[REDACTED]')
    // Authorization headers
    .replace(/Authorization:\s*.+/gi, 'Authorization: [REDACTED]');

  const lines = sanitized.split('\n');
  if (lines.length > 120) {
    sanitized = lines.slice(0, 120).join('\n') + '\n... (truncated)';
  }

  return sanitized;
}

/**
 * Build the GitHub issue title for a probe failure.
 * @param {{ label: string, target: string, status: number }} failure
 * @returns {string}
 */
function buildIssueTitle(failure) {
  const env = process.env.GITHUB_REF_NAME ?? 'staging';
  const endpoint = (() => {
    try {
      return new URL(failure.target).pathname;
    } catch {
      return failure.target ?? '/';
    }
  })();
  const status = failure.status || 'N/A';
  return `[Auto Check] ${env} healthcheck failed at ${endpoint} (status=${status})`;
}

/**
 * Build the GitHub issue body from a failure result.
 * @param {{ failure: object, fingerprint: string, relatedClosed: number[] }} opts
 * @returns {string}
 */
function buildIssueBody({ failure, fingerprint, relatedClosed }) {
  const env = process.env.GITHUB_REF_NAME ?? 'staging';
  const sha = process.env.GITHUB_SHA ?? 'unknown';
  const shortSha = sha.slice(0, 7);
  const nodeVersion = process.version ?? 'unknown';

  const endpoint = (() => {
    try {
      return new URL(failure.target).pathname;
    } catch {
      return failure.target ?? '/';
    }
  })();

  const logPreview = sanitizeForIssueBody(
    failure.error
      ? `Error: ${failure.error}\nStatus: ${failure.status || 'N/A'}\nLatency: ${failure.latencyMs}ms`
      : `Status: ${failure.status || 'N/A'}\nLatency: ${failure.latencyMs}ms`,
  );

  const relatedSection =
    relatedClosed && relatedClosed.length > 0
      ? relatedClosed.map((n) => `- Previous duplicate: #${n} (closed)`).join('\n')
      : '<!-- No previous closed duplicates found -->';

  return `Automated synthetic health probe detected a failure.

**Fingerprint:** \`${fingerprint}\`

## Environment

- Branch: ${env}
- Commit: ${shortSha}
- Node version: ${nodeVersion}

## Check details

- Check label: ${failure.label ?? 'unknown'}
- URL: ${failure.target ?? 'unknown'}
- Expected: 2xx${failure.label === 'api/health' ? ' + { ok: true }' : ''}
- Actual status: ${failure.status || 'N/A'}
- Latency: ${failure.latencyMs}ms

## Log preview (max 120 lines)

\`\`\`
${logPreview}
\`\`\`

## Rerun command

Paste this command to reproduce locally:

\`\`\`bash
NEXT_PUBLIC_VERCEL_URL=<your-staging-url> node scripts/cron/synthetic-health-probe.mjs
\`\`\`

## Related history

${relatedSection}

## No-secrets declaration

_This issue body was auto-generated and sanitized. No credentials or secrets should appear above._`;
}

/**
 * Search GitHub for open issues with this fingerprint in the body.
 * @param {{ fingerprint: string, token: string, repo: string, fetchFn?: Function }} opts
 * @returns {Promise<{ number: number, html_url: string }|null>}
 */
async function findExistingIssue({ fingerprint, token, repo, fetchFn }) {
  const doFetch = fetchFn ?? globalThis.fetch;
  const escapedFingerprint = encodeURIComponent(`"${fingerprint}"`);
  const searchUrl = `https://api.github.com/search/issues?q=repo:${repo}+is:issue+is:open+in:body+${escapedFingerprint}`;

  const res = await doFetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub search failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0];
  }
  return null;
}

/**
 * Create or update a GitHub issue for a probe failure.
 * If DRY_RUN=1, prints JSON to stdout instead of posting.
 * Never throws — on API error, logs warning + Telegram alert and returns { skipped: true }.
 *
 * @param {{ failure: object, token: string, repo: string, fetchFn?: Function }} opts
 * @returns {Promise<{ action: string, issueNumber?: number, skipped?: boolean, error?: string }>}
 */
async function createOrUpdateIssue({ failure, token, repo, fetchFn }) {
  const doFetch = fetchFn ?? globalThis.fetch;

  const endpoint = (() => {
    try {
      return new URL(failure.target).pathname;
    } catch {
      return failure.target ?? '/';
    }
  })();

  const fingerprint = buildFingerprint({
    checkName: failure.label ?? 'unknown',
    endpoint,
    httpStatus: failure.status,
    errorMsg: failure.error ?? '',
  });

  const title = buildIssueTitle(failure);
  const labels = ['triaged', 'type:investigation', 'priority:P2', 'qa', 'infra', 'owner:ai-agent', 'status:needs-repro'];

  // DRY_RUN mode — print JSON, skip API calls
  if (process.env.DRY_RUN === '1') {
    const body = buildIssueBody({ failure, fingerprint, relatedClosed: [] });
    console.log(JSON.stringify({ action: 'dry-run', title, body, fingerprint, labels }, null, 2));
    return { action: 'dry-run' };
  }

  // Missing credentials — warn + Telegram
  if (!token || !repo) {
    console.warn('[synthetic-health-probe] GITHUB_TOKEN or GITHUB_REPOSITORY missing, skipping issue creation');
    await sendTelegram(
      `*[Synthetic Health Probe]* GitHub issue creation skipped — GITHUB_TOKEN or GITHUB_REPOSITORY not configured.`,
    );
    return { skipped: true };
  }

  try {
    // Search for existing open issue with same fingerprint
    const existing = await findExistingIssue({ fingerprint, token, repo, fetchFn: doFetch });

    if (existing) {
      // Comment on the existing issue with updated evidence
      const commentUrl = `https://api.github.com/repos/${repo}/issues/${existing.number}/comments`;
      const commentBody = buildIssueBody({ failure, fingerprint, relatedClosed: [] });
      const commentRes = await doFetch(commentUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ body: `## Updated evidence (${new Date().toISOString()})\n\n${commentBody}` }),
      });

      if (!commentRes.ok) {
        const errBody = await commentRes.text().catch(() => '');
        throw new Error(`GitHub comment failed: ${commentRes.status} ${errBody.slice(0, 200)}`);
      }

      console.log(`[synthetic-health-probe] Commented on existing issue #${existing.number}`);
      return { action: 'commented', issueNumber: existing.number };
    }

    // Create new issue
    const body = buildIssueBody({ failure, fingerprint, relatedClosed: [] });
    const createUrl = `https://api.github.com/repos/${repo}/issues`;
    const createRes = await doFetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body }),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => '');
      throw new Error(`GitHub issue create failed: ${createRes.status} ${errBody.slice(0, 200)}`);
    }

    const created = await createRes.json();
    const issueNumber = created.number;

    // Apply labels in a second call
    const labelsUrl = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`;
    const labelsRes = await doFetch(labelsUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ labels }),
    });

    if (!labelsRes.ok) {
      // Non-fatal: log warning but continue
      const errBody = await labelsRes.text().catch(() => '');
      console.warn(`[synthetic-health-probe] Label apply failed: ${labelsRes.status} ${errBody.slice(0, 200)}`);
    }

    console.log(`[synthetic-health-probe] Created new issue #${issueNumber}: ${created.html_url}`);
    return { action: 'created', issueNumber };
  } catch (err) {
    const errMsg = err?.message ?? String(err);
    console.warn(`[synthetic-health-probe] Issue creation/update failed: ${errMsg}`);
    await sendTelegram(`*[Synthetic Health Probe]* GitHub issue operation failed: ${errMsg.slice(0, 200)}`);
    return { skipped: true, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Exports (must come before main execution guard)
// ---------------------------------------------------------------------------
export { buildFingerprint, sanitizeForIssueBody, buildIssueTitle, buildIssueBody, createOrUpdateIssue };

// ---------------------------------------------------------------------------
// Probe helper (only used in direct execution)
// ---------------------------------------------------------------------------
async function probe(label, url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      errorMsg = `request timed out after ${timeoutMs}ms`;
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
// Main (only runs when this file is executed directly, not when imported)
// ---------------------------------------------------------------------------
import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const BASE_URL_RAW = process.env.NEXT_PUBLIC_VERCEL_URL ?? '';
  const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? '5000');

  // Graceful skip if base URL not configured
  if (!BASE_URL_RAW) {
    console.warn(
      '[synthetic-health-probe] WARNING: NEXT_PUBLIC_VERCEL_URL not set — skipping probe. ' +
        'Configure it in GitHub repo Settings → Secrets → Actions to enable synthetic monitoring.',
    );
    process.exit(0);
  }

  // Normalise: ensure we have a full https:// URL
  const BASE_URL = BASE_URL_RAW.startsWith('http') ? BASE_URL_RAW : `https://${BASE_URL_RAW}`;

  const targets = [
    { label: 'root', path: '/', expectJson: false, expectJsonOk: false },
    { label: 'api/health', path: '/api/health', expectJson: true, expectJsonOk: true },
  ];

  const results = [];
  for (const t of targets) {
    const url = `${BASE_URL}${t.path}`;
    const result = await probe(t.label, url, { expectJson: t.expectJson, expectJsonOk: t.expectJsonOk, timeoutMs: PROBE_TIMEOUT_MS });
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

    // Issue pipeline: create or update GitHub issues for each failure
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    for (const failure of failures) {
      await createOrUpdateIssue({ failure, token, repo });
    }

    process.exit(1);
  } else {
    console.log(`[synthetic-health-probe] All ${results.length} probe(s) passed.`);
    process.exit(0);
  }
}
