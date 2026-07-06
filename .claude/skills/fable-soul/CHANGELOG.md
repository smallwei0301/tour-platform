# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-07-03

Cuts the always-on token cost by ~40% with no loss of function, verified by evals.

### Added

- **`references/soul-compact.md`** — a token-lean rendering of the soul: every rule (compressed to its core imperative), the full rationalization table and all red flags verbatim, and the GREEN-tested key sentences preserved. Measured: 14,023 → 8,430 chars (~4,000 → ~2,400 tokens per session).
- **Structural parity gate** in `sync_soul.py`: rule count, rationalization rows, and red-flag count must match between canonical and compact, or the sync refuses to run. A parity unit test backs it.
- **Snapshot caveat** documented in `references/evals.md` (measured, not assumed): subagents inherit the parent session's startup snapshot of global instruction files, so newly synced rules never reach same-session subagents — test new wording in-prompt or in a fresh session.

### Changed

- The sync script now installs the compact rendering into global files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`); skill mirrors keep the full `soul.md`.
- Equivalence verified on Haiku with the compact body: manufactured-findings and stale-green scenarios both hold (recorded in `references/evals.md`).
- Update checker tracks `soul-compact.md`; README documents the compact install.

## [1.0.1] - 2026-07-03

New mechanisms added to the judgment layer. Every rule change went through the capture loop's RED-GREEN test before shipping — receipts in `references/evals.md`.

### Added

- **Rule 20 — Confirm before flagging** (`references/soul.md`): a reported problem needs a verified fault behind it; a warning raised without a confirmed defect is itself an error. RED-GREEN tested: without the rule, a Haiku-class model padded four fake findings into a correct function; with it, the same model verified and reported "no problems found".
- **Stale-verification reset** (Proof Contract, `references/soul.md`): a later change that touches earlier verified work resets that verification; a green result recorded before the change is not completion evidence. RED-GREEN tested: without it, the model claimed completion citing a pre-change pass and invented a verification; with it, it refused completion and named the reset check.
- **Escalation path** (Red Flag Recovery): when changing angle twice still fails, escalate — stronger reasoning or model, or hand the gathered evidence back to the user.
- **Resume discipline** (rule 9): when resuming interrupted or summarized work, re-inspect current files and state before trusting prior conclusions.
- One new rationalization-table row ("看起來可能有問題，先列出來比較保險") and two new Red Flags (unconfirmed problem about to be reported; completion report citing a verification that predates a change to the same code).
- **`references/evals.md`** — a standing suite of 10 behavioral pressure scenarios with 0–2 scoring, run instructions, and the recorded RED-GREEN results from this release.
- **`references/worked-examples.md`** — captured real failures with before/after receipts, including a harness-default commit trailer overriding an explicit user constraint, and the two eval scenarios above.
- **`examples/hooks.json`** — opt-in Claude Code Stop hook that re-fires the core Red Flags deterministically every turn, independent of context length.
- **`scripts/test_sync_soul.py`** — unit tests for the sync script: body-marker extraction, generation of missing global files, regeneration of stale ones, and the foreign-file guard.
- **Transfer-mode operating notes** (`references/transfer-prompts.md`): coverage accounting (every source section marked implemented / adapted / unsupported / not applicable), smallest-durable-surface rule (prompt < instruction file < skill < plugin), and a cost note for distillation sessions.
- **Departing Principal prompt**: source-priority ladder for disagreeing sources (checked-out code > tests > CI > build scripts > deploy scripts > docs > git history > notes > labeled inference).
- **Skill Library Review prompt**: sizing guidance (aim for 10–16 skills; merge thin, split deep), recommended loading order, no-new-standards-mid-review discipline, and a zero-context quality gate.
- **SKILL.md**: Maintain mode now includes running the evals after rule changes and offering (never silently installing) the hook enforcement layer; Evidence Gates now require accepted review findings to be resolved with evidence or explicitly closed.

### Changed

- `scripts/check_update.py` now tracks all new files.
- Evidence Gates reference `references/evals.md` as the documentation home for RED-GREEN baselines.
- README (en + zh-TW): updated file tree; FAQ now points to the in-repo receipts (evals + worked examples) and documents the hook enforcement option.

### Rejected (documented for transparency)

- A "warning accumulation" rule (stop and surface after three unsurfaced minor anomalies) was tested and **not** added: the RED test could not reproduce the failure — the existing rules already stopped the model. Per the capture loop's own discipline (no reproduction, no rule), it remains only as regression scenario 10 in `references/evals.md`.

## [1.0.0] - 2026-07-03

Initial public release.

- `references/soul.md` — 19 judgment rules, Operating Gates (Mode Selector, Task Start Gate, Proof Contract, Red Flag Recovery), the verbatim rationalization table, and the pre-reply Red Flags checklist.
- `SKILL.md` — three operating modes: Embody, Maintain, Transfer.
- `references/maintenance.md` — mirror map, sync procedure, capture loop (RED-GREEN), growth budget.
- `references/transfer-prompts.md` — six transfer prompt templates: Departing Principal, Instruction Audit, Failure Archaeology, Executable Campaign, Fresh Verifier, Skill Library Review.
- `scripts/sync_soul.py` — single-source sync to skill mirrors and global instruction files, with drift detection and a guard against overwriting files it did not generate.
- `scripts/check_update.py` — read-only upstream update checker, with an opt-in weekly schedule offer on first use.
- `scripts/validate_skill.py` — package structure validation.
- Bilingual documentation (README.md, README.zh-TW.md), MIT license.

[1.0.2]: https://github.com/akseolabs-seo/fable-soul/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/akseolabs-seo/fable-soul/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akseolabs-seo/fable-soul/releases/tag/v1.0.0
