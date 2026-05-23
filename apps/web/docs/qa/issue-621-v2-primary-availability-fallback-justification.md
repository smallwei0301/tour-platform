# GH-621 V2-primary availability fallback justification (API/data)

## Scope and guardrails

- This card performs API/data-level classification only.
- No production env mutation.
- No production DB/payment/order mutation.
- Runtime probe evidence is sanitized and read-only.

## Sanitized runtime evidence (controller-side read-only probes)

Preview target: `tour-platform-qcl2lcqlo-smallwei0301s-projects.vercel.app`

- `GET /api/activities/hualien-river-trekking/availability?v2=1&participants=1&timezone=Asia/Taipei`
  - HTTP 200
  - `x-availability-source: legacy-fallback`
  - `data.source: legacy_fallback`
  - schedules_count: 5
- `GET /api/activities/kaohsiung-chaishan-cave-experience/availability?v2=1&participants=1&timezone=Asia/Taipei`
  - HTTP 200
  - `x-availability-source: v2`
  - `data.source: v2`
  - schedules_count: 0
- `GET /api/activities/dadadaocheng-walk/availability?v2=1&participants=1&timezone=Asia/Taipei`
  - HTTP 200
  - `x-availability-source: legacy-fallback`
  - `data.source: legacy_fallback`
  - schedules_count: 5
- `GET /api/activities/taipei-night-market-food-tour/availability?v2=1&participants=1&timezone=Asia/Taipei`
  - HTTP 404

## Classification result

`hualien-river-trekking` is not an approved V2-positive fixture for GH-621 smoke.

Reason:
1) GH-621 V2-primary evidence requires API source to be V2 (`x-availability-source: v2` and `data.source: v2`).
2) This slug currently returns explicit fallback markers (`legacy-fallback` / `legacy_fallback`).
3) Route contract intentionally labels this case as fallback (not canonical V2), so it must be treated as HOLD evidence for V2-primary readiness.

Therefore this is a fixture-selection mismatch for V2-positive smoke criteria, not proof that fallback labeling is broken.

## Code-contract corroboration (local, no runtime mutation)

`apps/web/app/api/activities/[slug]/availability/route.ts` behavior:
- V2 mode first attempts `getV2ActivityAvailability(...)`.
- If V2 path throws, handler intentionally falls back to legacy schedule loading and returns:
  - body `source: 'legacy_fallback'`
  - header `x-availability-source: 'legacy-fallback'`

This matches the runtime observation above and confirms fallback is explicit-by-design.

## Replacement fixtures recommendation

Approved replacement for this card's V2-positive probe:
- `kaohsiung-chaishan-cave-experience` (already returns `source: v2` in preview probe)

Additional third-fixture recommendation (for Rita blocker closure):
- Run a read-only `v2=1` probe sweep over public listed slugs and select one that satisfies:
  - HTTP 200
  - `x-availability-source: v2`
  - `data.source: v2`
- Only slugs meeting all three are acceptable V2-positive fixtures.

## NOT_AUTOMATABLE note

In-worker direct `.vercel.app` curl is runtime-gated by lookalike-TLD policy in this environment, so preview probes were collected controller-side and consumed as sanitized evidence.
