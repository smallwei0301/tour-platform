# issue1759 — Midao public inquiry Task 35
> 最後更新：2026-08-05 Asia/Taipei｜負責 session：Ava／Kanban Task 35

## 目標
完成 Task 35 public inquiry snapshot contract、hosted typecheck repair、activity_id validation evidence；父 Issue #1759 的 Task 36–43 仍未完成。

## 執行錨點
- Issue：https://github.com/smallwei0301/tour-platform/issues/1759
- PR：https://github.com/smallwei0301/tour-platform/pull/1792
- Branch：`feat/issue-1759-p4-task35-public-inquiry-20260805`
- Worktree：`/root/.openclaw/workspace/worktrees/tour-platform/issue-1759-p4-task35-public-inquiry-20260805`
- Starting HEAD：`c4ebd77a12ef320ed6f17172ff73d8974e2d913b`

## AC 清單
- [ ] 父 Issue #1759 全部 Package 4–Task 43 acceptance（本 PR 僅 Task 35 partial slice）。
- [ ] hosted typecheck／Vercel／required browser exact final-head evidence（施工前未完成）。
- [ ] fresh Rita final-head review（施工前未完成）。
- [x] Task 35 focused/compatibility baseline：local 21/21、35/35；原始 Task 35 Rita PASS。
- [x] Task 35 local repair gate：`npm run typecheck -w @tour/web` exit 0；focused 21/21。
- [x] Task 35 local compatibility gate：public inquiry、gateway、state-machine、architecture ratchet 四檔 35/35。

## 已完成（附證據）
- Task 35 original local implementation was reviewed at `c4ebd77a12ef320ed6f17172ff73d8974e2d913b` with focused 21/21 and compatibility 35/35.
- PR #1792 exact head hosted `test` Web typecheck exposed TS2339 at route.ts 212/224/249/252/262–266; Vercel failed on the same head. This is the current repair target, not a claimed PASS.
- Owner approved the activity_id malformed-input contract and this three-file scope; fresh Canary and Lane A plan evidence are recorded on Kanban.
- 2026-08-05 local RED evidence: after the existing test blocks were extended, the focused run failed 19/21: whitespace-padded `activity_id` returned 404 instead of 201, and malformed `activity_id` returned 404 instead of 400 `INVALID_REQUEST`.
- 2026-08-05 local GREEN evidence: `NODE_OPTIONS=--max-old-space-size=768 timeout 300s npm run typecheck -w @tour/web` exit 0; `NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 tests/api/midao-public-inquiry.test.mjs` passed 21/21.
- 2026-08-05 local compatibility evidence: `NODE_OPTIONS=--max-old-space-size=768 timeout 120s node --test --test-concurrency=1 tests/api/midao-public-inquiry.test.mjs tests/api/midao-inquiries-gateway.test.mjs tests/unit/midao-inquiry-state-machine.test.mjs tests/unit/architecture-ratchet-guard.test.mjs` passed 35/35. `.claude/hooks/run-checks.sh --typecheck apps/web/tests/api/midao-public-inquiry.test.mjs` also passed 21/21 plus typecheck when invoked with Node TAP reporter.
- No production mutation, migration apply, LINE send, payment, deploy, merge, credential or customer-data action was performed.

## Task 32 migration source-side preflight（2026-08-06，Kanban t_266b8b10）
- Branch：`fix/issue-1759-task32-migration-preflight-20260806`；Worktree：`/root/.openclaw/workspace/worktrees/tour-platform/issue-1759-task32-migration-preflight-20260806`；Base：`ed9e16053295a94241674f40dee636f628819f8c`。
- 改名理由（owner 2026-08-06 拍板 A.3 選項 1）：原 `20260729190000_midao_inquiries.sql` 與 origin/main 已 verified 的 `20260729190000_issue1777_post_review_fixes.sql` 時間戳撞號，改為 `20260806090000_` / `20260806091000_` 避開。`git mv` 保留內容，sha256 不變：inquiries `2d7a2467540991d0a5faf33243ab06ca19d205f233f959fb76a8a07073638a70`、booking intake `d4349b811d3026771e6b2b46b059d567ebaaf3ee6f1bf2c20a2c2464f231b00a`（後者再套冪等修改）。
- 冪等修復：`20260806091000_...sql` 的 `ADD CONSTRAINT midao_guide_inquiries_converted_booking_fk` 改為 `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) ... END $$;`，重複套用不再拋 42710。
- 新增 rollback companion 兩支（沿用既有 operator-only + `midao.rollback_owner_authorized` 授權寫法）：`20260806090000_midao_inquiries.rollback.sql`（drop policy → drop 三索引 → drop table）、`20260806091000_..._confirmation.rollback.sql`（drop 三表 → drop `midao_bookings_source_inquiry_idx` → drop FK constraint → drop bookings 三欄）。同時回退時順序必須先 091000 後 090000，兩檔標頭已載明。
- 測試同步：`apps/web/tests/api/midao-inquiry-schema-migrations.test.mjs` 僅更新兩個 migration 路徑常數，未放寬任何斷言。
- GREEN 證據（2026-08-06 Asia/Taipei）：`node --test apps/web/tests/api/midao-inquiry-schema-migrations.test.mjs` 3/3；`node --test apps/web/tests/api/midao-inquiries-gateway.test.mjs` 6/6；`node scripts/check-migration-source-gate.mjs --mode source` → `migration source gate: verified`，exit 0；`NODE_OPTIONS=--test-reporter=tap .claude/hooks/run-checks.sh apps/web/tests/api/midao-inquiry-schema-migrations.test.mjs apps/web/tests/api/midao-inquiries-gateway.test.mjs` → pass 9 / fail 0，exit 0，證據寫入 `.claude/state/last-checks.json`。（本機 node 為 v24，預設 spec reporter 不吐 `# tests` 行導致 hook 誤判 0 測試；改用 TAP reporter 即可，未修改 hook。）
- 預期仍 RED（HOLD，正確結果）：`node scripts/check-migration-ledger.mjs --mode verified` exit 1，missing 恰為 2 支且已更新為新檔名 `20260806090000_midao_inquiries.sql`、`20260806091000_midao_booking_intake_pricing_and_confirmation.sql`；`node --test apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs` 仍紅。此為 production-apply 需求，非程式缺陷。
- 未動 `docs/operations/migration-ledger.json`、未改 gate 腳本、未連線 production、未在 primary checkout 施工。

## Task 32 migration production apply（2026-08-06，owner 授權 SQL-OVERRIDE，Kanban t_1eb6ccd2 規劃）
- **閘門一（備份+唯讀 preflight）**：REST API + 直連資料庫 catalog 雙重確認 4 張新表（guide_inquiries/booking_intake_responses/booking_pricing_snapshots/booking_confirmation_tokens）皆不存在、bookings 三欄不存在、FK 約束不存在。備份：Supabase 專案標準每日備份+PITR。
- **閘門二（原子套用+立即驗證）**：owner 提供正確 direct pooler session mode 連線資訊（`aws-1-ap-northeast-1.pooler.supabase.com:5432`）。以 `psql -f`、`lock_timeout=5s`/`statement_timeout=60s` 依序套用 `20260806090000_midao_inquiries.sql` → `20260806091000_midao_booking_intake_pricing_and_confirmation.sql`，兩者皆無錯誤。套用後立即驗證：4 張表 `to_regclass` 存在、`bookings` 三欄存在且 nullable/default 符合設計、FK 約束存在、4 張表皆 RLS+FORCE RLS、`guide_inquiries` 具 1 條 policy（其餘三表無 policy＝預設全拒，符合設計）、4 個具名索引存在。`NOTIFY pgrst, 'reload schema'` 送出後，REST API 對 `guide_inquiries` 與 `bookings.source_inquiry_id` 皆回 200，交叉確認 schema 已生效。
- **閘門三（ledger 更新）**：`docs/operations/migration-ledger.json` 追加兩筆 `verified` record（六個 key 精確符合 gate 要求），`applied_at` 為實際套用完成時間。`node scripts/check-migration-ledger.mjs --mode verified` 轉為 exit 0；`node --test apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs` 14/14 全綠（原本唯一失敗的 case 現已通過）。
- 未做：production 功能性 API smoke（inquiries 建立/查詢流程）、Task 36–43 應用層邏輯；那些不在本次 migration apply 範圍內。

## 下一步／未完成
- [ ] Fresh Rita review of this ledger-update commit（僅 ledger 一檔）。
- [ ] 重新確認 hosted PR #1792 CI 的 `test` job 是否轉綠（原本唯一失敗點已在本機修復並驗證）。
- [ ] Hosted typecheck/Vercel/browser/probe/scan/migration checks after the final head.
- [ ] Remaining Issue #1759 Task 36–43 implementation and acceptance.
- [ ] Parent Issue remains OPEN and PR must remain `Refs #1759`, not `Closes #1759`.

## 絕不重做（Do-NOT-redo）
- 不碰 migrations/schema/gateway/writer、auth/CSRF/rate-limit、LINE、payment、production 或 Task 36–43。
- 不使用 `any`、`as`、`!`、typecheck suppression、coercion 或 UUID restriction。
- 不修改 `CLAUDE.md`、`.claude/**`、`.cursor/harness/**`、其他 worklogs 或第三個以上的產品檔案。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
