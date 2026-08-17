# Issue 1841 worklog

## Scope

Run the single remaining #1825 pre-apply gate, the exact PostgreSQL replay for
`apps/web/tests/integration/midao-legacy-draft-materialization-postgres.test.mjs`,
on a sufficiently resourced isolated CI runner.

This task does not authorize Production migration apply, DDL/DML, ledger updates,
deployment, acceptance edits, or issue closure.

## Immutable inputs

- Tested commit: `fbc0f65628d3df4e1caf5c2bca15c1744081d320`
- Migration: `supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql`
- Migration SHA-256: `4ea5094f497e953076d41b3e8f878b331398f66f6694f5e2145dc1a845612ff9`
- Supabase CLI: `2.87.2`
- PostgreSQL server image: `public.ecr.aws/supabase/postgres:17.6.1.104`
- PostgreSQL server image digest:
  `sha256:5deba92e50cd17bfacf8603834d317cdf3bfc1c016ec8293991997fa3b55fa3d`

## Execution

PR #1842 adds a validation-only workflow and always checks out the immutable
commit above before reading or executing repository code.

The first execution proved the exact test 4/4 PASS but correctly left the job red
because the external cleanup assertion treated the runner's intentionally
retained, released kernel-lock metadata as residue. The assertion was corrected
to require `released=true`; containers, networks, and volumes remain required
to be absent.

A two-axis review then found PostgreSQL server version was represented by image
identity but not emitted explicitly. The workflow now executes the pinned image's
`postgres --version` and records `postgres (PostgreSQL) 17.6`.

## Final verification

- Workflow source commit: `f90000f20ebf1d49a5533066a033e4e74c0566cb`
- Run: https://github.com/smallwei0301/tour-platform/actions/runs/31998401725
- Job: https://github.com/smallwei0301/tour-platform/actions/runs/31998401725/job/95294116786
- Artifact: https://github.com/smallwei0301/tour-platform/actions/runs/31998401725/artifacts/9277602514
- Artifact digest:
  `sha256:73459fa40df55ce4bfe2dd152324b642a374f5bd612fb60000b14c62d1f76e0b`
- Exact test: `tests 4`, `pass 4`, `fail 0`, exit `0`
- PostgreSQL server: `postgres (PostgreSQL) 17.6`
- Supabase CLI: `2.87.2`
- Project containers after run: none
- Project networks after run: none
- Project volumes after run: none
- Kernel runner lock: released
- Cleanup exit: `0`

The completion receipt was posted to Issue #1825:
https://github.com/smallwei0301/tour-platform/issues/1825#issuecomment-5312236805

## Final state

#1841 exact replay evidence is complete. PR #1842 remains a draft evidence PR
and must not be merged without separate owner direction. Issue #1825 remains
open. No Production mutation was performed.
