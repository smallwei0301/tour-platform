# 08 — Session Branch Hygiene（CLAUDE.md 抽離全文）

> Session work branches（例 `claude/<session-slug>`）是短命 scratch space，不是長壽 feature branch。
> harness 註記：bash-guard **硬擋一切 force-push**（含 `--force-with-lease`），所以本檔第 3 點的 merge 回收流程是唯一路徑。
> 治理等級：🔒 鎖定檔（`05_maintenance.md`）。

1. **開工先對齊 main**：`git fetch origin main && git reset --hard origin/main` 後再開始改。session branch 不保留歷史包袱，diff 永遠等於「最新 main + 本輪修正」。（注意：`reset --hard` 只在**開工、尚無本輪工作**時使用。）

2. **Push 被拒、遠端有未在本地的 commit 時，不要先 rebase**：先用 `git patch-id` 比對那些遠端 commit 與 main 上的 squash-merge commit 是否同 patch：
   ```bash
   git show <remote-commit> | git patch-id
   git show <suspect-main-commit> | git patch-id
   ```
   patch-id 相同代表內容已被 squash 進 main，遠端那份是無價值的 pre-squash 殘留。patch-id 不同才真的 rebase 保留。

3. **殘留回收流程（不需 force-push，harness 下的標準路徑）**：
   1. 驗證 `git diff origin/<session-branch> origin/main --stat` 為**空**（殘留內容已全進 main）。
   2. `git merge origin/<session-branch> --no-edit` 把殘留歷史收回本地，再正常 `git push`。
   3. merge-base 會落在最新 main，PR diff 不會混入已 merge 的舊變更。
   4. 之後每輪 squash-merge 後改用 `git merge origin/main --no-edit` 同步（取代第 1 點的 reset --hard），全程不需 force-push。
   5. 若第 1 步 diff **不為空**（遠端有未進 main 的真工作），停下來：先 merge 收回、確認內容，不確定就熔斷問使用者。

4. **絕不對 `main` force-push**，也不對非 session-owned branch 做任何破壞性操作。（bash-guard 對所有 force-push 一律擋下，無 override。）

5. **Push 規範**：一律 `git push -u origin <branch-name>`；網路錯誤才重試，最多 4 次、指數退避（2s/4s/8s/16s）。

6. **fresh container 注意**：
   - 開工先在 repo root 跑 `npm install`（沒裝 `typescript`，tests 整套紅）。
   - `npm install` 可能動到根目錄 `yarn.lock`——該檔改動**不要 commit**：`git checkout -- yarn.lock`（file-guard／bash-guard 都會擋 yarn.lock 進 commit）。

7. **PR 已被 merge 後的後續工作** = 全新變更：從最新 main 重開同名 branch（`git fetch origin main && git checkout -B <branch> origin/main`），開**新的 PR**，絕不把新 commit 疊在已 merge 的歷史上。
