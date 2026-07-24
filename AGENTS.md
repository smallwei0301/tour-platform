# AGENTS.md

This file exists only to hold the `mattpocock/skills` engineering-skill config below. It does **not** replace `CLAUDE.md`, which remains the primary entry point for every session — `CLAUDE.md` is a harness governance file (protected by its own 十條鐵律 第9條) and this setup deliberately avoids editing it. Read `CLAUDE.md` first; this file only matters when you're running one of the `mattpocock-skills` engineering skills (`/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, `/domain-modeling`, …).

## Agent skills

### Issue tracker

GitHub Issues on `smallwei0301/tour-platform`, via the `gh` CLI (or the GitHub MCP tools where `gh` isn't available). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root, deferring to the existing `.cursor/harness/**` and `docs/04-tech/**` docs wherever they already cover the same ground. See `docs/agents/domain.md`.
