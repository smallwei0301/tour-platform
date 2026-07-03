# 05 — 知識迭代與反思協議（harness 的自我維護規則）

> 這套 harness 要能隨專案成長，但**弱模型不能有修改自己籠子的鑰匙**。本檔劃清界線。
> 治理等級：🔒 鎖定檔（含本檔自身）。

## 1. 權限分級（file-guard 執法）

| 等級 | 檔案 | 模型可否自改 |
|---|---|---|
| 🟢 自由寫 | `.cursor/harness/lessons.md`、`docs/operations/worklogs/**`、`docs/operations/qa-reports/**` | 可，隨做隨寫，不必請示 |
| 🔒 鎖定（提案制） | `CLAUDE.md`、`.cursor/harness/0*.md`、`.claude/settings.json`、`.claude/hooks/**` | **不可**。發現錯誤/過時/衝突 → 走 §3 提案流程 |
| ⛔ 絕對禁區 | 弱化任何 hook 的攔截邏輯、放寬 deny 清單、移除 commit gate | 任何情況都不可，含 P0-OVERRIDE |

判斷原則：**紀錄型**（發生了什麼）自由寫；**規則型**（以後該怎麼做）提案制。分不清楚就當規則型。

## 2. lessons.md 寫入格式（踩坑教訓）

觸發時機：花超過 ~30 分鐘才解掉的坑、同類錯誤第二次出現、或驗收 subagent 抓到假性完成。**append-only**，一則一個 `##` 區塊：

```markdown
## [YYYY-MM-DD] {slug，例如 e2e-needs-dev-server}
- Context：{在做什麼任務時撞到}
- Error：{錯誤的可辨識特徵（訊息第一行/錯誤碼），方便未來 grep}
- Solution：{實際解法，含指令或 path:line}
- 適用範圍：{什麼情況下這條才適用，防止過度泛化}
```

每則 ≤10 行。**先 grep 再寫**：同一個坑已有紀錄就在原則補一行日期，不重複開新則。

## 3. 規則型變更的提案流程

1. 在當前任務的 worklog「下一步」區記下發現（不阻塞當前任務）。
2. 任務收尾時，向使用者提交精簡提案：**改哪個檔＋改什麼（before/after）＋為什麼＋不改的風險**。
3. 使用者同意（含 `P0-OVERRIDE: <路徑>` 授權）後才動手；改完在 commit message 引用授權。
4. 使用者未回覆 = 維持現狀。**沉默不是同意。**

## 4. lessons.md 精簡協議（防記憶垃圾場化）

- 觸發條件（任一）：檔案 >300 行、或 >30 則、或粗估 >5,000 tokens（`wc -w` 超過 ~3,500 字可當代理指標）。
- 精簡流程（可自主執行，因為 lessons.md 是 🟢）：
  1. 派一個 fresh subagent 讀全檔，按主題聚類。
  2. 同類 ≥3 則 → 抽象成一條通用原則寫在檔案頂部「## 通則」區，原始各則壓縮成一行（保留日期＋slug＋path 指標）。
  3. 已被 hook/CI 結構性解決的教訓（例如「不要 force-push」）→ 直接刪除，hook 就是它的墓碑。
  4. 精簡結果經第二個 subagent read-back 比對「有沒有丟失仍然有效的教訓」後才落檔。
- 抽象出的通則若已成熟到該進 `03_rubrics.md` → 走 §3 提案流程，不自行搬移。

## 5. 定期健檢（每月一次或使用者要求時）

自主可做（唯讀）：檢查 harness 各檔的路徑引用是否仍存在（檔案改名/搬家會讓規則失效）、lessons.md 是否觸發精簡、worklogs 中反覆出現的 blocker 模式。產出：一頁健檢報告放 `docs/operations/reports/`，異常項按 §3 提案。
