# Kanban Phase B + Phase C Full-Chain Validation Fixture

This fixture documents the docs-only full-chain validation path for GitHub issue #292.

## Scope

- Scope: docs-only
- Target file: `docs/kanban-full-chain-validation.md`
- Goal: record the Kanban Phase B + Phase C full-chain path with a deterministic, non-runtime check.
- Constraint: no runtime/product behavior impact.

## Chain definition (Issue -> merge)

Exact chain: Issue → Kanban spec → implementation → review → draft PR → PR Verify → Ava final sanity → merge

1. **Issue**
   - Source issue: [#292](https://github.com/smallwei0301/tour-platform/issues/292)
2. **Kanban spec**
   - Planner converts issue intent into a scoped implementation task.
3. **implementation**
   - Builder updates the required doc artifact in the issue worktree only.
4. **review**
   - Independent reviewer validates scope, formatting, and required evidence.
5. **draft PR**
   - Draft PR is prepared from the scoped chain result when the implementation is ready.
6. **PR Verify**
   - Automated checks and review evidence are gathered before final sanity.
7. **Ava final sanity**
   - Final sanity confirms evidence completeness and gate status.
8. **merge**
   - Merge after reviewer and sanity gate pass.

## Validation notes

- This is a **docs-only** fixture.
- It carries **no runtime/product behavior impact** because only Markdown content is changed.
- Phase B and Phase C are used as validation labels for the full-chain governance trail.
