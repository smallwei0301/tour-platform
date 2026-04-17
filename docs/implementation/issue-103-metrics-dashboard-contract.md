# Issue #103 — Booking V2 Metrics / Dashboard Contract (Artifact v1)

Status: Draft for QA review (planning artifact)
Owner: Tracy
Depends on: #96 rollout contract
Related: #103, #104, #105

---

## 1) Metrics Contract

## 1.1 Funnel metrics (required)
| Metric | Source | Definition |
|---|---|---|
| `booking_page_view` | events | Entered booking page (first page-level exposure) |
| `begin_checkout` | events | User started checkout intent |
| `purchase_intent` | events | Draft/order intent created |
| `payment_callback_received` | events | Payment callback arrived |
| `payment_succeeded` | events | Payment success confirmed |
| `booking_v2_fallback_clicked` | events | User explicitly switched from V2 to legacy fallback |

## 1.2 Error metrics (required)
| Metric | Source | Definition |
|---|---|---|
| `events.error` | events | Generic front/back tracked error event count |
| `error_rate_vs_page_view` | computed | `events.error / booking_page_view` |
| `api_5xx_rate` (optional v1.1) | logs | 5xx responses in booking-related APIs |

## 1.3 Latency metrics (required if instrumentation exists)
| Metric | Source | Definition |
|---|---|---|
| `available_slots_loaded.latency_ms` | events.properties | slots query latency |
| `booking_draft_created.latency_ms` | events.properties | draft creation latency |
| `checkout_initiated.latency_ms` | events.properties | checkout init latency |

## 1.4 Outcome metrics (required)
| Metric | Source | Definition |
|---|---|---|
| `orders.paid` | orders | paid orders count in window |
| `orders.failed` | orders | failed payment orders count |
| `bookings.completed` | bookings | completed bookings count |
| `bookings.cancelled` | bookings | cancelled bookings count |

---

## 2) Rollout Dimensions (minimum)

Required dimensions for all dashboard aggregations:

1. `rollout_variant`: `legacy | v2`
2. `time_window`: default 24h (configurable)
3. `env`: production / preview (if available)

Recommended next dimensions (v1.1):
- `activity_slug`
- `region`
- `source_channel`

## Dimension contract rules
- `booking_page_view` must always carry `rollout_variant`.
- `booking_v2_fallback_clicked` must always carry `rollout_variant='v2'`.
- If a metric lacks `rollout_variant`, it is counted in `unknown` bucket and cannot be used for rollout decisions.

---

## 3) First-pass Data Source / Query Design

## Primary source
- Supabase tables via REST:
  - `events`
  - `orders`
  - `bookings`

## Query mechanism
- Script: `scripts/rollout/booking-v2-dashboard.mjs`
- Output:
  - timestamped JSON/MD snapshots
  - `booking-v2-dashboard-latest.json`
  - `booking-v2-dashboard-latest.md`

## Minimal query model
1. Count funnel events by event_name
2. Split key events by `properties.rollout_variant`
3. Count order/booking status in same time window
4. Derive ratios:
   - begin_checkout_rate
   - purchase_intent_rate
   - payment_success_rate
   - fallback_rate_vs_v2_page_view

## Data quality checks (required)
- If `booking_page_view_v2 = 0`, fallback rate must be reported as `N/A` (not forced 0)
- If latency sample `< 10`, mark latency confidence as low
- If unknown rollout bucket > 5%, output warning flag in report

---

## 4) Decision Signals (GO / HOLD / ROLLBACK WATCH)

## GO
- Payment success rate stable vs baseline (no material degradation)
- Fallback rate in acceptable range (team-defined threshold)
- No callback/oversell invariant breach
- No sustained API 5xx anomalies in booking flow

## HOLD
- Metrics inconclusive (insufficient sample / unknown bucket too high)
- Fallback rate elevated but not critical
- Latency regression noticeable but not incident-level

## ROLLBACK WATCH
- Callback success drops sharply
- Oversell-protection semantic anomalies detected
- Fallback rate spikes above threshold
- Booking APIs show sustained 5xx pattern

## Invariant precedence
If callback/oversell invariant is violated, decision is **not GO** regardless of other metrics.

---

## 5) Definition of Done for #103 (artifact scope)
- [ ] Metrics contract agreed and documented
- [ ] Minimum dimensions documented and enforced in report schema
- [ ] First-pass query/data-source design documented and executable
- [ ] GO/HOLD/ROLLBACK WATCH decision rules documented
- [ ] QA can test consistency/testability without needing full BI UI
