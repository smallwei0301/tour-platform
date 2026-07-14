# QA Scripts

## admin-evidence-sweep.mjs

Produces a deterministic evidence manifest for Tour Platform admin QA review. It scans current repo paths, tests, UI callers, and GitHub issue/PR metadata, then writes:

- `manifest.json` — machine-readable evidence for Rita/reviewer use
- `report.md` — human-readable summary table

This script does **not** certify product behavior; it only prepares evidence for report-quality review.

### Usage

```bash
npm run qa:admin-evidence-sweep -- \
  --surface admin-booking-v2 \
  --output /tmp/wf_tp_admin_booking_sweep/latest/manifest.json
```

Known surfaces:

- `admin-booking-v2`
- `admin-availability-v2`

Use `--no-github` for local-only scans when GitHub CLI is unavailable.

## seed-qa-test-orders.mjs

Seeds two test orders for the QA traveler (Rita) in the production database:

1. A `paid` order linked to the first open activity schedule with `start_at > now + 7 days`
2. A `completed` order for the same activity (uses a past schedule if available)

Both orders are tagged `qa-seed:rita:v1` in `admin_note`.

### Usage

```bash
SUPABASE_URL=<url> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
TOUR_PLATFORM_TRAVELER_EMAIL=<rita-qa-email> \
  node scripts/qa/seed-qa-test-orders.mjs
```

### Output

```
https://tour-platform-nine.vercel.app/me/orders/<paid-order-uuid>
https://tour-platform-nine.vercel.app/me/orders/<completed-order-uuid>
```

Rita can navigate directly to these URLs to QA the order detail pages.

### Idempotency

Re-running the script with the same env vars will detect the existing orders (matched by `contact_email + status IN ('paid','completed') + admin_note LIKE '%qa-seed:rita%'`) and print their URLs without inserting duplicates.

### Error handling

The script exits with code 1 and prints a clear message to stderr if:
- Any required env var is missing
- No suitable future schedule is found
- Any Supabase operation fails
