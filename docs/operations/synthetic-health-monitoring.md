# Synthetic Health Monitoring

Issue: #629 — Add external synthetic health checks before soft launch

## Overview

An automated external liveness probe runs every 15 minutes via GitHub Actions. It checks two public targets and alerts via Telegram on failure.

## Health Endpoint Contract

**Route:** `GET /api/health`

**Response shape (HTTP 200):**

```json
{
  "ok": true,
  "status": "ok",
  "service": "tour-platform",
  "timestamp": "2026-05-22T10:00:00.000Z",
  "version": "abc1234"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `ok` | boolean | Always `true` on success |
| `status` | string | Always `"ok"` |
| `service` | string | Always `"tour-platform"` |
| `timestamp` | string | ISO 8601 UTC timestamp of the request |
| `version` | string | `VERCEL_GIT_COMMIT_SHA` or `"unknown"` if not set |

**Status codes:**
- `200` — service is live
- Any non-2xx — treat as outage

**Timeout budget:** 5 seconds (configured via `PROBE_TIMEOUT_MS` env var in the probe script).

**Cache policy:** `Cache-Control: no-store` — every request hits the origin, never a CDN cache layer.

**Auth:** None. The endpoint is entirely public and excluded from middleware auth matchers.

## What is NOT in the Response

- No PII (names, emails, phone numbers)
- No secrets or credentials
- No database query results
- No admin data
- No payment data

The endpoint is intentionally minimal: it only proves the Next.js server process is alive.

## Probe Targets

| Label | URL | Validation |
|-------|-----|------------|
| `root` | `https://{BASE_URL}/` | HTTP 2xx |
| `api/health` | `https://{BASE_URL}/api/health` | HTTP 2xx + `{ ok: true }` in JSON body |

## Alert Path

```
GitHub Actions cron (*/15 * * * *)
  → scripts/cron/synthetic-health-probe.mjs
    → On failure: POST to Telegram bot
    → GitHub Actions job fails (visible in repo Actions tab)
```

Telegram secrets must be configured as GitHub repo secrets:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `NEXT_PUBLIC_VERCEL_URL` (the Vercel deployment URL, without `https://`)

If `NEXT_PUBLIC_VERCEL_URL` is not set, the probe exits 0 (soft skip) — it will not fail CI during local development or on forks.

## Probe Script

**File:** `scripts/cron/synthetic-health-probe.mjs`

Each probe result is logged as a JSON line to stdout:

```json
{
  "timestamp": "2026-05-22T10:00:01.234Z",
  "label": "api/health",
  "target": "https://tour-platform.vercel.app/api/health",
  "status": 200,
  "ok": true,
  "latencyMs": 312,
  "version": "abc1234",
  "error": null
}
```

Probe results are uploaded as GitHub Actions artifacts (retained 7 days).

## GitHub Actions Workflow

**File:** `.github/workflows/synthetic-health-probe.yml`
**Schedule:** `*/15 * * * *` (every 15 minutes)
**Manual trigger:** `workflow_dispatch` supported (run from Actions tab)

## Middleware Exclusion Confirmation

The Next.js middleware (`apps/web/middleware.ts`) uses an explicit path `matcher` that does NOT include `/api/health`. The health endpoint bypasses all auth middleware by design.

## Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| GitHub Actions jitter (±1–2 min scheduling lag) | Low | Acceptable for a 15-min window |
| Co-outage (GitHub Actions + Vercel both down simultaneously) | Medium | Probe would not fire; accepted as unlikely — upgrade to third-party monitor post-launch |
| CDN partial cache serving stale 200 | Low | Mitigated by `Cache-Control: no-store` |
| Probe false-positive during Vercel deployment rollout | Low | Transient; next probe window clears |

## Upgrading to Third-Party Monitor (Accepted Deferred Risk)

After soft launch, consider adding an independent synthetic monitor (UptimeRobot, Better Stack / BetterUptime) that probes from outside GitHub's infrastructure:

1. Add monitor pointing to `https://{VERCEL_URL}/api/health`
2. Alert channel: Telegram or email
3. Check interval: 1–5 minutes
4. This eliminates the GitHub co-outage blind spot

This is deferred as an accepted risk for soft launch (#629). Track as a P1 post-launch ops item.

## Cross-References

- Issue #629 — this feature
- Issue #607 — production alert drill evidence (alert channel validation)
- Issue #329 — admin health dashboard (separate, admin-authenticated health data)
- `docs/operations/booking-v2-daily-go-no-go.md` — daily GO/HOLD decision packet (complements synthetic monitoring)
