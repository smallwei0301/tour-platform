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
- Action proof attached? (deploy id / config screenshot / command transcript):

## 4) Verification (must fill)
- [ ] Booking UI path returned to legacy
- [ ] Order creation works
- [ ] Callback writeback works
- [ ] No callback/oversell invariant regression
- Verification SLA target met? (<= 5 minutes after rollback apply):

Verification notes:

## 5) Evidence Links
- Dashboard snapshot:
- Logs:
- Test evidence:
- PR/commit reference:

## 6) Escalation
- Primary owner (rollout owner):
- Secondary owner (on-call backend):
- Escalation timestamp:

## 7) Preliminary RCA
- What happened:
- Suspected cause:
- Immediate mitigation:
- Follow-up actions:
