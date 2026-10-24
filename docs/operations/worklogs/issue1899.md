# issue1899 — 兩項 P2 修正與 #1900 證據恢復

> 恢復日期：2026-10-16（Asia/Taipei；Owner 批准時間 2026-10-15 16:32:13 UTC）｜負責 actor：`/root`｜狀態：Draft，未正式驗收

## 目標

保留 #1899 合併後兩項 P2 的原修正與原始審查證據，補上本次恢復紀錄及 issue／PR 記憶錨點。Owner 對「在 #1900 原工作分支補恢復紀錄、獨立審查後推送、同步 #1899／#1900 證據留言；維持 Draft、不合併、不部署、不碰資料庫」明確回覆「允許」（對話來源 `Sentinel_4a4d7d7ff5088191bab8e0cbfa40fe49`，reply_to `Sentinel_332696d3513481919ee5f197adad2b7e`）。

## AC 清單

- [x] 原 base→head 的 diff bytes 與保存候選完全一致，沒有重做兩項修正。
- [x] 恢復原 reviewer 報告、before／receipt、歷史 CI／Preview 證據，區分獨立報告、作者摘要與模型身分未知。
- [x] 讀 current main 的 D6／D7，記錄原缺口，不回填歷史 PASS。
- [ ] 本次 worklog 候選取得 fresh-context 獨立審查、exact candidate receipt；結果同步至下列 PR。
- [ ] 推送後對新 head 追自然 CI／Preview 終局；同步 #1899／#1900 證據留言並回讀。

## 已完成（附證據）

### 原修正與獨立審查（2026-10-13，非本次重新執行）

- 原 base：`e988e5a6941f7279a350e02d4a513c87627b8130`；原修正 head：`12731986bba626ccce67d4886afc379718a017f2`；[Draft PR #1900](https://github.com/smallwei0301/tour-platform/pull/1900)。
- 只改 `.claude/skills/impeccable/reference/document.md` 與 `.claude/skills/THIRD-PARTY-SKILLS.md`，兩檔三行。原 findings：[Tour 設計來源](https://github.com/smallwei0301/tour-platform/pull/1899#discussion_r4254567290)、[Vibe 來源連結](https://github.com/smallwei0301/tour-platform/pull/1899#discussion_r4254567294)。
- 原獨立 reviewer：`/root/review_1899_p2`，`fork_turns=none`，requested=`gpt-6.1-sol`，actual=`unknown`。原 `review.md` 判定 AC1–5 PASS、unresolvedFindingCount=0；這是內容審查，不是 runtime 模型身分或正式產品驗收。
- 原 before CLI `4494a1` exit 0 → spawn `/root/review_1899_p2` → receipt CLI `e0407f` exit 0 的工具順序可讀。spawn 無可信 UTC／actual model 回執，僅稱 tool-order 已核；receipt 的 `sequenceStatus=TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED`、`identityStatus=NOT_VERIFIED`。
- 原 head 的 [CI success](https://github.com/smallwei0301/tour-platform/actions/runs/38344991736/job/115124202221)（2026-10-13 04:12:20 UTC）、[secret-scan success](https://github.com/smallwei0301/tour-platform/actions/runs/38344991707/job/115124202177)（04:08:23 UTC）、[Vercel success](https://vercel.com/smallwei0301s-projects/tour-platform/3ZRpfFm9r5Vmx25cWY93cc3gVGFY)（04:10:15 UTC）只適用原 head；不得沿用至本次新提交。

原始檔仍保存在原 Tour executor `/workspace/tour-1899-evidence/`；以下 SHA256 為恢復時讀原 bytes 所得，檔案 mtime 不當成平台 dispatch UTC：

| 原檔 | SHA256 | 原 mtime（2026-10-13 UTC） |
|---|---|---|
| `candidate.patch` | `7eeda91c03d3921bd1a0445b6fe9ad660b79b786aa460fb06f7fd9983f37a9a6` | 04:05:29.264992 |
| `review.md` | `eb0643c0c0432871d7f92aee650844bc71704e66488b163592ddd07e55421442` | 04:07:03.340635 |
| `audit.before.json` | `beff644e2dcf80b9284e8dfd2f8d519e11998adacdfe1292b48a014dc88cd11f` | 04:05:38.188600 |
| `audit.receipt.json` | `932b16f573150a70185e0e2088055bfeb8b0bbcf873f1c6f8c815e839f32ef42` | 04:07:23.650544 |
| `pr-status-final.json` | `674e0371c663af1944204e973e42458cb35a7156cc5fa39c5b3d2caea667c49a` | 04:12:57.877365 |
| `runs-final.json` | `dbeade805ce4bbb7d54dfbff57e25eec05ed7a36695238dd1db88f46402cd223` | 04:12:58.713329 |
| `status-final.json` | `4a8b31f2cf30a14c2ee13c211105d9b26e566296043abcdccc0b42df37c0dd06` | 04:12:59.273304 |

### 當日恢復（2026-10-15 UTC／2026-10-16 Asia/Taipei）

- 原環境與 16 份既有證據檔仍存在；讀回原報告及 JSON，不重建遺失紀錄。原 `worklog.json`、PR body 是作者摘要，不冒充獨立 raw review。
- 實跑 `git diff --binary e988e5a6941f7279a350e02d4a513c87627b8130 12731986bba626ccce67d4886afc379718a017f2`，3260 bytes，與 `candidate.patch` bytes 完全相等，SHA256 同上；exit 0。
- current main `2eb6df3d665b64569e2a31a43e08e2a95dc81bec` 的 `.cursor/harness/03_rubrics.md:29–30`：D6 要求 success check-run 連結記入 worklog；D7 要求 worklog 更新＋issue 留言。該檔與原 base bytes 相同。原任務缺 canonical worklog／雙寫，不能將舊摘要視為滿足；本次才補紀錄。
- 施工前原工作樹乾淨，遠端 #1900 head 仍為原修正 head，20 個 open PR 的完整回傳 inventory（各少於 100 檔）未涉及本 worklog；current main 無 `AGENTS.md`／`.agents/skills`。本次只新增本檔，不改受保護指引、規則、其他成果或產品碼。
- 本次是單一已知 worklog 的 small-edit，省略 Scout／獨立 Builder，理由為一檔紀錄補全；獨立 audit 仍須不同 actor、fresh context、明選一般 Sol，不用 premium 模型或增加容量。
- 文件適用 checks：read-back、歷史檔案 SHA256／diff bytes、Markdown 來源與 diff 範圍、`git diff --check`，以及既有 bash-guard 的純文件 commit gate。未變更產品行為，無新增產品測試；未執行 DB、live 或重型測試。新 head 的自然 CI 另行核對。

## 下一步

- 本檔記錄的是提交前候選；獨立審查回執、新 commit／自然檢查終局與兩處留言回讀結果，由 [#1900](https://github.com/smallwei0301/tour-platform/pull/1900)／[#1899](https://github.com/smallwei0301/tour-platform/pull/1899) 的本次恢復證據留言續記，不預填未執行的 PASS。
- 維持 Draft；runtime actual 身分仍 unknown／NOT_VERIFIED，正式產品驗收、Ready、merge、發布不在本次範圍。

## 絕不重做（Do-NOT-redo）

- 不重寫原 review、before／spawn／receipt、舊 CI 或 mtime；不把 requested 當 actual，不補造歷史 trace，不將原內容 PASS 擴張成正式驗收。
- 不碰原作者 `ccr-6b73111f-xycd3l` 分支；原 session 執行狀態不可讀，不能宣稱已停止，也不聯絡外部 agent。
- 程序清理的原證據只有歷史 watch 工具 `03f4ad` exit 0 與作者摘要，沒有獨立清理收據；不補造。既有隔離 worktree／證據目錄保留，沒有啟動本機 server、DB、部署或測試程序。
