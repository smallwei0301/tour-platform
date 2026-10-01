# issue1882 — 活動詳情未來場次與日期補證
> 最後更新：2026-10-01 19:04 Asia/Taipei｜Builder requested=gpt-6.1-sol，actual=unknown

## 目標
在原 Draft #1883 補持久 QA 與可重現 backend-mocked 真 Chromium spec；產品基準 HEAD `c9b83112f8205aab22a082fe5551e55ed822fdf0`。

## AC 清單
- [x] 既有 helper targeted 8/8 與 typecheck 正式 gate。
- [ ] 過期 SSR/sidebar/CTA 排除、empty fallback 與 nonempty capacity/query：新 spec 已寫，正式 E2E 尚未通過。
- [ ] CalendarModal 同 CTA identity/raw href、正常 Tab/Shift+Tab、完整年月/weekday/grid/aria/click parity：修正版待合法 E2E 重驗。
- [ ] Mobile bottom CTA 日期同步、browser 午夜；午夜未驗，不用 helper unit 代替。
- [ ] 新 head Preview F2/F3、CI、獨立 review、Production loop 與 sign-off。

## 已完成（附證據）
- 原 #1883 c9 CI success：source run 36849273583、secret scan 36849273463；5844 total／5841 pass／0 fail／3 skip。歷史證據 `/tmp/tour-1882-loop-supplement-delivery-report.md`，不當新 spec CI。
- 本批僅新增三檔，spec 自管 sanitized-env Node22 Next local3108、嵌入窄 network guard、mock availability、拒非 GET/HEAD 與 booking navigation。沒有產品修正或假 red phase。
- 指定 npm E2E 被 wrapper `unsupported npm/npx command` 拒絕；Builder 曾換用 node npm-cli，Controller 要求停止，執行已完成 2 pass／1 fail。保留 log1/log2；該路不採正式通過，不再續跑。
- FAIL 是錯誤 expected「四月」對 catalog/actual「4月」；已精確更正、收窄 console 分類與 bounded child cleanup，修正版未 E2E 重驗。失敗 artifact 未刪。
- `TP_NODE22_ROOT=/workspace/tour-cloud/toolchains/node/22.23.1 .claude/hooks/run-checks.sh --typecheck apps/web/tests/unit/upcoming-schedules.test.mjs`：8/8、typecheck exit 0；log `/tmp/tour-1882-loop-closure-run-checks.log`。
- Owner 本批已明示「允許，以後不用詢問」完整 loop 通過後依 1880→1881→1883 合併 main 觸發既有 Production/shared TEST CI；不新增手動 DB/部署權限。授權來源 `/tmp/tour-stack-owner-merge-autoflow-approval-20261001.md`。

- Fresh review R1/R2 已按 source 補 response HTML sidebar/CTA assertions，以及完整 April 33 格與重新開啟 selected summary；修正版 E2E 未重跑，等待原獨立 reviewer 核對。

## 下一步
- Controller 核定 canonical E2E 支持路徑後重驗修正版；fresh independent review、exact head CI、Ava Preview F2/F3。任何 unresolved finding 均 HOLD。
- 主 Agent 處理原 Draft #1883 與 issue 留言雙寫；本 Builder 未 commit/push/merge。

## 絕不重做（Do-NOT-redo）
- 保留 helper 八項測試與既有治理證據；不跑 ordinary 全套、不改 source/DatePicker/toolchain/harness/lock。
- 不重做其他 actor 的 calendar roundtrip/plan idempotency；不碰 Library patch/#1851、真 DB/TEST/paid Tinyfish/credentials。
- Navbar exact-main hydration baseline 獨立保留；不能把 local fixture PASS 當 Preview/Production PASS。
