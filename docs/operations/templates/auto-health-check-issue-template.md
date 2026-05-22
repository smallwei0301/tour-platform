# Auto Health-Check Issue Template

Use this template when an automated daily health check or CI diagnostic script creates a new issue. Fill every required field. Do not include secrets, tokens, credentials, or user PII.

Before filing, run the dedupe lookup procedure in `docs/ISSUE_ROUTING_AND_CLASSIFICATION_SOP.md` — "Automated health-check issues" section.

---

**Issue title format:**

```text
[QA] <Verb> <check-name> environment <symptom>
```

Example:

```text
[QA] Fix lint environment missing eslint
[QA] Investigate typecheck environment tsc-not-found
```

---

## Issue body

```markdown
Automated health check detected a failure in a reproducible environment.

**Fingerprint:** `<check-name> | <command> | <normalized-error-signature>`

## Environment

- Branch: <branch-name>
- Commit: <7-char-sha>
- Node version: <x.x.x>
- npm version: <x.x.x>

## Check details

- Check name: <check-name>
- Install command: <install-command>
- Run command: <run-command>
- Exit code: <exit-code>

## Log preview (max 120 lines)

\```
<paste log output here — maximum 120 lines; truncate remainder with "... (truncated)">
\```

## Rerun command

Paste this command to reproduce locally:

\```bash
<exact rerun command>
\```

## Related history

<!-- List any previous issues with the same fingerprint -->
- Previous duplicate(s): #<number> (closed/open)

## No-secrets declaration

No secrets, tokens, credentials, cookies, or private user data appear in this report.
```

---

## Required labels

Apply all of these labels when filing or triaging this issue:

```bash
gh issue edit <number> --add-label "triaged,type:investigation,priority:P2,qa,infra,owner:ai-agent,status:needs-repro"
```

Escalate `priority:P2` to `priority:P1` only when the failure blocks all CI runs (CI bootstrap blocker).

Use `type:bug` instead of `type:investigation` only when the root cause is confirmed.

## Dedupe policy reminder

- If an open issue with the same fingerprint already exists: add evidence as a comment; do not file a new issue.
- If filing a new issue after previous closed duplicates: link them under "Related history."
- Survivor designation and comment-linking procedure: see SOP section "Dedupe survivor policy."
- Never auto-close duplicates. Comment-link only.
