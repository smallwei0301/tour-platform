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

## 下一步／未完成
- [ ] Fresh Rita review of the final head.
- [ ] Hosted typecheck/Vercel/browser/probe/scan/migration checks after the final head.
- [ ] Remaining Issue #1759 Task 36–43 implementation and acceptance.
- [ ] Parent Issue remains OPEN and PR must remain `Refs #1759`, not `Closes #1759`.

## 絕不重做（Do-NOT-redo）
- 不碰 migrations/schema/gateway/writer、auth/CSRF/rate-limit、LINE、payment、production 或 Task 36–43。
- 不使用 `any`、`as`、`!`、typecheck suppression、coercion 或 UUID restriction。
- 不修改 `CLAUDE.md`、`.claude/**`、`.cursor/harness/**`、其他 worklogs 或第三個以上的產品檔案。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
