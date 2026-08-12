# issue1814 — 以冪等鍵與併發控制避免重複建單與扣點
> 最後更新：2026-08-12 21:25 Asia/Taipei｜負責 session：Codex

## 目標
讓同一個公開建單操作在重送、逾時或真正併發時，只會 materialize 一個訂單聚合與一次成功交付。

## AC 清單
- [ ] 同 Key 的順序重送與真正併發，最多建立一張 Order、一次加購快照與一次點數扣除。
- [ ] 完整 rollback 後可安全重試；處理中或狀態不明時不得再建單。
- [ ] 同 Key 不同 payload 穩定回傳衝突，且非成功結果不暴露付款／成功交付資訊。
- [ ] 以隔離 PostgreSQL／PostgREST 的 reusable concurrency 與 fault-injection integration 證明資料庫狀態。

## 已完成（附證據）
- 2026-08-12 已以 `origin/main@a41c475` 建立 `agent/issue-1814-checkout-idempotency`，工作樹乾淨。
- 2026-08-12 已讀取 live issue #1814 與既有 #1813 RPC：`fn_create_booking_draft_with_addons_and_points_atomic` 未接收 idempotency key，亦未在同一 transaction claim／complete `midao_idempotency_records`。
- 2026-08-12 RED：`node --test apps/web/tests/unit/issue1814-checkout-idempotency.test.mjs` 在既有實作失敗（replay 仍通知、gateway 未傳 idempotency identity）。
- 2026-08-12 GREEN：同一 #1814 unit 與 fallback/DB 共用投影契約通過；`npm run typecheck` 通過；#1811/#1813 gateway、migration ledger、route wiring、architecture ratchet、runner focused contracts 通過。
- 2026-08-12 已新增隔離 real-auth API concurrency/fault integration 與 CI runner allowlist；直接執行因本機缺 `DATABASE_URL`／隔離 GoTrue 停止，標記 `NOT_VERIFIED-local`，不當作功能結果。
- 2026-08-12 `.claude/hooks/run-checks.sh` 因固定 `/root/.hermes/toolchains/node/22.23.1` 不存在而在 preflight 停止；未執行測試本體。完整 suite 的本票相關契約已修正，剩餘 Node 24 crypto／availability 基線與 expected-terminal artifact fail-closed 交由 pinned CI 判定。
- 2026-08-12 獨立雙軸 review 找到並已修正：completed replay 提前於 mutable plan validation；前端 key 改為實際 canonical request（含 scheduleId、timezone、sourceChannel）並於排程切換換 key；runtime integration 補 active add-on／實際點數 delta／既有 processing claim；replay gateway 補與 DB 共用投影的 in-memory fallback 契約；補 `e2e/issue1814-checkout-idempotency.spec.ts` 且納入 baseline browser CI gate。Playwright 本機因 Node 24 `uv_interface_addresses` 系統錯誤而未能開 server，標記 `NOT_AUTOMATABLE-local`。
- 2026-08-12 修正後全量 ordinary suite：5,531 tests 中 5,523 通過、5 失敗；失敗皆為既有 Node 24 HMAC fixture（3）及 availability 基線（2），與 #1814 無關，交由 pinned CI 重驗。

## 下一步
- 提交 source-only 變更、進行雙軸 review，開 Draft PR 後以 pinned Node 22／PG17/PostgREST/GoTrue 驗證；只有 CI 全綠才合併與關 issue。

## 絕不重做（Do-NOT-redo）
- #1811–#1813 的既有 base/add-on/points 計價與原子交易：本票只加唯一性與重放控制，不改產品規則。
- 不以 API 層先寫 processing 再另呼叫 atomic RPC：兩個獨立 transaction 無法區分完整 rollback 與未知中斷，會違反 #1814 AC。
- 不套用正式 migration、資料庫變更、付款或通知。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
