# GH-621 Booking V2 entry runtime note

## Runtime expectation (no production env mutation in this task)

- Traveler-facing booking entry should treat `BOOKING_V2` as the runtime default when `NEXT_PUBLIC_BOOKING_V2_ENABLED` is not explicitly set.
- `NEXT_PUBLIC_BOOKING_V2_ENABLED` remains the explicit override:
  - truthy (`1`, `true`, `yes`, `on`) -> force V2 entry (`/booking/[slug]`)
  - falsey (`0`, `false`, `off`, empty) -> explicit legacy fallback (`/checkout?...`)

## Why this matters for rollout

- API availability route already supports V2 default/fallback semantics under `BOOKING_V2` and query overrides.
- Aligning detail-page CTA routing with the same runtime default removes silent divergence where V2 availability is active but entry links still prefer legacy checkout.

## Manual smoke plan (not executed in this task)

1. Set `BOOKING_V2=true`, leave `NEXT_PUBLIC_BOOKING_V2_ENABLED` unset.
2. Open activity detail page and verify primary CTA links resolve to `/booking/[slug]` (top/sidebar/bottom/plan).
3. Set `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` and verify links switch to explicit legacy checkout fallback.
4. In V2 mode, trigger date/plan intent and verify fallback/source mismatch notices appear when availability API returns non-`v2` source.
