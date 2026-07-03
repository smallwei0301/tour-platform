# Booking V2 Rollback Runbook (Issue #104)

Version: v2
Owner: Rollout Owner (#96)
Scope: Booking route V2 cutover safety rollback
Last updated: 2026-07-03 (Issue #1406 — 退役階段二：flag fallback UI 與 legacy 入口移除；flag 回滾段落標 deprecated)

---

> ## ⚠️ DEPRECATED — flag-based rollback（自 #1406 退役階段二起，2026-07-03）
>
> **`NEXT_PUBLIC_BOOKING_V2_ENABLED=0` 已不再產生可用的 legacy 預約 UI。** 退役階段二（#1406，owner 拍板 2026-07-02 務實派解鎖）已移除：
> - `booking-entry.mjs` 的 legacy `/checkout` href（`resolveBookingEntryHref` / `resolvePlanBookingHref` 一律導向 V2 `/booking/[slug]`）；
> - `/booking/[activityId]` 的 `BookingInnerLegacy` fallback 分支（殼層一律渲染 Booking V2）；
> - `/experiences/[slug]` 的 legacy `/checkout` 預約 CTA（改導向 `/booking/[slug]`）。
>
> **`=0` 現在的實際行為**：預約入口與 `/booking` 殼層一律走 Booking V2；旗標值不再降級到 legacy 三步驟下單流程，也不會產生壞頁／白頁。旗標僅殘留於活動詳情頁的可用性「presentation variant」判斷（`isBookingV2Enabled()`），對 checkout 可達性無影響。
>
> **因此本 runbook 第 2）～7）節描述的「flag 翻轉即回到 legacy CTA/legacy booking 契約」不再成立。** 若需緊急退場 Booking V2，唯一有效手段是 **Method B（Vercel Promote 前一個 good deployment / git revert 到階段二之前）**，不是翻 env 旗標。
>
> 旗標本身於 **退役階段三**（#1386）才隨 legacy 碼刪除一併退場。本段與下方 flag-rollback 章節依 #1386 決策 **保留一個版本週期供稽核查考**，屆時連同 legacy routes 一併清除。
>
> **【終局，2026-07-03】階段三（#1407）已完成**：flags 與 legacy routes 皆已刪除。本 runbook 全文自此為**歷史稽核文件**——如需退場 Booking V2，唯一手段是 Method B（Vercel Promote 前一個 good deployment / git revert），env 旗標已不存在。

---

## 0) Production Operator Permission Matrix

| Role | Can change NEXT_PUBLIC_BOOKING_V2_ENABLED | Can trigger production redeploy |
|---|---|---|
| Release Owner (Primary) | YES — Vercel Project Settings > Environment Variables | YES |
| Engineering Lead (Backup) | YES — same path | YES |
| On-call Ops | No — escalate to Release Owner | No |

Escalation: If Release Owner unavailable → Engineering Lead → [urgent: repo owner]

> If the operator reaching this runbook does not have Vercel env/deploy access, stop and escalate immediately. Do not attempt workarounds.

---

## 1) Trigger Conditions (when to rollback)

Trigger rollback immediately if any of these occur:
1. callback success rate drops beyond configured threshold
2. oversell invariants breach (`insufficient_capacity` / `schedule_not_open` semantic anomalies)
3. sustained booking API 5xx spike
4. fallback click rate spikes above threshold

---

## 2) Rollback Precedence (deterministic)

1. **Global hard override** (highest priority)
   - set `NEXT_PUBLIC_BOOKING_V2_ENABLED=false`
2. **Stage rollback**
   - reduce rollout stage (100 -> 50 -> 25 -> canary)
3. **Local fallback**
   - user-triggered fallback CTA in V2 path

> Note: local fallback is UX safety; it is NOT a substitute for global rollback.

---

## 3) Operator Checklist (5-minute target)

### Step A — Execute rollback

Choose method based on urgency and confidence:

**Method A — Env var flip + redeploy (preferred):**
1. Vercel Dashboard > Project > Settings > Environment Variables
2. Find `NEXT_PUBLIC_BOOKING_V2_ENABLED`, set to `0` or remove, select Production scope
3. Trigger redeploy: Deployments > latest deploy > Redeploy (or `git push` to main)
4. Wait for deployment to complete (watch Vercel Deployments list)

**Method B — Instant rollback to prior deployment (use if Method A risks misconfiguration under pressure):**
1. Vercel Dashboard > Deployments > find last-known-good deployment
2. Click `•••` > Promote to Production
3. Verify deployment SHA changed in `/api/health` response

- [ ] Record rollback start timestamp (ISO8601 Asia/Taipei)
- [ ] Record current Vercel deployment ID before rollback (Vercel Dashboard > Deployments, first row)

### Step B — Verify rollback effect
- [ ] Run: `curl -s https://<prod-url>/api/health` — confirm response and deployment SHA changed
- [ ] Confirm legacy CTA visible on at least one activity page (V2 booking path should not appear)
- [ ] Booking page resolves to legacy behavior contract
- [ ] No persistent loading/error loop in booking flow
- [ ] Record rollback complete timestamp (ISO8601 Asia/Taipei)
- [ ] **Deadline rule**: verification must complete within 5 minutes after rollback apply
- [ ] If deadline missed, keep state at `ROLLBACK WATCH` and escalate immediately

### Step C — Post-rollback verification (must pass)
- [ ] Order creation still works
- [ ] Payment callback writeback path still works
- [ ] No callback/oversell invariant regression

### Step D — Incident record
- [ ] Fill incident template (see `docs/operations/templates/booking-v2-incident-template.md`)
- [ ] Attach metrics snapshot + validation evidence

---

## 4) Verification Checklist (required)

1. Booking UI path returns to legacy
   - Minimum executable check:
     - Open `/booking/[activityId]?plan=...` with production flag-off state
     - confirm V2 marker is absent and legacy CTA/path is present
2. Order creation path healthy
3. Callback writeback healthy
4. Invariant checks clean

If any check fails, escalate immediately and keep rollout state at HOLD/ROLLBACK WATCH.

## 4.1 Escalation owner
- Primary escalation: Rollout Owner (#96)
- Secondary escalation: On-call backend owner
- If operator lacks env/deploy permission, escalate to Release Owner immediately (no waiting)

---

## 5) Required Rollback Proof (all four must be captured)

A rollback event is not considered complete unless ALL of the following are captured:

1. **Vercel Deployment ID**: found at Vercel Dashboard > Deployments > copy deployment URL hash (both pre-rollback and post-rollback)
2. **Config-change record**: screenshot of Vercel Project Settings > Environment Variables showing `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` (must show variable name + value + production scope)
3. **Timestamps**: rollback-start ISO8601 Asia/Taipei + rollback-complete ISO8601 Asia/Taipei
4. **Verification result**: output of `curl -s https://<prod-url>/api/health` + confirmation legacy CTA visible on one activity page
5. **Incident link**: link to filled `docs/operations/templates/booking-v2-incident-template.md` (required if incident triggered rollback)

> Partial evidence (e.g. only a timestamp with no deployment proof) does not satisfy this requirement.

---

## 6) Production-Specific Steps

### Pre-rollback (capture before touching anything)
1. Capture current deployment ID from Vercel Dashboard > Deployments (first row = current production deployment)
2. Note current `NEXT_PUBLIC_BOOKING_V2_ENABLED` value in Project Settings > Environment Variables

### Rollback method A (env var flip + redeploy)
1. Vercel Dashboard > Project > Settings > Environment Variables
2. Find `NEXT_PUBLIC_BOOKING_V2_ENABLED`, set to `0` or remove, select Production scope only
3. Trigger redeploy: Deployments > latest deploy > Redeploy (or `git push` to main)
4. Verify: `curl -s https://<prod-url>/api/health`; confirm V2 path disabled

### Rollback method B (instant rollback to prior deployment)
1. Vercel Dashboard > Deployments > find last-known-good deployment
2. Click `•••` > Promote to Production
3. Verify deployment SHA changed in `/api/health` response

> Choose Method B if env var approach risks misconfiguration under pressure.

---

## 7) 5-Minute Drill Mode (no production mutation)

Tabletop rehearsal: narrate each step aloud without executing. Confirm:

- [ ] You can navigate to Vercel Project Settings in < 60 seconds
- [ ] You know where `NEXT_PUBLIC_BOOKING_V2_ENABLED` lives
- [ ] You can identify the prior stable deployment in the Deployments list
- [ ] You can describe verification steps without looking at this runbook

**Target**: complete narration in < 5 minutes. If > 5 minutes, add the blocker to the operator-handoff issues.

---

## 8) Legacy booking 退役時間表（#1386，owner 拍板 2026-06-11）

| 階段 | 內容 | 生效條件 | 狀態 |
|---|---|---|---|
| 一、凍結 | legacy booking 路徑只修 P0 bug，新功能一律 V2（CLAUDE.md 已明文） | **owner 拍板即日生效（2026-06-11）** | ✅ 生效中 |
| 二、移除入口 | 移除 `NEXT_PUBLIC_BOOKING_V2_ENABLED=0` 的 fallback UI 與 legacy 入口；本 runbook 的 flag 回滾段落保留一個版本週期後標 deprecated | V2 連續 14 天：零未解 P0、callback 成功率不低於既有水位、未動用回滾 | ✅ **已完成（#1406，2026-07-03）** — booking-entry legacy href / `/booking` legacy 殼層 / `/experiences` legacy CTA 皆移除；本 runbook flag 回滾段落已標 deprecated（見文件頂部）；flag 本身留待階段三退場。殘留：standalone `/checkout` 頁（僅直接 URL 可達，無 UI 連結）待階段三隨 legacy routes 一併刪除 |
| 三、刪碼 | 刪 legacy routes 與對應測試；feature flag 退場 | ~~入口移除滿 4 週＋零流量證據~~ → **owner 2026-07-03 拍板「直接退役」豁免觀察期** | ✅ **已完成（#1407，2026-07-03）** — 刪除 `/api/orders`、`/checkout`、`/orders` 頁與 `/api/v2/feature-flags` 診斷端點；`isBookingV2Enabled`／`isBookingV2ShellEnabled` 與 `NEXT_PUBLIC_BOOKING_V2_ENABLED`／`BOOKING_V2`／`BOOKING_V2_PRIMARY` 全數退場；舊路徑 301 導向（next.config redirects）。**唯一保留**：availability route 內部資料 snapshot fallback（#839/#1133 安全網，待 V2 slots 全量回填另案移除）。殘留守門：`tests/api/issue1407-legacy-retirement-residue-guard.test.mjs` |

> 凍結期間的例外：P0（資料正確性／金流／安全）修復可動 legacy，PR 需註明 P0 理由。
