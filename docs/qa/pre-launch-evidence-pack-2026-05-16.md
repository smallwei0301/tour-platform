# Pre-Launch Evidence Pack Index

> **HISTORICAL SNAPSHOT — FROZEN AT 2026-05-16**
> This document reflects the live state as of 2026-05-16/17 and should NOT be used as a current readiness reference.
> For current live state, see: [`docs/operations/reports/readiness-live-state-latest.md`](../operations/reports/readiness-live-state-latest.md)
> Refresh with: `npm run readiness:snapshot`

> 版本：2026-05-16（歷史快照，已凍結）
> 查詢時間：2026-05-17 UTC+8（快照時間點）
> 狀態：**HISTORICAL** — 本文件為歷史時間點存檔，非當前就緒狀態
> 決策人：Wei
> 引用：#504, #505, #586/#587 readiness resync（已結案）

---

## 1. Environment / Build

| 項目 | 值 |
|------|---|
| Deploy URL | https://tour-platform-nine.vercel.app |
| Main commit SHA | `5f6c1138111bed20164553c6e325270d3e354711`（2026-05-17 re-sync） |
| Runtime | Node 22（.nvmrc + engines field） |
| 測試時間區間 | 2026-05-12 – 2026-05-16 |
| 測試帳號角色 | traveler / guide / admin（帳號詳情存於受控位置） |

---

## 2. Issue Status Matrix

| Issue | 標題 | 狀態 | 完成 % | Evidence 位置 | Blocker | 下一步 Owner |
|-------|------|------|--------|--------------|---------|-------------|
| #588 | Reconcile pre-launch evidence pack after #586/#587 live-state resync | CLOSED / **HISTORICAL** | 100%（已結案） | 本文件為歷史結案快照 | 已結案（PR #589 merged） | — |
| #500 | [QA] Manual regression checklist for recent merged PRs (May 12-14) | OPEN / **HOLD** | ~50% | /root/.openclaw/workspace/tour-platform-qa-*.md | 旅客 session / regression 斷點待補 | Wei/QA |
| #320 | [Human-Decision][Pre-Launch Ops] Readiness gate + soft launch control + Admin Go/No-Go dashboard | OPEN / **HOLD** | 70% | #505 / #506（控制與儀表板） | 人為決策核可與 readiness sign-off 尚未完成（非系統阻塞） | Wei/PM |
| #319 | 客服 SOP 演練（取消/退款/出團異常/緊急事故 四情境） | OPEN / **HOLD** | 25% (1/4 documented) | docs/07-operations-plan/06-cs-cxl-*.md | 需完整 3 情境演練 | Wei/CS |
| #318 | 第一位導遊（Andy Lee）onboarding 實跑 + retrospective | OPEN / **HOLD** | 0% | 尚未執行 | 需 Andy Lee 協調 | Wei |
| #402 | Real ECPay payment/refund/email evidence | CLOSED / **HISTORICAL** | 100%（歷史關閉） | #586/#587 文檔對齊結果 | 已結案，作為歷史參考 | — |
| #403 | Google traveler browser session evidence | CLOSED / **HISTORICAL** | 100%（歷史關閉） | storageState 指標文檔 | 已結案，作為歷史參考 | — |
| #504 | Build unified pre-launch evidence pack and sign-off index | CLOSED / **HISTORICAL** | 100% | PR #587 後續文件對齊 | 歷史參考 | — |
| #505 | Make Go/No-Go verdict evidence-driven and default HOLD before readiness sign-off | COMPLETED | 100% | 版本記錄與控制面板規約 | 已完成作為基礎依據 | — |
| #506 | Implement emergency pause / booking kill-switch / whitelist controls | COMPLETED | 100% | PR #550 / #552 / #554 merged | 已完成 | — |
| #559 | Run soft-launch production alert drill and evidence capture | CLOSED / **HISTORICAL** | 100% | 事件回放與演練結果 | 歷史參考 | — |
| #572 | Re-sync evidence pack and readiness docs after PR #571 live-state drift | CLOSED / **HISTORICAL** | 100% | PR #572 實務對齊 | 歷史參考 | — |
| #573 | Fix recurring refund-reconcile scheduled workflow failures from missing ECPay env | CLOSED / **HISTORICAL** | 100% | Issue 記錄與運行修復內容 | 歷史參考 | — |
| #574 | Add incident legal/regulatory notification obligation matrix | CLOSED / **HISTORICAL** | 100% | Issue 記錄 | 歷史參考 | — |
| #586 | Reconcile post-#585 live-state drift across canonical readiness docs | CLOSED / **HISTORICAL** | 100% | PR #586 + #587 的對齊上下文 | 歷史參考 | — |

---

## 3. Live-state query summary

- 查詢時間（台北）：2026-05-17 20:37
- 查詢指令：
  - `gh issue list --repo smallwei0301/tour-platform --state open --json number,title,state,labels --limit 50`
  - `gh pr list --repo smallwei0301/tour-platform --state open --json number,title,state --limit 50`
  - `for n in 402 403 500 318 319 320 504 505 506 559 572 573 574 586 588; do gh issue view "$n" --repo smallwei0301/tour-platform --json number,title,state,url; done`
  - `gh pr view 587 --repo smallwei0301/tour-platform --json number,title,state,mergedAt,url`
- Open PR（open PR count）：**0**（當前清單為空）
- Open issues（目前即時）: **#588、#500、#320、#319、#318**
- 其他相關 issue（已關閉/歷史）：#402、#403、#504、#505、#506、#559、#572、#573、#574、#586
- PR #587：**MERGED**（作為 #586/#587 readiness resync 的基準）

---

## 4. Go/No-Go Verdict（2026-05-17）

**整體建議：HOLD**

原因：
- #500 manual regression checklist 未完成
- #318 guide onboarding 未執行
- #319 客服 SOP 演練未完成
- #320 readiness gate / soft launch control 的人為決策仍未完成

**已完成項目（可 soft-launch 的基礎）：**
- ✅ 技術閉環：booking、payment、refund、CSRF、audit trail
- ✅ Soft-launch 控制面板（Admin UI, kill-switch, whitelist）
- ✅ Go/No-Go dashboard（evidence-driven, default HOLD）
- ✅ Node 22 runtime pin
- ✅ 退款政策 v2 source-of-truth
- ✅ Incident response, quality control, settlement runbooks

---

## 5. Evidence Index

### Payment / Refund / Email Evidence
- **狀態：HOLD** — #402 已關閉，保留為歷史參考；實際真實金流/退款/email 測試仍需新 follow-up 補齊
- 預期位置：受控位置（不進 repo）
- 備注：ECPay sandbox credentials 存於 Vercel env；現況仍待 Wei / 人力決策補齊真實環境驗證

### Logged-in Traveler Browser Evidence
- **狀態：CLOSED / HISTORICAL** — #403 已結案，storageState 指標文件仍可作為歷史紀錄
- 指針文件：`/root/.openclaw/workspace/tour-platform-traveler-storageState-pointer.md`
- 備注：若需再次驗證 #403 類型流程，請另開新 issue 觸發實際 session 重建，不再以 #403 重開為方式續作

### Recent Merge Regression
- **狀態：部分完成**
- API smoke tests：1342/1342 pass（CI green）
- Manual UI regression：#500 pending
- 位置：`/root/.openclaw/workspace/tour-platform-qa-*.md`（受控位置）

### Guide Onboarding / CS SOP
- **狀態：未完成**
- #318 guide onboarding：0%（未執行）— 需 Andy Lee 協調
- #319 CS SOP：25%（1 個情境有 docs）— 需完成 3 個

---

## 6. 下一步行動

| 優先 | 行動 | Owner | 期限 |
|------|------|-------|------|
| P0 | 重建 traveler storageState + 執行可追溯的登入後 UI QA | Wei | 下一次 QA session |
| P1 | 完成 #500 manual regression checklist（整合 #588/#319/#318 狀態） | Wei/Rita | soft-launch 前 |
| P1 | 如需新增真實 ECPay payment/refund/email 證據，請建立新的 QA evidence follow-up，或依情境補到 #500/#320 | Wei | soft-launch 前 |
| P2 | #318 Andy Lee onboarding demo run | Wei + Andy | soft-launch 前 |
| P2 | #319 CS SOP 剩餘 3 情境演練 | Wei/CS | soft-launch 前 |
