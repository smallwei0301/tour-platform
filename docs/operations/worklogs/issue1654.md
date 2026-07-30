# issue1654 worklog — [Ops] readiness live-state snapshot 反覆 stale

- Issue: https://github.com/smallwei0301/tour-platform/issues/1654
- Branch: `claude/resolve-open-issues-uiv0ql`

## 調查結論（2026-07-22）

- **2026-06-09 的 stale regression 已自癒**：`git log -- docs/operations/reports/readiness-live-state-latest.md` 顯示自 2026-07-14 起每日 05:45–06:02 UTC 穩定有 `chore(docs): auto-refresh readiness live-state snapshot` commit；issue 開立時（07-08）點名的停滯已不存在。
- **真正殘留的問題是節奏不一致**：workflow `.github/workflows/readiness-snapshot-refresh.yml` 已於先前降頻為**每日一次**（cron `0 5 * * *`，註解明載「由每 6 小時降頻至每日」），但：
  - `check-snapshot-freshness.mjs` 門檻仍是 **12h** → 每天 17:00 UTC 之後快照必然被判 stale（實測本日 19.5h 被判 `[STALE]`），guard 形同每天狼來了半天；
  - README.md／docs/README.md／docs/NEXT_PHASE_PLAN.md／產生器 freshness_rule 仍宣稱「every 6h / >12h stale」→ 文件誤導（issue AC 明確要求修正）。

## 修補

1. `scripts/readiness/check-snapshot-freshness.mjs`：門檻 12h → **26h**（每日節奏＋2h 緩衝）。
2. `scripts/readiness/generate-live-state-snapshot.mjs` freshness_rule 模板＋現行快照檔頭註解：改宣稱 daily (05:00 UTC)／26h（未動任何 live 數字）。
3. README.md／docs/README.md／docs/NEXT_PHASE_PLAN.md 同步改寫。
4. `tests/api/issue1298-readiness-freshness-guard.test.mjs`：門檻斷言 12 → 26；GREEN fixture 改用 20h（舊門檻必誤判、新門檻必通過的年齡）。
5. 新增 `tests/unit/issue1654-readiness-cadence-consistency.test.mjs`：鎖住「workflow cron 節奏 < checker 門檻」「文件不得再宣稱 every 6h / 12h」「產生器宣稱＝checker 實際門檻」三個一致性，未來再降/升頻會直接紅燈。

## 實跑證據

- `node --test issue1654-readiness-cadence-consistency.test.mjs issue1298-readiness-freshness-guard.test.mjs ...` → 16/16 pass。
- `npm run readiness:check` → `[OK] snapshot is 19.5h old (freshness threshold: 26h)`（修補前同一快照被判 STALE）。
- 自動刷新路徑本身健康：連續每日 commit 證據如上；freshness guard 在 workflow 內未被 `|| true` 吞掉（issue1298 契約測試持續鎖住）。

## AC 對照

- [x] 重現／確認 2026-06-09 停滯原因：已被先前修復解決，現行停滯感來自 12h 門檻 vs 每日節奏的錯配。
- [x] 修復自動刷新路徑或改寫說法：路徑健康，說法與門檻已對齊每日節奏。
- [x] stale 超門檻仍會 fail（exit 1）且不被吞（issue1298 測試鎖住）。
- [x] `npm run readiness:check` 成功證據（見上；`readiness:snapshot` 需 gh CLI，本環境無 gh——由每日 CI 執行，最近一次成功 commit `e6aecf7` 2026-07-21 05:59 UTC）。
- [x] snapshot timestamp 與 live state 相符：由每日 CI 維持；drift check 保留於 workflow。
- [x] README/docs 說法不再誤導。
