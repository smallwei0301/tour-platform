# issue1607 — 導遊開店第 2–3 週：商店 FAQ／政策區塊擴充＋匯款付款 beta

> 最後更新：2026-07-29 Asia/Taipei｜負責 session：Codex

## 目標

完成商店 FAQ、匯款人工對帳文案、訂單等待對帳提示與 beta 營運 SOP；匯款 feature flag 預設維持關閉。Issue 原本宣稱既有匯款後端已完整，但實際審查發現 Admin POS 核帳會在既有 `transfer` payment 上再插入第二筆 payment，與 `payments.order_id` 唯一限制衝突；因此本次一併修正既有核帳入口，否則 beta 無法安全交付。

## AC 對照

- [x] 商店首頁 FAQ 區塊存在，並由 `tests/ui/shop-landing-contract.test.mjs` 鎖住（契約測試通過）。
- [x] book 付款步驟包含「匯款後由祕島人工對帳，1–2 個工作天內確認並通知你」文案（契約測試通過）。
- [x] `/shop/orders` 匯款回跳顯示「等待對帳確認」提示（契約測試通過）。
- [x] `docs/operations/transfer-payment-beta-sop.md` 完成，未含密鑰／PII。
- [x] 既有匯款 API 契約與 Admin POS 回歸契約維持綠燈。
- [ ] 最新 SHA 的真實瀏覽器驗證：`NOT_VERIFIED-live`。本工作區沒有可用 Chromium，下載也受網路白名單阻擋；不可用舊 SHA 證據代替最新 SHA。
- [ ] 上線操作：Vercel 開 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED=1`。保留給 owner，未在本次提交或環境中執行。

## 實作摘要

- 商店首頁新增四項 `<details>` FAQ：如何預約、付款方式、取消與退款、如何聯絡導遊；退款項目連到 `/legal/refund`。
- Playwright 驗收補進既有 `issue1475-guide-shop-booking-flow` 與 `guide-shop-public-landing`：匯款文案、訂單等待提示與四項 FAQ 都有瀏覽器斷言。
- book 頁的 transfer UI 與銀行資訊維持集中 feature flag gate；flag 預設 OFF，頁面不直接讀 `process.env`。
- orders 頁以 `?paid=transfer` 顯示人工對帳等待狀態。
- 新增人工核帳 SOP，包含管理端驗證／CSRF、對帳頻率、金額核對、重複回報、逾時處理與停止 beta 流程。
- Admin POS manual-payment route 使用 service-role client 讀寫受保護 payment tables；若已有 `provider='transfer'` payment，更新該 row 並寫入 `provider_reconciled_paid` event，不再插入第二筆 payment。重播可辨識並回傳既有 payment。

## 實跑證據

- Node targeted contracts：`21/21 pass`，涵蓋 #1475 transfer contracts、manual-payment regression、service-role payment access、FAQ、book copy、orders pending copy。
- Node 22：`npm run typecheck -w @tour/web` 通過；`npm run lint -w @tour/web` 0 errors，僅保留既有 `RootDocument.tsx` `no-head-element` warning。
- Node 22 production build、flag ON：compile／typecheck／205 pages generation 通過，完整 build 成功；僅既有 RootDocument 與 next-intl warnings。
- Node 22 production build、flag OFF：compile／typecheck／205 pages generation 通過；Next 最後清理 `.next/export` 時重現環境層 `ENOTEMPTY`，因此不能記為完整 build 通過。產出 bundle 已確認 transfer flag 常數為 `0`。
- `git diff --check`：通過。
- 完整 web test（Node 24 本機相容執行）：`4708 passed / 2 failed / 3 skipped`；兩個失敗是未修改的 availability-preview 既有測試（#1289 parity、#1475 range），單獨重跑仍失敗，且相關 source/test 檔均未在本 diff。不能記為全套綠燈。

## 已知部署關卡

- 不套用任何 production migration。
- 不開啟 `NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED`。
- 未完成最新 SHA 的 live Chromium／Preview Playwright；PR 應保持 HOLD 或 draft，直到 owner／CI 提供此證據。

## Do-Not-Redo

- 不重建上一回合遺失的未推送 `fd812ae` commit；本分支依現行 `main` 與 Issue 原始 AC 重新實作。
- 不把舊 SHA 的瀏覽器結果寫成最新 SHA 完成證據。
- 不以提高測試門檻或偽造 migration ledger 掩蓋部署關卡。

## P0-OVERRIDE 使用紀錄（如有）

- 無。
