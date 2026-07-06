# Fable Soul

English | [繁體中文](README.zh-TW.md)

**A judgment layer for AI coding agents — make your AI think, verify, and communicate like a senior engineer.**

MIT licensed · Works with Claude Code & Codex · Pure Markdown + two small Python scripts, no dependencies

---

## The problem

Most AI agent failures are not knowledge failures. The model knows how to write the code. What it lacks is *judgment* — the operating discipline a senior engineer applies without thinking:

| What the agent does | What a senior engineer does |
|---------------------|------------------------------|
| Edits a file, says **"Done! Fixed the bug."** — never ran anything | Runs the test, pastes the output, *then* says done |
| Bumps the timeout because you asked, knowing it won't help | Tells you the timeout isn't the cause, finds what is |
| **"This should be much faster now"** | "3.4s → 0.06s, measured" |
| Patches the symptom so the error message goes away | States the mechanism in one sentence, fixes *that* |
| Diagnoses the real bug, then asks **"want me to fix it?"** | Fixes it — it's in scope and reversible |
| Explains away a surprising test result to keep its story tidy | Stops and digs — surprise is where the real bug lives |
| Answers a one-line question with a 5-section report | Answers in a sentence |

Fable Soul packages the right-hand column as loadable rules. Every rule was captured from a **real agent failure**, written to prevent that specific failure, and tested to confirm it actually changes behavior. It is not a collection of "best practices" prose — it is operating infrastructure.

## What's inside

```
fable-soul/
├── SKILL.md                        # Skill entry point (3 modes: Embody / Maintain / Transfer)
├── references/
│   ├── soul.md                     # The judgment rules — the core of this project
│   ├── soul-compact.md             # Token-lean rendering installed into global files (~40% smaller)
│   ├── maintenance.md              # Mirror map, sync procedure, failure-capture loop
│   ├── transfer-prompts.md         # 6 prompt templates for turning experience into skills
│   ├── evals.md                    # Behavioral eval scenarios + recorded RED-GREEN runs
│   └── worked-examples.md          # Captured failures with before/after receipts
├── examples/
│   └── hooks.json                  # Optional Stop-hook enforcement for Claude Code
└── scripts/
    ├── sync_soul.py                # Sync rules to all install locations, detect drift
    ├── check_update.py             # Compare local files against the upstream repo
    ├── validate_skill.py           # Structural validation for the skill package
    └── test_sync_soul.py           # Unit tests for the sync script
```

## Module 1 — The judgment rules (`references/soul.md`)

The core file. ~250 lines, loaded into every session. Three layers:

### Operating Gates

Executable checkpoints, not vibes:

- **Mode Selector** — a simple question gets a direct answer; an execution task gets the full gates; high-stakes/client-facing work gets strengthened evidence requirements. No ceremony on things that don't need it.
- **Task Start Gate** — before acting, the agent must be able to answer: what outcome does the user actually need (*goal*), why does the situation behave this way (*mechanism*), and what observation will prove success (*proof*). Missing an answer → gather the cheapest evidence that fills it.
- **Proof Contract** — verification matched to task type. A code bug is proven by a reproducing test and its output. A frontend change is proven by loading the page and inspecting rendered state. A publishing/SEO task is proven against source files, APIs, or public endpoints. A weaker check may never masquerade as the real one.
- **Red Flag Recovery** — each failure signal maps to a concrete recovery action. No mechanism? Reproduce or read the smallest code path that explains it. Same failure twice? Name the assumption that may be wrong and switch layer, tool, or hypothesis.

### The 19 rules

A sample (full text in [soul.md](references/soul.md)):

1. **The goal, not the stated fix** — a user's proposed solution is a hypothesis, not the goal. Never ship a change you believe is ineffective.
2. **Root cause before any fix** — if you cannot explain WHY the bug happens, you are not ready to fix it. Patches come back.
3. **Verify before claiming** — a successful file edit proves you typed, not that it works. "Changed but not yet verified" is a legal status; "fixed" without running it is not.
4. **Finish the work** — for reversible, in-scope work: do it, don't ask. Stopping at diagnosis is stopping at 90%.
5. **Lead with the outcome** — the first sentence answers "what happened", not background or process.
6. **Calibrated honesty** — mark the boundary between "I ran it and saw X" and "I expect Y but haven't tested", every time.
7. **Self-refute before finishing** — one honest attempt to break your own conclusion before declaring it.
10. **Measure instead of hedging** — a hedge word on a checkable claim means you skipped a cheap test.
11. **Investigate by splitting hypotheses** — list mechanisms, run the cheapest discriminating observation, repeat. No shotgun fixes.
12. **Surprise is signal** — never explain away a result that contradicts your expectation.
13. **Stuck means change angle, not effort** — the third identical attempt will fail like the first two.
16. **Commit to a judgment** — an options menu without a recommendation is abdication.
17. **Scope integrity** — out-of-scope discoveries get flagged, not silently fixed and not silently dropped.

### The rationalization table & Red Flags

The part that makes this different from advice. Models don't fail because rules are missing — they fail by *rationalizing around* the rules. So the soul carries a table of the exact excuses models give, captured verbatim from real sessions, each mapped to why it's wrong:

| Excuse | Reality |
|--------|---------|
| "The edit succeeded, so it's done" | An edit proves you typed. Run it before saying done. |
| "The test will probably pass" | "Probably" is a guess. Run it or say it's unverified. |
| "This case is too simple to verify" | Simple cases fail too, and verification takes seconds. |
| "I already pointed out the real problem" | Pointing at the bug is diagnosis, not delivery. Fix it. |
| "Asking first is safer" | Asking about reversible in-scope work blocks the user for nothing. |
| "Let me read a few more files to be safe" | Reading without a hypothesis is procrastination with a good conscience. |

Plus a **Red Flags checklist** the agent runs before ending every turn — e.g. *"your last paragraph is a question about work you could just do"*, *"a hedge word sits on a claim you could verify right now"*, *"you just explained away a result that surprised you"*. Any hit → run the matching recovery action, then finish properly.

## Module 2 — Three operating modes (`SKILL.md`)

- **Embody** — load the rules into the current session and work that way. Silently: the agent never narrates the rules to the user, it just behaves.
- **Maintain** — grow the rules from your agent's own failures using a RED–GREEN loop (see below), keep every install location in sync, and periodically audit/slim so the file stays short enough that models actually read it.
- **Transfer** — turn a stronger model's advice, postmortems, or session lessons into durable skills. The standard: preserve the *mechanism*, not the aura. Every kept rule needs a failure mode it prevents, a trigger, a changed behavior, a proof surface, and a strip condition.

## Module 3 — Transfer prompts (`references/transfer-prompts.md`)

Six battle-tested prompt templates for converting experience into infrastructure:

| Prompt | What it does |
|--------|--------------|
| **Departing Principal** | Makes a strong model act as a retiring principal engineer: inspect the repo, ask at most five questions, then convert its judgment into a skill library that weaker/cheaper models can execute |
| **Instruction Audit** | Finds stale, contradictory, duplicated, or weaker-model-era rules across all your instruction files — before you add more |
| **Failure Archaeology** | Mines git history, reverted commits, and postmortems into an evidence-backed record so future agents don't re-fight settled bugs |
| **Executable Campaign** | Produces a decision-gated plan for your hardest live problem: exact files, exact commands, expected observations, and branch instructions for surprising results |
| **Fresh Verifier** | An independent verification pass that flags claims without evidence, skipped checks, and invented paths/metrics before "complete" is reported |
| **Skill Library Review** | Three-pass audit (factual / doctrine / usability) of a generated skill library before installation |

## Module 4 — Sync & drift tooling (`scripts/`)

The rules live in **one** canonical file; everywhere else is a script-managed mirror. This matters because instruction files drift — you edit one copy, forget the others, and six weeks later your agent behaves differently per machine.

- `sync_soul.py` — copies the skill to `~/.claude/skills/` and `~/.codex/skills/`, and regenerates the global instruction files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) from canonical. `--check` reports drift without changing anything — wire it into CI or a shell alias.
- **Safety guard**: the script will **not** overwrite a global file it didn't generate. If you already have your own `CLAUDE.md`, you get a skip warning, not a clobbered file.
- `check_update.py` — compares your local copy against this repo's `main` branch and lists which files have upstream updates. Read-only; it never modifies anything. On first use, the skill offers to set up a **weekly automatic update check** for you (via cron, Task Scheduler, or your runner's scheduling feature) — it only creates the schedule if you say yes.
- `validate_skill.py` — checks frontmatter, reference links, and package structure.

## Install

**Option A — skill only (non-invasive).** Copy this folder to your skills directory:

```bash
# Claude Code
cp -r fable-soul ~/.claude/skills/fable-soul

# Codex
cp -r fable-soul ~/.codex/skills/fable-soul
```

The rules load when the skill is invoked (or when the runner's skill-matching triggers it).

**Option B — always-on (recommended).** Run the sync script from the repo root:

```bash
python scripts/sync_soul.py          # install everywhere + generate global files
python scripts/sync_soul.py --check  # verify everything is in sync
```

This makes the rules load in **every** session via your global instruction file. The global file gets the **compact rendering** (`references/soul-compact.md`) — every rule, the full rationalization table, and all red flags, at roughly 40% fewer tokens per session; the sync script enforces structural parity with the full version and refuses to sync on mismatch. If you already have a `CLAUDE.md` / `AGENTS.md`, the script skips it — paste the body of `references/soul.md` (from the line `**Violating the letter...**` onward) into your existing file instead.

**Other runners.** Any agent that reads Markdown instructions can use this: point it at `references/soul.md`, or paste the body into whatever global-instructions mechanism your runner has.

**Staying up to date.** Run `python scripts/check_update.py` anytime to see whether upstream has changed, or accept the weekly scheduled check the skill offers on first use.

## Growing your own rules — the capture loop

This is the part most rule collections get wrong. Rules copied from blog posts don't stick, because they weren't written against *your* agent's failures. The capture loop is TDD for instructions:

1. Your agent ships a false "done", hedges a checkable claim, or makes an excuse — **record the rationalization verbatim.** The exact wording is the trigger; paraphrases lose it.
2. **Check for existing coverage.** If a rule already covers it, the failure means the rule was ignored, not missing — strengthen the wording or add the excuse to the table. Don't add a duplicate rule.
3. **RED** — reproduce the failure in a fresh session *without* the new wording. If you can't reproduce it, you don't know what you're fixing.
4. **GREEN** — apply the minimal edit, re-run the same scenario, confirm the behavior flips.
5. **Sync** — `python scripts/sync_soul.py`, then read back one target to confirm the change landed where the runner loads it.

**Growth budget:** if `soul.md` exceeds ~250 lines, slim before adding. A judgment layer the model skims is worse than a shorter one it reads. The Instruction Audit prompt exists for exactly this.

## Design principles

- **Single source of truth.** One canonical file, script-regenerated mirrors, mechanical drift detection. Never hand-edit a mirror.
- **Rules must be executable.** Every rule needs a failure mode it prevents, a trigger that loads it, a changed behavior, and a proof surface. If a rule cannot change a future action or verification step, it doesn't get in. "Think harder" prose doesn't qualify.
- **Advice is not infrastructure.** A tip from a Reddit post or a stronger model earns its place only by surviving the capture loop — reproduce the failure, prove the wording flips it.
- **Violating the letter of the rules is violating their spirit.** The rules are written to close loopholes, and the rationalization table exists because models are creative about finding them.

## FAQ

**Does this replace my project's CLAUDE.md / AGENTS.md?**
No — it's a layer, not a replacement. The soul defines *how to think* (verification discipline, investigation method, communication); your project files define *what to do* (build commands, conventions, architecture). They compose.

**Will this make my agent slower or more verbose?**
The opposite, mostly. Several rules exist specifically to kill ceremony: answer simple questions directly, no headers on one-topic answers, brevity through selection not compression, act when you have enough evidence.

**Why not just use a bigger model?**
Do both. Bigger models make fewer judgment errors but still make them — and the capture loop works on any model's failures. The Transfer mode exists precisely to distill a stronger model's judgment into rules a cheaper model can execute.

**How do I know the rules actually work?**
The receipts are in the repo: [worked-examples.md](references/worked-examples.md) shows captured failures with their before/after behavior, and [evals.md](references/evals.md) is a standing suite of 10 pressure scenarios with recorded RED–GREEN runs (e.g. a Haiku-class model padding four fake findings into a correct function without rule 20, and reporting "no problems found" with it). Run the suite yourself against your own model.

**Can the rules be enforced, not just remembered?**
Partly. `examples/hooks.json` shows a Claude Code Stop hook that re-fires the core Red Flags deterministically on every turn — useful on long sessions where model discipline fades. It's opt-in; merge it into your settings only if you want it.

## License

[MIT](LICENSE)

---

*Fable Soul is an independent open-source project. Not affiliated with any AI vendor.*
