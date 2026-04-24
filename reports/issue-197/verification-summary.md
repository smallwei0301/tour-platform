# Issue #197 Verification Summary

## 1) SQL evidence (before / after)

### Before (mismatch sample)
Source: `before-mismatch-sample.csv`

```csv
id,status,payment_status,payment_status_row
9ac1693c-54d4-49f6-8f02-37759e5cc42a,paid,pending,paid
```

### Replay command (idempotent callback)
Source: `replay-result.txt`

```sql
select * from fn_process_payment_callback_atomic(
  '9ac1693c-54d4-49f6-8f02-37759e5cc42a'::uuid,
  'ISSUE197-REPLAY',
  null,
  '{"source":"issue-197-verification"}'::jsonb
);
```

### After (same sample)
Source: `after-mismatch-sample.csv`

```csv
id,status,payment_status,payment_status_row
9ac1693c-54d4-49f6-8f02-37759e5cc42a,paid,paid,paid
```

## 2) payment-status-update verification pack

Command:

```bash
cd apps/web && node --test tests/api/payment-status-update-verification-pack.test.mjs
```

Result:
- success path ✅
- mismatch healing path ✅
- total: 2 passed, 0 failed

## 3) Migration apply

Applied migration file:
- `supabase/migrations/20260424203000_issue197_sync_orders_payment_status_callback.sql`

Apply log:
- `migration-apply.log`
