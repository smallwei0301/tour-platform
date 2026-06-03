# Alert Channel Decision — LINE Notify vs Telegram

**Decision date:** 2026-06-04
**Decision:** Telegram is the canonical operator alert channel
**Author:** tour-loop (issue #1201, leaf of #714)
**Status:** DECIDED — implementation deferred to follow-up issue

---

## Background

The alerting bus (`apps/web/src/lib/incidents.ts`) currently calls `notifySystemError()` from `apps/web/src/lib/line-notify.ts`, which posts to `https://notify-api.line.me/api/notify` (LINE Notify). Issue #685 and the monitoring drill blocker register (Section C2 in `docs/operations/drills/2026-05-24-monitoring-alert-drill-production-skeleton.md`) flag this as a pending channel decision.

## Key Facts

### LINE Notify is already dead in production

LINE Notify's public API (`notify-api.line.me`) was **officially shut down on 2025-03-31** (sunset announced by LINE Corporation in early 2024). Any production environment with `LINE_NOTIFY_ACCESS_TOKEN` set will receive HTTP errors from this endpoint today. The graceful-skip in `sendLineNotify()` (when the token is absent) means the alerting bus silently drops notifications rather than errors out — which is correct behavior, but means **no alert notifications are delivered in production at the moment**.

### Telegram is already the ops harness channel

The session harness (Claude ops), `docs/operations/third-party-monitoring-options.md`, and `.hermes-openclaw-agents/` already use Telegram for operator notifications. Telegram bots are free, stable, and the Telegram Bot API has no announced sunset. A bot token and chat ID are already in use in the claw harness infrastructure.

---

## Decision

**Canonical alert channel: Telegram**

Rationale:
1. LINE Notify is non-functional (shut down 2025-03-31) — not a migration, a replacement.
2. Telegram is already established as the ops notification channel.
3. Telegram Bot API is stable with no sunset risk.
4. Fire-and-forget model maps cleanly (`sendMessage` POST, no SDK needed).

---

## Code-Change Surface (alerting path — not order notifications)

The alerting path (`incidents.ts` → `notifySystemError` → LINE) requires two file changes:

### Change 1: `apps/web/src/lib/incidents.ts`
Replace the LINE import with a Telegram helper:
```typescript
// Before:
import { notifySystemError } from './line-notify';

// After:
import { notifySystemError } from './telegram-notify';  // new file
```

`recordIncident` calls `notifySystemError(source, message, metadata)` — the signature is unchanged.

### Change 2: Create `apps/web/src/lib/telegram-notify.ts`
Minimal implementation (fire-and-forget, matches existing `notifySystemError` signature):
```typescript
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_ALERT_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ALERT_CHAT_ID;

export async function notifySystemError(
  context: string, error: string, details?: Record<string, unknown>
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const detailStr = details ? `\n📦 ${JSON.stringify(details).slice(0, 300)}` : '';
  const message = `⚠️ 系統錯誤\n📍 ${context}\n❌ ${error.slice(0, 200)}${detailStr}`;
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    { method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }) }
  ).catch(() => {}); // fire-and-forget
}
```

New env vars required on Vercel production:
- `TELEGRAM_ALERT_BOT_TOKEN` — bot token (obtain from @BotFather)
- `TELEGRAM_ALERT_CHAT_ID` — operator chat/group ID

### NOT in scope for this leaf: order-notification migration

`line-notify.ts` also exports `notifyNewOrder`, `notifyPaymentReceived`, `notifyOrderCancelled`, `notifyRefundRequest`, `notifyRefundExecuted` — used by 4+ order/payment routes. These are **separate from the alerting path** and require their own migration planning (different message format, potentially different recipient). They are out of scope for the alerting-bus fix and should be addressed in a dedicated follow-up issue.

---

## Implementation Follow-up

This document is a **decision record only**. The actual code migration belongs in a follow-up issue:
- Title: `[Ops] Migrate alerting bus from LINE Notify to Telegram (incidents.ts + new telegram-notify.ts)`
- Scope: create `telegram-notify.ts`, update `incidents.ts` import, add `TELEGRAM_ALERT_BOT_TOKEN` + `TELEGRAM_ALERT_CHAT_ID` to Vercel env, update Phase 13 contract test (AC2 name references LINE)
- Prerequisite: this document

For the #714 alert drill: the drill can proceed with the LINE Notify step marked **SKIPPED** (no token → graceful skip per AC5). Step B5 should record "LINE Notify: SKIPPED (service shut down 2025-03-31); Telegram migration pending #followup". The drill evidence is still valid without notification delivery, since the incidents DB write (Step B3) is the primary evidence gate.

---

## Related
- `apps/web/src/lib/incidents.ts` (alerting bus)
- `apps/web/src/lib/line-notify.ts` (current — LINE Notify, dead in prod)
- `docs/operations/drills/2026-05-24-monitoring-alert-drill-production-skeleton.md` (Section C2, Section E)
- Issue #685 (LINE Notify sunset; follow-up migration)
- Issue #714 (production alert drill)
- Issue #1201 (this leaf)
