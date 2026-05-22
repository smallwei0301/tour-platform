# QA Verification — PRs #599/#601 Schema/RLS Repairs — 2026-05-23

**Issue:** #608 ([QA] Verify payment events and guide payout schema repairs after #599/#601)
**Risk treatment:** HIGH_RISK (supabase-rls, payment) — contract tests only; live Supabase drift preflight deferred to operator with DB access.

## Deploy SHA
`bf657702033b91beca8985387b9ef772f21e65b9` (from /api/health, 2026-05-23)
PR #601 (guide email schema) merged 2026-05-18; PR #599 (schema RLS artifacts) merged 2026-05-18 — both included in production SHA.

## Contract Test Results

| Test file | PRs | Pass | Fail |
|---|---|---|---|
| issue598-payment-events-rls-hardening-contract | #599 (#597/#598 artifacts) | **4/4 PASS** | 0 |
| issue600-payout-guide-email-schema-contract | #601 (#600 guide email) | **3/3 PASS** | 0 |

**Total: 7/7 PASS**

### Key findings:
- `payment_events` table: anon/authenticated/public privileges REVOKED ✓; service_role privileges retained ✓
- `guide_profiles.guide_email` contract column: migration present ✓; payout query reads correctly ✓
- No regression to payment_events access model from pre-#597 state

## Deferred (HIGH_RISK policy)
- Live `scripts/production-schema-drift-preflight.mjs` run: requires Supabase service_role or direct DB connection — not available in agent env. Operator should run this with: `SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/production-schema-drift-preflight.mjs`
- ECPay callback smoke: deferred per HIGH_RISK policy (requires ECPay sandbox credentials)
- Live anon/auth/service_role access test against production Supabase (no creds available)

## Cross-references
- #597/#598 CLOSED (schema repair artifacts)
- #600 CLOSED (guide email schema fix)
- #602: sensitive-table RLS/grants preflight (still open — escalates this issue)
- #596: daily QA context (prior cutoff)

## Evidence sanitization
No secrets, tokens, credentials, connection strings, RLS keys, or PII in this report.

## Verdict: PARTIAL_PASS
Contract tests pass. Live Supabase schema drift preflight requires operator with DB credentials before soft-launch sign-off.
