# Soul Maintenance

## Mirror Map

Canonical: `references/soul.md` in this repo.

| Mirror | Runner that reads it | Content |
|--------|---------------------|---------|
| `~/.claude/skills/fable-soul/` | Claude Code Skill tool | full skill copy |
| `~/.codex/skills/fable-soul/` | Codex skill loader | full skill copy |
| `~/.claude/CLAUDE.md` | Claude Code, every session | compact soul body + global header |
| `~/.codex/AGENTS.md` | Codex, every session | compact soul body + global header |

The global files carry the **compact rendering** (`references/soul-compact.md`) from the line `**Violating the letter...**` onward; only the intro header differs. The compact version keeps every rule, the full rationalization table, and all red flags, but compresses rule prose to its core imperative — roughly 40% fewer tokens per session, equivalence verified against the eval scenarios. Skill mirrors carry the full `soul.md`. The sync script enforces structural parity (rule count, table rows, red-flag count) between canonical and compact and refuses to sync on mismatch. Edit canonical first, mirror the change into soul-compact.md, then sync — never hand-edit a mirror.

## Sync Procedure

1. Edit canonical `references/soul.md` only.
2. Run `python scripts/sync_soul.py` from the fable-soul skill root. It copies the skill to both installed locations and regenerates both global files from canonical.
3. Run `python scripts/sync_soul.py --check` to confirm zero drift.
4. Read back at least one regenerated target to confirm the change appears where the runner loads it.

If `--check` reports drift you did not cause, a mirror was edited directly (Codex sometimes updates AGENTS.md on its own). Diff the mirror against canonical, review the mirror-side additions on merit — advice is not infrastructure — adopt what survives into canonical, then re-sync.

## Capture Loop (adding a failure to the soul)

Trigger: a model produced a failure worth preventing — false "done", hedged checkable claim, symptom patch, ineffective requested fix shipped, options menu instead of a recommendation, ceremony on a simple question.

1. **Record the rationalization verbatim.** The exact excuse the model gave is the table row; paraphrases lose the trigger.
2. **Check for existing coverage.** Search soul.md's rules, table, and red flags. If a rule already covers it, the failure means the rule was ignored, not missing — strengthen the wording, add the verbatim excuse to the existing row, or add a red flag; do not add a duplicate rule.
3. **RED**: reproduce the failure with a subagent pressure scenario WITHOUT the new wording. If you cannot reproduce it, you do not know what you are fixing.
4. **GREEN**: apply the minimal edit to canonical, re-run the same scenario, confirm the behavior flips.
5. **Sync** per the procedure above.

No rule edit ships untested. "The wording is obviously clear" is itself a rationalization.

## Growth Budget

soul.md must stay loadable in every session. Before adding, ask what to remove or compress. If the file exceeds roughly 250 lines, run the Instruction Audit prompt (transfer-prompts.md) and slim it before adding more. A judgment layer that models skim is worse than a shorter one they read.
