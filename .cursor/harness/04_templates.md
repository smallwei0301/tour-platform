# 04 — 標準化派工 Prompt 模板＋worklog 模板

> 用法：複製對應模板 → 把 `{…}` 全部填實 → 作為 Agent 工具的 prompt 發出。**空著的 `{…}` 等於沒派工。**
> ⚠️ 特別注意 `issueNNNN`／`issue{NNNN}` 必須替換成實際 issue 號碼——留著字面 NNNN 會導致測試 pattern 零匹配（run-checks.sh 會對零匹配硬失敗，但別浪費那一輪）。
> 所有模板都內建 02 §2 的三件套（背景／AC／回報格式）。
> 治理等級：🔒 鎖定檔（`05_maintenance.md`）。

## T1 — 深度搜尋與研究（agent type: `Explore`）

```text
【任務】在 tour-platform repo 回答：{一句話問題，例如「guide_token 的簽發與驗證分別在哪些檔案、流程為何」}
【背景】這是 Next.js 15 monorepo，主 app 在 apps/web/。已知線索：{已知的檔名/關鍵字/issue 編號，沒有就寫「無」}。
和本題相關的架構背景：{貼上 CLAUDE.md 架構速覽中相關的 1–3 行}。
【範圍】搜尋 {目錄範圍，例如 apps/web/src/ 與 apps/web/app/api/}；深度：{medium｜very thorough}。
【驗收條件】
- 每個結論都附 檔案路徑:行號。
- 區分「確定（親眼讀到代碼）」與「推測（僅由命名/註解推斷）」，推測要標 UNVERIFIED。
- 找不到就回報「未找到＋已搜過的 pattern 清單」，不得腦補。
【回報格式】≤400 字結論 + 條列的 path:line 清單。禁止貼大段代碼（>20 行一律改指位）。
```

## T2 — 新功能實作（agent type: `general-purpose`）

```text
【任務】實作 {issue 編號＋標題}：{兩三句說明要達成的使用者行為}。
【背景（必讀，開工前先讀完）】
- 讀 /home/user/tour-platform/CLAUDE.md（十條鐵律，全部適用於你）。
- 讀 .cursor/harness/07_testing_playbook.md 的 {§3 backend TDD｜§4 Playwright｜§5 hybrid}。
- 相關現有代碼：{path:line 清單，指揮官先用 T1 探勘好再填}。
- 本任務的 worklog：docs/operations/worklogs/issue{NNNN}.md（完成後更新「已完成」區）。
【硬限制】
- 新 API 一律落 apps/web/app/api/v2/**；凍結區（orders/payments/既有 migrations/受保護 spec）碰都不碰，被 file-guard 擋下就停手回報，不得繞。
- 改 db.mjs gateway 必須同步 in-memory fallback＋契約測試。
- TDD：先寫紅測試（tests/**/issue{NNNN}-*.test.mjs）再實作。
【驗收條件】
1. {AC1，可機器判定}
2. {AC2}
3. .claude/hooks/run-checks.sh {測試檔} exit 0，且未修改任何既有測試的斷言。
【回報格式】新/改檔案清單（path:line）＋測試指令與 exit code＋一句話結論＋（若有）blocker。禁止貼實作全文。
```

## T3 — 架構重構（agent type: `Plan` 先行，`general-purpose` 執行）

```text
【任務】重構 {目標，例如「把 db.mjs 的退款金額計算抽到 src/lib/ 純函式」}（依據：{issue/#1385 strangler 準則等}）。
【背景（必讀）】
- 讀 CLAUDE.md 架構速覽＋.cursor/harness/07_testing_playbook.md §3「db.mjs 特別條款」。
- 現況：{path:line 指出要動的代碼＋誰在呼叫它（指揮官先探勘）}。
【硬限制】
- 行為零改變：重構前後所有既有測試綠燈，不改任何斷言。
- 一次一個函式/模組，diff >300 行就停下拆單。
- 凍結區與受保護 spec 不碰。
【驗收條件】
1. 重構前先跑 run-checks.sh {受影響測試檔} 綠燈存證（baseline）。
2. 重構後同一組測試綠燈＋新抽出的純函式有自己的單元測試。
3. 舊呼叫點全數改接新位置（grep 舊符號 = 0 命中，或列出刻意保留處）。
【回報格式】異動清單（path:line）＋baseline 與重構後兩次測試 exit code＋grep 驗證結果。禁止貼整檔 diff。
```

## T4 — 代碼與安全審查（agent type: `general-purpose`，fresh context）

```text
【任務】審查 {PR #N 或 branch/diff 範圍}，你是挑剔但講證據的 reviewer。
【背景】變更意圖：{一句話}。相關契約/文件：{如 docs/04-tech/.../10-api-spec-v2-booking-pos.md}。
你沒有參與實作，這是刻意的——不要採信 commit message 的自述，一切以 diff 與實跑為準。
【審查清單（逐項回答，沒問題也要寫「檢查過，無」）】
1. 正確性：邏輯錯誤、邊界條件、狀態機跳轉遺漏。
2. 安全：auth realm 是否走 middleware 前門、CSRF、RLS 假設、secrets 外洩、PII 進 log。
3. 冪等：payment/booking 相關路徑重放是否安全。
4. 測試誠實度：測試是不是真的鎖住新行為？有沒有被改鬆的斷言、skip 掉的 case？
5. 凍結區：diff 是否觸碰 01_diagnostics.md §3 清單（觸碰即 FAIL，除非 PR 說明含使用者 P0-OVERRIDE 紀錄）。
【驗收條件】實際重跑 targeted 測試（不信任 PR 的自述）；每個 finding 附 path:line＋一句修法建議＋嚴重度（P0/P1/P2）。
【回報格式】結論（APPROVE / REQUEST_CHANGES）＋finding 清單。無 finding 也要交五項清單的逐項「檢查過」。
```

## V — 隔離驗收（agent type: `general-purpose`，fresh context；02 §5 專用）

```text
【任務】驗收以下工作成果。你沒有參與實作，不要採信任何「已完成」的說法，一切自己驗。
【宣稱的成果】{檔案清單＋宣稱行為，只貼宣稱，不貼實作者的過程敘述}
【驗收步驟（順序執行）】
1. Read-back：逐一重讀上述檔案，確認存在、完整（無截斷）、內容與宣稱一致。任何一個檔案不存在 → 直接 FAIL 並標「假性完成」。
2. 實跑：.claude/hooks/run-checks.sh {測試檔}；使用者可見行為另跑 {e2e spec}。自己跑，不看既有證據檔。
3. 逐條 AC 判定：{AC 清單}
【回報格式】每條 AC：PASS（附證據：exit code / path:line / 輸出摘要）或 FAIL（附差距描述）。總結一行：ACCEPT / REJECT。
```

## W — worklog 模板（`docs/operations/worklogs/issueNNNN.md`）

```markdown
# issue{NNNN} — {標題}
> 最後更新：{Asia/Taipei 時間}｜負責 session：{model/日期}

## 目標
{一句話}

## AC 清單
- [ ] AC1 {…}
- [ ] AC2 {…}

## 已完成（附證據）
- {日期} {事項}（commit {SHA}｜run-checks exit 0｜PR #N CI success 連結）

## 下一步
- {下一個具體動作}

## 絕不重做（Do-NOT-redo）
- {已完成且驗證過的檔案/決策/已排除方案＋一句原因}

## P0-OVERRIDE 使用紀錄（如有）
- {日期} {路徑}｜使用者授權原文：「{引用}」
```

## I — issue 里程碑留言模板（雙寫的另一半）

```markdown
🤖 進度錨點（{Asia/Taipei 時間}）
- 完成：{里程碑一句話}（commit {SHA}／PR #{N}）
- 證據：{run-checks exit 0｜CI 連結｜qa-report 路徑}
- 下一步：{一句話}
- worklog：docs/operations/worklogs/issue{NNNN}.md
```
