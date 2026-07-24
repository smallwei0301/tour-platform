# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (single-context layout — this repo is one Next.js app, `@tour/web`, not a monorepo of packages).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- The existing harness docs still take priority for anything they already cover: `.cursor/harness/00_INDEX.md` (session start), `docs/04-tech/04-tech-architecture/*` (V2 API contract, payment callback atomicity, availability copy decision), `docs/operations/*` (rollback runbook, migration ledger SOP). `CONTEXT.md`/ADRs are for domain vocabulary and decisions not already captured there — don't duplicate the harness docs.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
└── apps/web/src/
```

The `package.json` `workspaces: ["apps/*"]` field is npm-workspaces scaffolding, not a real monorepo — only `apps/web` exists. Treat this repo as single-context.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`, and stay consistent with terms already fixed by `BRAND_BOOK.md` (user-facing copy) and the harness docs (technical terms like V2/legacy, booking/order/payment). Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR — or an existing harness decision such as the V2-only booking migration (#1407) or the cross-surface availability copy decision (#1321) — surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
