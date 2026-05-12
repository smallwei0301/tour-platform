# QA Seed Scripts

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
