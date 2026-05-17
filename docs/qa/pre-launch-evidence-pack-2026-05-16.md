# Pre-Launch Evidence Pack Index
> 版本：2026-05-16
> 查詢時間：2026-05-16 UTC+8
> 狀態：**HOLD** — 多項 manual QA 尚未完成
> 決策人：Wei
> 引用：#504, #505 Go/No-Go

---

## 1. Environment / Build

| 項目 | 值 |
|------|---|
| Deploy URL | https://tour-platform-nine.vercel.app |
| Main commit SHA | `5f6c1138111bed20164553c6e325270d3e354711`（2026-05-17 re-sync）|
| Runtime | Node 22（.nvmrc + engines field）|
| 測試時間區間 | 2026-05-12 – 2026-05-16 |
| 測試帳號角色 | traveler / guide / admin（帳號詳情存於受控位置）|

---

## 2. Issue Status Matrix

| Issue | 標題 | 狀態 | 完成 % | Evidence 位置 | Blocker | 下一步 Owner |
|-------|------|------|--------|--------------|---------|-------------|
| #402 | Real ECPay payment/refund/email evidence | CLOSED / **HOLD** | 0% real run | 無（manual QA 未執行）| 需真實金流環境 | Wei |
| #500 | May 12-14 manual regression checklist | OPEN / **HOLD** | ~50% | /root/.openclaw/workspace/tour-platform-qa-*.md | 旅客 session 失效 | Wei/QA |
| #403 | Google traveler browser session evidence | CLOSED / **HOLD** | 0% | /root/.openclaw/workspace/tour-platform-traveler-storageState-pointer.md | storageState 失效（已結案，需重建後執行 UI flows 驗證）| Wei |
| #318 | Guide onboarding demo run + retrospective | OPEN | 0% | 尚未執行 | 需 Andy Lee 協調 | Wei |
| #319 | 客服 SOP 四情境演練 | OPEN | 25% (1/4 documented) | docs/07-operations-plan/06-cs-cxl-*.md | 需完整 4 情境 drill | Wei/CS |
| #320 | Readiness gate + soft launch control | **COMPLETED** | 100% | #505 Go/No-Go, #506 controls merged | - | - |
| #505 | Go/No-Go evidence-driven | **COMPLETED** | 100% | PR #557 merged | - | - |
| #506 | Soft-launch kill-switch controls | **COMPLETED** | 100% | PR #550, #552, #554 merged | - | - |

---

## 3. Go/No-Go Verdict（2026-05-16）

**整體建議：HOLD**

原因：
- #402 真實金流 evidence 未執行 → Admin Go/No-Go 顯示 `evidence_required` HOLD
- #403 CLOSED，但 storageState 已失效 → 登入 UI flows 無法驗證，需重建 storageState
- #500 regression checklist 僅部分完成
- #318 / #319 均未執行

**已完成項目（可 soft-launch 的基礎）：**
- ✅ 技術閉環：booking、payment、refund、CSRF、audit trail
- ✅ Soft-launch 控制面板（Admin UI, kill-switch, whitelist）
- ✅ Go/No-Go dashboard（evidence-driven, default HOLD）
- ✅ Node 22 runtime pin
- ✅ 退款政策 v2 source-of-truth
- ✅ Incident response, quality control, settlement runbooks

---

## 4. Evidence Index

### Payment / Refund / Email Evidence
- **狀態：HOLD** — #402 未執行
- 預期位置：受控位置（不進 repo）
- 備注：ECPay sandbox credentials 存於 Vercel env；real payment test 需要 Wei 執行

### Logged-in Traveler Browser Evidence
- **狀態：CLOSED / HOLD** — #403 已結案，storageState 已失效，UI flows 驗證仍需重建
- 指針文件：`/root/.openclaw/workspace/tour-platform-traveler-storageState-pointer.md`
- 備注：需 Wei 重新產生 storageState（`npx playwright codegen --save-storage=state.json ...`）才能完成後續驗證

### Recent Merge Regression
- **狀態：部分完成**
- API smoke tests：1342/1342 pass（CI green）
- Manual UI regression：#500 pending
- 位置：`/root/.openclaw/workspace/tour-platform-qa-*.md`（受控位置）

### Guide Onboarding / CS SOP
- **狀態：未執行**
- #318 guide onboarding：0% — 需 Andy Lee 協調
- #319 CS SOP：25% — 1 個情境有 docs，需完成 3 個

---

## 5. 下一步行動

| 優先 | 行動 | Owner | 期限 |
|------|------|-------|------|
| P0 | 重建 traveler storageState + 執行 #403 browser QA | Wei | 下一次 QA session |
| P1 | 執行 real ECPay payment/refund smoke + email verify（#402 re-open） | Wei | soft-launch 前 |
| P1 | 完成 #500 manual regression（整合 #403 session） | Wei/Rita | #403 完成後 |
| P2 | #318 Andy Lee onboarding demo run | Wei + Andy | soft-launch 前 |
| P2 | #319 CS SOP 剩餘 3 情境演練 | Wei/CS | soft-launch 前 |
| P3 | 設定 EVIDENCE_XXX_SIGNED env vars（#505 Go/No-Go 解鎖）| Wei | 各項完成後即時 |
