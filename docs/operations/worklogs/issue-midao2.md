# worklog — midao2 導遊後台（接案 CRM）

> 尚未開 GitHub issue；開立後請將本檔改名為 `issueNNNN.md` 並在 issue 留言同步錨點。

## 目前狀態（2026-07-22，Asia/Taipei）

**Plan 1（後端 M1–M3）實作完成**，11/11 任務全數通過逐任務審查（subagent-driven development：每任務獨立實作 → 規格＋品質審查 → 修正 → 再審）。分支 `claude/superpowers-midao-backend-x90czx`，已推送。

- 設計文件（已核可）：`docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md`
- 實作計畫：`docs/superpowers/plans/2026-07-22-midao2-backend.md`
- SDD 進度 ledger：`.superpowers/sdd/progress.md`（各任務 commit 範圍、審查結論、Minor 累積清單）

## 完成內容

| 層 | 交付 |
|---|---|
| Migration（**未套用生產**） | `20260722100000_midao2_requests_availability.sql`（midao_requests＋可用時間 2 表＋RLS）、`20260722100500_midao2_activity_showcase_columns.sql`（activities 5 欄＋guide_profiles.experience_years） |
| 領域檔（strangler，未碰 db.mjs） | `db-midao-requests.mjs`（狀態機/request_no/列表/摘要）、`db-midao-availability.mjs`（週預設/單日覆寫/月生效）、`db-midao-showcase.mjs`（雙軌可見度/精靈建立/公開頁查詢）、`midao-request-notify.mjs`（LINE 推播 fire-and-forget） |
| 導遊端 API ×10 | `app/api/v2/guide/midao/`：summary、requests（list/manual create/detail/status PATCH）、services（list/create/PATCH）、calendar、availability（defaults GET/PUT、days/[date] PUT） |
| 公開端 API ×3 | `app/api/v2/public/midao/guides/[slug]/`：接案頁、可選日期、送單（rate-limit 5/分/IP＋honeypot＋LINE 推播通知導遊） |
| 測試 | 9 個測試檔 34 tests 全綠＋守門測試（db-mjs-size-guard、issue1407 residue）9/9 綠＋整包 `tsc --noEmit` 乾淨；證據在 `.claude/state/last-checks.json` |

## 實作過程中的重要決議（Plan 2 前端必讀）

1. **weekday 慣例**＝JS `getUTCDay()`（0=Sun…6=Sat），與 `slot-generator.ts` 一致（計畫原文的 0=Mon 公式有誤，已按測試意圖修正）。
2. **`updateMidaoServiceDb` 契約**＝`{ok:true, service}` | `{ok:false, code, message}`（統一二態，非計畫原文的三態）。
3. **行事曆點色**：綠點僅由 `closed_won` 需求或 `status='confirmed'` 站內訂單驅動（`pending_confirmation` 只入 items 不驅動點色）；bookings 以 **Asia/Taipei（+08:00）** 切日與顯示時刻（`taipeiDateOf`/`taipeiTimeOf`）。
4. **`midao_day_overrides` 寫入**：因 partial unique index 無法被 supabase-js `onConflict` 對應，非 custom 時段採先刪後插（非原子，冷啟動量級可接受）。
5. 公開接案頁回應以解構剔除 `guideId`，不含導遊私人欄位。

## 已知限制／追蹤事項（審查累積 Minor）

- Supabase 分支普遍無單元覆蓋（測試全走 in-memory fallback）——含 request_no 23505 重試分支；待 staging 實測補整合驗證。
- migration 無 `.rollback.sql` 伴檔（近期慣例）；`midao_day_overrides` 無 custom_start/end 非空 CHECK。
- `fetchGuideRows` 200 筆/導遊上限（冷啟動可接受，已註解）。
- 送單 `submitLimiter` 為 per-instance 記憶體單例（serverless 各實例各自計數）——與既有 limiters 同慣例，非新風險；honeypot 判斷在 rate-limit 之後（機器人第 6 次起見 429），已知取捨。
- `DATE_RE` 不驗日曆有效性（如 2026-13-45 會過格式檢查）。
- questions label/options 超長採靜默截斷（與 title/tagline 報錯不一致）。

## 下一步

1. **最終整條 branch 審查**（進行中）→ 開 PR → CI 綠燈 → merge。
2. **migration 套用生產**：需使用者 `SQL-OVERRIDE` 授權＋照 `docs/operations/migration-apply-ledger-sop.md` 補 ledger（鐵律 2）。
3. **Plan 2（M4–M6）**：midao2 前端五頁＋三步精靈＋公開接案頁 `/g/[slug]`＋登入導向改 `/midao2`＋E2E。屆時對真實 API 撰寫。
