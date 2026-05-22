# GitHub Issue Routing and Classification SOP

This SOP defines how Tour Platform issues should be named, labeled, and written so both humans and AI agents can quickly decide:

1. Who owns the next decision or execution step.
2. Whether an AI agent can start immediately.
3. Which issue an AI agent should pick first.
4. How completion must be verified.

## Current repository label baseline

The repository already has these useful labels:

- Business priority: `priority:P0`, `priority:P1`, `priority:P2`
- Work type: `type:bug`, `type:feature`, `type:investigation`, `type:optimization`, `type:security`
- Agent routing: `agent:now`, `agent:next`, `agent:queued`, `agent:backlog`
- Common domain/quality labels: `guide-dashboard`, `qa`, `csrf`, `security`
- State-ish labels: `triaged`, `stale`
- Legacy GitHub defaults: `bug`, `documentation`, `enhancement`, etc.

For new issue triage, prefer the normalized labels:

- `type:*` over legacy `bug` / `enhancement`
- `priority:*` over legacy `P0` / `P1`
- `agent:*` only for AI execution routing, not business urgency

## Recommended additional labels

Create these labels if the repo does not already have them.

### Owner labels

These answer: who owns the next step?

- `owner:human-decision` — a human must choose a policy, product behavior, business rule, UX direction, data action, or risk acceptance before execution.
- `owner:ai-agent` — an AI agent can execute directly with the information in the issue.
- `owner:mixed` — an AI agent may investigate and propose options, but a human must decide before implementation or merge.

### Readiness labels

These answer: can work begin now?

- `status:ready` — enough information exists to start.
- `status:needs-repro` — first task is to reproduce or rule out the report.
- `status:needs-info` — blocked on missing URL, account context, screenshot, logs, expected behavior, or acceptance criteria.
- `status:needs-decision` — blocked on a human decision.
- `status:blocked` — blocked by an external dependency or prerequisite issue.
- `status:in-progress` — someone or an agent is actively working.
- `status:needs-review` — implementation exists and needs review/verification.
- `status:verified` — fix or outcome has been verified.

### Additional type labels

- `type:decision` — the issue exists to capture a human decision.
- `type:docs` — documentation/runbook/spec update.
- `type:qa` — QA checklist, test coverage, regression verification, or production smoke.

### Domain labels

Add domain labels gradually as needed. Recommended examples:

- `admin-guides`
- `guide-dashboard`
- `traveler-booking`
- `payments`
- `orders`
- `auth`
- `database`
- `rls`
- `notifications`
- `infra`
- `docs`
- `qa`

## Issue title naming rules

Use this format:

```text
[Area] Verb target symptom/outcome
```

Examples:

```text
[Admin Guides] Fix guide detail page showing 找不到導遊資料 after guide application
[Payments] Investigate ECPay callback race causing inconsistent order status
[Decision] Choose refund retry policy for failed ECPay callbacks
[Guide Dashboard] Add blackout date editor for guide availability
[QA] Verify Booking V2 checkout fallback after launch
```

### Area prefix

Use a stable area prefix so humans and agents can scan the list quickly:

- `[Admin Guides]`
- `[Guide Dashboard]`
- `[Traveler Booking]`
- `[Checkout]`
- `[Payments]`
- `[Auth]`
- `[Database]`
- `[QA]`
- `[Ops]`
- `[Docs]`
- `[Decision]`

### Verb choices

Choose a verb that describes the work mode:

- `Fix` — known defect, expected behavior is clear.
- `Investigate` — cause is unknown; first deliverable is evidence/root cause.
- `Add` — new user-visible capability.
- `Implement` — build an already-decided spec.
- `Harden` — improve safety, auth, RLS, reliability, or failure handling.
- `Verify` — test, smoke, regression, or QA evidence.
- `Document` — docs/runbook/spec work.
- `Choose` / `Decide` — human decision required.

Avoid vague titles such as:

```text
Fix admin bug
導遊後台壞掉
Check payment issue
```

## Label taxonomy

Every triaged issue should have labels from these groups.

### 1. Owner: next-step ownership

Exactly one owner label should be present.

- `owner:human-decision`
- `owner:ai-agent`
- `owner:mixed`

Rules:

- Use `owner:human-decision` when a human must choose policy, UX, risk, business rules, sensitive data handling, or production operation scope.
- Use `owner:ai-agent` when the agent can act without asking for more product decisions.
- Use `owner:mixed` when the agent should investigate first but must stop before deciding/implementing policy.

### 2. Agent routing: execution order for AI agents

Use existing labels:

- `agent:now` — exactly one open issue should normally have this. It is the default issue an AI agent pulls first.
- `agent:next` — high-priority next item or safe parallel work.
- `agent:queued` — ordered queue; start after prerequisites or explicit routing.
- `agent:backlog` — useful but not current/default work.

Rules:

- `agent:*` is not business priority. It is execution routing.
- `priority:P0/P1/P2` says how urgent the business impact is.
- `agent:now/next/queued/backlog` says what the AI should do first.
- `owner:human-decision` should not have `agent:now`.
- `owner:ai-agent` is the normal owner for `agent:now`.
- `owner:mixed` may have `agent:next` or `agent:queued`, but the body must say where the agent must stop.

### 3. Priority: business urgency

Use normalized labels:

- `priority:P0` — critical: production unavailable, payment/data corruption, serious auth/security issue, or launch blocker with no workaround.
- `priority:P1` — major core flow broken or operational blocker with user/admin impact.
- `priority:P2` — important but has workaround or is not blocking the main flow.
- `priority:P3` — polish, cleanup, or low-urgency improvement. Create this label if needed.

### 4. Type: work kind

Use one primary type label. Add a second only when it materially helps routing.

- `type:bug`
- `type:feature`
- `type:investigation`
- `type:optimization`
- `type:security`
- `type:decision`
- `type:docs`
- `type:qa`

### 5. Status: readiness/current state

Use one current status label:

- `status:ready`
- `status:needs-repro`
- `status:needs-info`
- `status:needs-decision`
- `status:blocked`
- `status:in-progress`
- `status:needs-review`
- `status:verified`

### 6. Domain: feature area

Use at least one domain label when available:

- `admin-guides`, `guide-dashboard`, `payments`, `orders`, `auth`, `database`, `rls`, `qa`, etc.

## AI agent pickup order

Agents should read issues in this order:

1. `owner:ai-agent` + `agent:now` + `status:ready`
2. `owner:ai-agent` + `agent:now` + `status:needs-repro`
3. `owner:ai-agent` + `agent:next` + `status:ready`
4. `owner:ai-agent` + `agent:queued` + `status:ready`
5. `owner:mixed` + `agent:next` or `agent:queued`, investigation only
6. `agent:backlog` only when explicitly asked or no higher queue exists

Agents should skip or stop on:

- `owner:human-decision` unless the task is only to summarize options.
- `status:needs-info` unless the missing info is retrievable from code/logs/tools.
- `status:blocked` unless the blocker has been removed.
- Issues without acceptance criteria or verification instructions, unless the first task is explicitly triage.

## Required issue body sections

### AI-executable issue template

Use when `owner:ai-agent`.

```markdown
## Goal

What should be true when this issue is complete?

## Evidence / current behavior

- Affected URL/route:
- User-reported text/error:
- Logs/screenshots if available:

## Steps to reproduce

1. ...
2. ...
3. ...

## Expected behavior

...

## Actual behavior

...

## Scope

Agent may change:
- ...

## Out of scope

Agent must not change:
- ...

## Acceptance criteria

- [ ] ...
- [ ] ...

## Verification

- [ ] Unit/integration tests:
- [ ] E2E/Playwright/manual smoke:
- [ ] Production or production-equivalent evidence:

## Safety / privacy

- Do not include secrets, cookies, tokens, or full credentials.
- Do not weaken auth/RLS/security checks to make tests pass.
```

### Human decision issue template

Use when `owner:human-decision`.

```markdown
## Decision needed

What must a human choose?

## Context

Why this decision matters now.

## Options

### Option A: ...
Pros:
- ...
Cons:
- ...

### Option B: ...
Pros:
- ...
Cons:
- ...

## Recommendation

Recommended option and why.

## Impact

Affected product areas, users, operations, data, payment, security, or support flows.

## After decision

- [ ] Create/route implementation issue(s).
- [ ] Update affected docs/runbooks.
```

### Mixed investigation issue template

Use when `owner:mixed`.

```markdown
## Investigation goal

What evidence/root cause should the agent find?

## AI agent may

- Inspect code and docs.
- Reproduce the issue.
- Collect logs/evidence.
- Propose options.

## AI agent must not

- Choose business/product/security policy.
- Merge implementation that changes policy.
- Perform risky production operations without approval.

## Human decision needed after investigation

- ...

## Deliverables

- [ ] Root cause or ruled-out causes.
- [ ] Evidence links/log snippets with secrets redacted.
- [ ] Options with pros/cons.
- [ ] Recommended next issue(s).
```

## Examples

### Production admin guide detail bug

```text
Title:
[Admin Guides] Fix guide detail page showing 找不到導遊資料 after guide application

Labels:
owner:ai-agent
agent:next
type:bug
priority:P1
status:needs-repro
admin-guides
qa
```

Use `agent:now` instead of `agent:next` only if this is the single current default AI task.

### Human policy decision

```text
Title:
[Decision] Choose refund retry policy for failed ECPay callbacks

Labels:
owner:human-decision
type:decision
priority:P1
status:needs-decision
payments
```

No `agent:now` label.

### AI investigation before decision

```text
Title:
[Payments] Investigate ECPay callback race causing inconsistent order status

Labels:
owner:mixed
type:investigation
priority:P1
agent:next
status:ready
payments
```

The agent may investigate and propose options, but must stop before policy-changing implementation.

## Agent routing comment

When changing `agent:*` labels, add a short comment so agents know why. Use this shape:

```markdown
## Agent priority routing update

- Current bucket: `agent:now` / `agent:next` / `agent:queued` / `agent:backlog`
- Reason: ...
- Prerequisites: ...
- Suggested agent role: ...
- Queue note: ...
```

## Automated health-check issues

This section governs issues created by automated daily backend/frontend health checks and CI diagnostics. Because these checks run on a schedule, they can create duplicate issues for the same underlying problem. Follow this procedure every time an automated check is about to file a new issue.

### Fingerprint definition

An automated health-check issue has a unique fingerprint composed of three fields:

```text
<check-name> | <command> | <normalized-error-signature>
```

Examples:

```text
lint         | npm run lint      | eslint-not-found
typecheck    | npm run typecheck | tsc-not-found
build        | npm run build     | build-env-missing
e2e          | npm run test:e2e  | playwright-timeout
```

Two issues share the same fingerprint when all three fields match after normalization:

- `check-name`: lowercase, hyphenated (e.g. `lint`, `typecheck`, `daily-backend-check`)
- `command`: exact npm/bash command string
- `normalized-error-signature`: lowercase, remove version numbers and timestamps, replace spaces with hyphens (e.g. `eslint: not found` → `eslint-not-found`)

### Pre-create dedupe lookup procedure

Before filing a new automated health-check issue, always run:

```bash
gh issue list \
  --repo smallwei0301/tour-platform \
  --state open \
  --label "infra" \
  --label "qa" \
  --json number,title,createdAt,updatedAt,url \
  --limit 50
```

Also search closed issues to detect recurring patterns:

```bash
gh issue list \
  --repo smallwei0301/tour-platform \
  --state all \
  --search "eslint not found" \
  --json number,title,state,createdAt,url \
  --limit 20
```

If an open issue with the same fingerprint already exists:
1. Add a comment to the existing issue with the new run's evidence (branch, commit, log excerpt).
2. Do NOT create a new issue.
3. If the existing issue has no `triaged` label yet, add the required label set (see below).

If no open duplicate exists but closed duplicates do:
1. Create a new issue using the body template below.
2. Link to the most recent closed duplicate in the body under "Related history."

### Required label set

Every automated health-check issue must have all of the following labels:

| Label | Reason |
|---|---|
| `triaged` | Confirms the issue was classified, not just filed |
| `type:investigation` or `type:bug` | `type:bug` when the defect is confirmed; `type:investigation` when still needs repro |
| `priority:P2` | Default; escalate to `priority:P1` only for CI bootstrap blockers that prevent all CI runs |
| `qa` | Domain: quality/CI |
| `infra` | Domain: infrastructure/environment |
| `owner:ai-agent` | AI agent can investigate and attempt a fix |
| `status:needs-repro` | First task is always to reproduce in a clean environment |

Add these labels using:

```bash
gh issue edit <number> --add-label "triaged,type:investigation,priority:P2,qa,infra,owner:ai-agent,status:needs-repro"
```

### Sanitized body field list

Automated health-check issue bodies must include exactly these fields and nothing else that could contain secrets:

| Field | Required | Notes |
|---|---|---|
| `branch` | Yes | Branch name only, no full ref |
| `commit` | Yes | Short SHA (7 chars), no full hash needed |
| `node-version` | Yes | e.g. `22.x` |
| `npm-version` | Yes | e.g. `10.x` |
| `install-command` | Yes | e.g. `npm ci --include=dev` |
| `run-command` | Yes | e.g. `npm run lint` |
| `exit-code` | Yes | Integer |
| `log-preview` | Yes | Maximum 120 lines; truncate with `... (truncated)` |
| `rerun-command` | Yes | Exact command a human can paste to reproduce |
| `related-history` | Recommended | Links to previous duplicate issues |
| `no-secrets-declaration` | Yes | Must include the line: "No secrets, tokens, credentials, cookies, or private user data appear in this report." |

Fields that must NEVER appear in the body:

- API keys, tokens, secrets, passwords, or credentials of any kind
- Full file paths that expose internal directory structure (use relative paths only)
- User PII (email addresses, phone numbers, names)
- Database connection strings
- `.env` file contents or excerpts

### Dedupe survivor policy

When two or more open issues share the same fingerprint:

1. **Designate the survivor**: Choose the newest issue that has the most complete body (most fields filled, largest log excerpt). If equal, prefer the higher issue number.
2. **Comment on non-survivors**: Add a comment on each non-survivor linking to the survivor:
   ```markdown
   ## Duplicate notice
   This issue is a duplicate of #<survivor-number>, which has the most complete evidence for this fingerprint (`<fingerprint>`). Tracking continues there. This issue is not being closed — it remains open for reference.
   ```
3. **Comment on survivor**: Add a comment noting it is the designated survivor:
   ```markdown
   ## Survivor designation
   This issue is the designated canonical tracker for the `<fingerprint>` fingerprint. Duplicate issues #<list> have been comment-linked here. Evidence from future runs of the same check should be added as comments here rather than filing new issues.
   ```
4. **Never auto-close**: Do not close non-survivor duplicates automatically. Closing is a human decision. The policy is comment-link only.

### Template reference

Use `docs/operations/templates/auto-health-check-issue-template.md` when creating automated health-check issues.

---

## Triage checklist

Before creating or updating an issue, verify:

- [ ] Title uses `[Area] Verb target symptom/outcome`.
- [ ] Exactly one `owner:*` label is present.
- [ ] One normalized `priority:*` label is present.
- [ ] One primary `type:*` label is present.
- [ ] One current `status:*` label is present.
- [ ] Domain label exists when useful.
- [ ] `agent:*` label is present only if the issue is intended for AI execution routing.
- [ ] At most one open issue has `agent:now`, unless the operator explicitly allows multiple parallel default tasks.
- [ ] `owner:human-decision` does not have `agent:now`.
- [ ] Body has acceptance criteria and verification steps.
- [ ] Secrets, credentials, cookies, tokens, and private data are not included.
