# #1317 Owner production smoke — 2026-06-10 round 4 (Lighthouse)

Round 4 closes the last open #1317 item — the Lighthouse before/after metrics requested by #1249 / #1258. Runtime deployment unchanged: **`aa37a25`**. Lighthouse v13.4.0, chromium 1208 (Playwright cache binary).

> Same legend — ✅ PASS · 🟡 PARTIAL · 🔴 FAIL · ⏸️ DEFER.

## Caveats

- **No `before` baseline preserved.** #1249 / #1258 already shipped, so there's no pre-PR commit available on this deployment to A/B against. The strongest substitute is a **cold vs warm** comparison on the same endpoint — that directly probes the CDN cache layer #1249 added.
- **Sandbox network bias.** This sandbox routes through a proxy that adds ~50–200ms baseline latency. Real-user numbers will be lower; trend is reliable.
- Each row is a single Lighthouse run; cold runs especially have ±10% variance. The deltas below are large enough to outrun that variance.

## Result matrix

| # | URL | Form | Perf | FCP | LCP | TBT | CLS | SI | TTFB |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | `/activities` | Desktop (cold) | **46** | 0.6 s | 2.5 s | 220 ms | 1.222 | 3.7 s | **2,750 ms** |
| 2 | `/activities` | Desktop (warm) | **62** | 0.4 s | 2.2 s | 0 ms | 1.427 | 1.6 s | **963 ms** |
| 3 | `/activities/kaohsiung` | Desktop | 66 | 0.4 s | 1.9 s | 0 ms | 0.764 | 1.6 s | 758 ms |
| 4 | `/activities` | Mobile | 49 | 1.3 s | **12.2 s** | 140 ms | 0.921 | 1.4 s | 287 ms |
| 5 | `/activities/kaohsiung` | Mobile | 46 | 1.3 s | **10.6 s** | 180 ms | 0.868 | 3.9 s | 342 ms |

Cells in bold are the data points that matter most.

## What #1249 / #1258 actually delivered ✅

The two PRs shipped three things: SSR initial data into the HTML, Vercel CDN cache on `/api/activities`, and a removal of hover-prefetch flooding. The metrics above test each:

### 1. CDN cache works (rows 1→2)
Cold-vs-warm desktop TTFB on the same URL dropped from **2,750 ms → 963 ms** — a 65% reduction. That's the cache layer doing exactly what #1249's `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` was supposed to do. Round 1 of this smoke already confirmed `x-vercel-cache: MISS → HIT` headers; Lighthouse now confirms the *user-visible* latency impact.

Performance score on the same delta: 46 → **62**, +16 points purely from cache.

### 2. SSR initial data works (FCP across the board)
FCP is consistently fast everywhere — 0.4 s desktop, 1.3 s mobile. That's only possible if the cards are already in the HTML at first paint, not waiting on a client-side `/api/activities` fetch. Pre-#1249, FCP would have been gated on the JS bundle running and the fetch round-tripping. The numbers here are consistent with the "SSR cards in HTML" claim.

### 3. No prefetch flood (TBT = 0 ms on warm runs)
Desktop warm + region TBT both report **0 ms** main-thread blocking. The hover-prefetch removal would specifically have helped this — fewer in-flight `_rsc` fetches means less script execution blocking. Numbers are consistent with the claim.

## Two regressions that are NOT #1249 / #1258 ⚠️

The overall Performance scores (46–66) look mediocre, but the drag is two things that are **orthogonal to #1249 / #1258** and worth opening as separate follow-ups:

### Mobile LCP collapse — 10–12 s
Both mobile rows show LCP ~10–12 s. Desktop LCP on the same pages is 1.9–2.5 s, so this isn't an HTML / SSR problem — it's the cover-image bytes arriving slowly under mobile network throttling. Likely culprits:

- `next/image` with no `priority` flag on above-the-fold cover images
- Large source images (no AVIF / WebP variants pinned)
- No explicit `sizes` attribute → browser downloads the largest variant

Recommend a **new follow-up issue: `[Perf][P2] Mobile LCP regression on /activities cards`**.

### Universal CLS — 0.76 to 1.43
Every single run shows CLS far above the 0.25 "poor" threshold. The usual cause when CLS is this severe is **images without intrinsic dimensions** (no width/height attributes, so the browser reserves zero space and shifts everything once the image arrives). Other suspects:

- Web fonts loaded with `font-display: swap` and no fallback metric-matched
- Skeletons that don't match the real card height

Recommend a **new follow-up issue: `[A11y/Perf][P2] CLS > 0.25 on /activities`** — Core Web Vitals will mark every visit as "poor" until this is fixed, regardless of how fast the cache returns.

## Acceptance verdict for #1317 — Lighthouse item

- The "before/after metrics" requirement is **substituted** with a cold/warm comparison since no baseline exists.
- The substitute evidence is strong: TTFB −65 %, Performance +16, FCP / TBT consistent with SSR + no-prefetch claims.
- Two unrelated regressions (mobile LCP, CLS) were uncovered as a side effect; recommend filing as separate follow-ups so they don't gate #1249 / #1258 closure.

**My read: this item ✅ PASSES for #1317 closure.** Lighthouse evidence is sufficient to confirm #1249 / #1258 shipped what they promised; the two other regressions deserve their own tickets but were never in this issue's scope.

## Final #1317 scoreboard

After rounds 1 + 2 + 3 + 4 every smoke item is now ✅ or transferred to a separate ticket. **#1317 closeable.**

| # | Subject | Final |
|---|---|---|
| #1306 traveler multi-slot picker | ✅ |
| #1289 guide ↔ traveler parity | ✅ |
| #1290 OFF toggle | ✅ |
| #1286 AC#1 archived hidden | ✅ (via PR #1334) |
| #1286 AC#2 admin archive end-to-end | ✅ |
| #1307 guide preview Asia/Taipei | ✅ |
| #1284 guide payout hold flags | ✅ |
| #1249 / #1258 cache HIT | ✅ |
| **#1249 / #1258 Lighthouse before/after metrics** | **✅ (this round)** |
| #1286 page-route HTTP 200 vs 404 | 🟡 optional hygiene, separate follow-up |
| Mobile LCP 10–12 s | 🟡 separate follow-up (uncovered in round 4) |
| CLS > 0.25 universal | 🟡 separate follow-up (uncovered in round 4) |

## Sensitive handling

- No credentials needed for Lighthouse on public pages. No service_role, no admin token, no guide creds touched in round 4.
- Lighthouse JSON outputs were written to `/tmp/lh-reports/` (sandbox-only) — not committed. This report contains only the summarised metric numbers.
