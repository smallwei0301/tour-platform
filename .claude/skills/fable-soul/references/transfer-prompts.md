# Skill Transfer Prompts

Use these prompts when the user wants to turn a stronger model's judgment, past sessions, postmortems, or project history into durable skills. Treat them as starting points, not magic text. Adapt them to the repo and verify the output before installing it.

Operating notes for every transfer:

- **Coverage accounting.** A conversion of any source corpus (a prompt, a postmortem, an advice thread) is complete only when every source section is explicitly marked: implemented, adapted, unsupported, or not applicable. An unaccounted section is a silent drop.
- **Smallest durable surface.** Match each lesson to the lightest home that fits: a one-off prompt beats a repo instruction file beats a skill beats a plugin. Do not build heavy infrastructure for a one-time behavior.
- **Cost.** Distillation sessions are expensive — run the discovery phase read-only first, and budget before fanning out authoring agents.

## Departing Principal Prompt

Goal: make a stronger model convert its project judgment into a skill library that weaker/cheaper models can use.

Template:

```text
You are the retiring principal engineer for this project. Your final task is to turn your judgment into durable operating infrastructure for future agents and mid-level engineers.

Do not write skills yet. First inspect the repo as if you are inheriting it: README and manifests, build/test entry points, CI, docs, recent git history, reverted or stalled work, TODO/FIXME hotspots, deploy/generated artifact conventions, and project memory/notes.

Ask at most five questions, only for gaps the repo cannot answer:
1. hardest live problem,
2. unwritten discipline rules,
3. future audience and what they do not know,
4. past failures that wasted the most time,
5. what a genuine breakthrough means here.

Then propose a skill library where each skill is justified by a workflow, failure mode, external contract, or maintenance burden. Each skill must include:
- exact trigger description,
- when not to use it and which sibling skill to use instead,
- commands and expected observations where relevant,
- known traps and wrong paths,
- proof required before claiming completion,
- provenance and re-verification commands for drift-prone facts.

When sources disagree, trust them in this order: checked-out code > tests and fixtures > CI config > build scripts and manifests > runtime and deploy scripts > official docs > git history > issues, TODOs, and notes > inference from patterns (which must be labeled as inference).

Do not mutate the repo outside the requested skills/staging folder. Mark unproven claims as candidate/open.
```

## Instruction Audit Prompt

Goal: find stale, contradictory, over-prescriptive, or weaker-model-era instructions before adding more rules.

Template:

```text
Read the instruction files end to end: AGENTS.md, SKILL.md, references, rules, memory files, and any workflow docs the runner actually loads.

Report only; do not fix yet.

1. Where do rules contradict each other? Quote or cite both sides with file paths.
2. Which rules exist only to compensate for a weaker model or a past tool limitation? Explain whether the failure mode still exists.
3. Which rules teach by bad example because the document violates the pattern it prescribes?
4. Which rules are duplicated across layers? Identify the canonical home and the copies that should be removed or compressed.
5. What would you keep, cut, or rewrite? For each change, name the failure mode, trigger, proof surface, and strip condition.
```

## Failure Archaeology Prompt

Goal: prevent future agents from re-fighting settled bugs, rejected fixes, or dead-end investigations.

Template:

```text
Build a failure archaeology record for this project.

Mine git history, reverted commits, issue-shaped docs, TODO/FIXME hotspots, test failures, postmortems, and recent chat/session notes. Record only failures with evidence.

For each entry, capture:
- symptom,
- wrong hypotheses tried,
- root cause,
- evidence that proved it,
- fix or decision,
- current status,
- what future agents must not repeat,
- command or file path that re-verifies the status.

Do not turn speculation into history. If evidence is incomplete, mark the entry candidate and state what would confirm it.
```

## Executable Campaign Prompt

Goal: produce a decision-gated plan for the hardest live problem, with branch points and measurable success.

Template:

```text
Design an executable campaign for the hardest live problem in this repo.

The campaign must have numbered phases, exact files to inspect or change, exact commands to run, expected observations at every gate, and branch instructions for surprising results.

For each phase include:
- objective,
- mechanism being tested,
- commands or observations,
- expected output,
- if output differs, what hypothesis changes,
- hasty-agent trap to avoid,
- promotion criteria before moving to the next phase.

Success must be measurable. Do not rely on visual judgment, vibes, or "should pass" language.
```

## Fresh Verifier Prompt

Goal: keep long-running work grounded by checking claims against independent evidence.

Template:

```text
Before reporting progress or completion, run a fresh verification pass.

Use a separate verifier context when available. The verifier should compare claims against tool outputs, source files, tests, public endpoints, or artifacts from this session. It must flag:
- claims without evidence,
- skipped checks,
- tests that failed or were not run,
- invented paths, commands, or metrics,
- weakened assertions or changed acceptance criteria.

Report only verified outcomes as complete. Everything else is changed-but-unverified, blocked, or out of scope.
```

## Skill Library Review Prompt

Goal: audit a generated skill library before installation.

Template:

```text
Review the complete skill library in three passes, then apply blocking and important fixes only.

FACTUAL: re-check commands, flags, paths, citations, and volatile facts against the repo or source of truth.

DOCTRINE: find contradictions with project rules, missing gates, overstated claims, and any skill that routes around change control.

USABILITY: check trigger quality, sibling routing, duplication, self-containedness, scannability, and whether a zero-context mid-level engineer or cheaper model can use it.

Sizing: aim for roughly 10-16 skills; merge thin ones, split deep ones. Recommend a loading order (architecture contract, then change control, then build/env, then validation, then debugging).

Review discipline: fix findings against the standards that already exist — do not invent new standards mid-review, and do not rewrite passing material for taste.

Quality gate: from the library alone, a zero-context reader must be able to answer — what must not break, how to prove a fix is real, and which past failures must not be repeated.

Finish with the skill inventory, the coverage accounting (implemented / adapted / unsupported / not applicable per source section), what was verified by spot check, unresolved uncertainty, and the next refresh trigger.
```
