<!-- PR Template: Docs sync check -->

## Summary

(簡短描述這次變更)

## Test design

> 完整規範：[測試策略與 Agent 施工規範](https://github.com/smallwei0301/tour-platform/blob/main/docs/04-tech/04-tech-architecture/17-testing-strategy-and-agent-standard.md#17-pr測試說明模板)

### AC / risk / layer

| AC | Risk | Owner layer | New or reused test | Consumer seam |
|---|---|---|---|---|
| | | | | |

- Deliberately not duplicated:
- Real PostgreSQL: yes / no — reason:
- Browser: yes / no — reason:
- Production smoke: yes / no — approval / reason:
- Review triggers (`test/product > 2`, mock >80 lines, 3+ repeated layers, source > behavior): none / explanation:

### Fresh evidence

- Branch / current head SHA:
- Last relevant edit:
- Command + exit code + result:
- Not verified:

## Checklist
- [ ] Tests added / updated (if applicable)
- [ ] Owner behavior matrix and consumer seam are not duplicated without justification
- [ ] Required real PostgreSQL / browser evidence is attached
- [ ] Focused evidence is newer than the last relevant edit
- [ ] Existing full-suite / CI / release gates were not skipped
- [ ] Lint passed
- [ ] Docs updated
- [ ] Docs synced with README and dev-timeline: [ ] yes

## Docs sync check
Please run /tmp/tour-platform/scripts/check-docs-sync.sh from repo root and confirm the output in PR description or CI.
