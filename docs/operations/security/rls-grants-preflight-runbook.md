# RLS / Grants Preflight Runbook

**Script:** `scripts/security/rls-grants-preflight.mjs`
**Issue:** #602 — [Security] Add sensitive-table RLS/grants preflight before soft-launch sign-off
**Related:** #597, #598 (payment_events RLS hardening), #508 (sensitive data classification)

---

## What the Script Checks

The preflight script connects to Supabase using a service-role key and audits the following for every sensitive table:

1. **RLS policy permissiveness** — queries `pg_policies` via a dedicated RPC function. Flags any policy where the `USING` or `WITH CHECK` expression is `true` (or `(true)`) and the policy applies to the `anon`, `authenticated`, or `public` role. Such policies bypass row-level security for all rows.

2. **Role table grants** — queries `information_schema.role_table_grants` via RPC. Flags any `SELECT`, `INSERT`, `UPDATE`, or `DELETE` grant given directly to `anon`, `authenticated`, or `public` on a sensitive table. These grants let those roles execute DML regardless of RLS.

### Sensitive Tables Audited

| Table | Risk |
|---|---|
| `payment_events` | Raw ECPay webhook payloads, trade numbers |
| `refund_requests` | Refund state, error logs |
| `payments` | Payment records |
| `payouts` | Guide payout disbursements |
| `guide_balances` | Guide financial balances |
| `settlement_rules` | Commission rates, T+N rules |
| `soft_launch_controls` | Feature flag / gate controls |
| `orders` | Order records (if table exists) |
| `bookings` | Booking records (if table exists) |

### Forbidden Roles for Direct Access

`anon`, `authenticated`, `public`

---

## How to Run

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret> \
  node scripts/security/rls-grants-preflight.mjs
```

**JSON output** (machine-readable, suitable for CI evidence):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/security/rls-grants-preflight.mjs --json
```

**Write report to file:**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/security/rls-grants-preflight.mjs --json --output /tmp/rls-preflight.json
```

**Help / usage:**

```bash
node scripts/security/rls-grants-preflight.mjs --help
```

---

## Exit Codes and Meaning

| Exit Code | `overall_status` | Meaning |
|---|---|---|
| `0` | `pass` | No violations found on any sensitive table. Safe to proceed with soft-launch sign-off. |
| `1` | `fail` | One or more violations found. Do NOT sign off. Investigate and remediate before re-running. |
| `1` | `unknown` | RPC functions are missing or env vars absent. Cannot determine status — treat as blocked. |

### PASS

All sensitive tables have non-permissive RLS policies and no direct grants to `anon`/`authenticated`/`public`. The soft-launch gate for RLS readiness is clear.

### FAIL

One or more sensitive tables have either:
- A policy with `USING(true)` or `WITH CHECK(true)` scoped to a forbidden role, or
- A direct `SELECT`/`INSERT`/`UPDATE`/`DELETE` grant to a forbidden role.

Review the `violations` array in the JSON output. Common remediation:
- Drop the overly permissive policy and replace with a role-scoped policy.
- Revoke the broad grant: `REVOKE ALL ON TABLE <table> FROM anon, authenticated, public;`
- See `supabase/migrations/20260518_issue598_payment_events_rls_hardening.sql` for a reference pattern.

### UNKNOWN

RPC helper functions (`rls_grants_preflight_check_policies`, `rls_grants_preflight_check_grants`) are not deployed, or environment variables are missing. Run `node scripts/security/rls-grants-preflight.mjs --help` for env var requirements.

---

## Prerequisites

The script calls two Supabase RPC functions that must be deployed to your project before the preflight can run:

```sql
-- Deploy via migration or psql before running the preflight.
-- See issue #602 for full migration SQL.
create or replace function rls_grants_preflight_check_policies(p_table text)
  returns table (policyname text, roles text, cmd text, qual text, with_check text)
  language sql security definer as $$
    select policyname, roles::text, cmd::text, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = p_table;
$$;

create or replace function rls_grants_preflight_check_grants(p_table text)
  returns table (grantee text, privilege_type text, is_grantable text)
  language sql security definer as $$
    select grantee, privilege_type, is_grantable
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = p_table;
$$;
```

---

## Who Should Run This

| Role | When |
|---|---|
| **Release Owner** | Before every soft-launch sign-off. Required gate. |
| **Engineering Lead** | After any migration that touches RLS policies or grants on sensitive tables. |
| **Security Reviewer** | As part of periodic security audits. |

Attach the JSON output (`--json --output <path>`) to the release checklist issue as evidence.

---

## History

- **2026-05**: Initial script — issue #602.
- **2026-05**: `payment_events` RLS hardened — issues #597, #598. Script validates this remains in place.
- **Ref**: #508 — sensitive data classification that identified these tables as high-risk.

---

## Automated Workflow

A GitHub Actions workflow runs this script automatically every Monday at 03:00 UTC and can also be triggered manually via `workflow_dispatch`.

**Workflow file:** `.github/workflows/rls-grants-preflight.yml`

**Required secrets** (set in repo Settings → Secrets → Actions):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service-role secret key (**never** anon key)

**If secrets are not configured:** The run produces a `HOLD` artifact and exits 0 (visible hold, not silent skip).

**Artifact:** Download `rls-preflight-<run-id>` from the workflow run to view the full JSON result. The artifact is retained for 30 days.

**Important:** This workflow performs read-only catalog checks. It does **not** modify RLS policies, grants, or production schema. All production changes require explicit human approval.
