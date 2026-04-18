# Booking V2 Incident / Rollback Template

- Incident ID:
- Date/Time (TZ):
- Reporter:
- Environment:
- Current rollout stage:

## 1) Trigger
- Trigger type: (callback drop / oversell anomaly / api 5xx / fallback spike / other)
- Trigger metric(s):
- Threshold(s):
- Trigger timestamp:

## 2) Decision
- Decision: GO / HOLD / ROLLBACK WATCH / ROLLBACK
- Decision owner:
- Decision timestamp:

## 3) Rollback Action
- Global flag override applied? (Y/N)
- Stage rollback applied? (Y/N)
- Local fallback used? (Y/N)
- Rollback start:
- Rollback complete:

## 4) Verification (must fill)
- [ ] Booking UI path returned to legacy
- [ ] Order creation works
- [ ] Callback writeback works
- [ ] No callback/oversell invariant regression

Verification notes:

## 5) Evidence Links
- Dashboard snapshot:
- Logs:
- Test evidence:
- PR/commit reference:

## 6) Preliminary RCA
- What happened:
- Suspected cause:
- Immediate mitigation:
- Follow-up actions:
