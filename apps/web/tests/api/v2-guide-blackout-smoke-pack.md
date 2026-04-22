# TP-BP-012B — Guide Blackout Regression Pack

Run locally / CI:

```bash
pnpm --dir apps/web test:smoke:guide-blackout
```

Coverage map:

- `tests/slot-generator.test.mjs` (bounded via `--test-name-pattern`)
  - blackout window filtering
  - slot vs blackout conflict detection
  - blackout protection during slot validation

Acceptance mapping:

- blackout scenario regression pass → bounded `slot-generator.test.mjs` blackout cases
- blackout 與 booking / availability 交互條件有明確測試證據 → bounded `slot-generator.test.mjs` blackout cases + `v2-guide-blackout-contract.test.mjs`
- 可重跑，適合納入 regression pipeline → `pnpm --dir apps/web test:smoke:guide-blackout`

Scope guard:

- This pack is isolated to guide blackout / availability / booking interaction.
- It does not bundle booking-core smoke, POS flow, or LINE draft flow.
