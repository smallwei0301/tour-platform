# anon-rls-probe 啟用手冊（行為式 RLS 外洩防線）

> 對應 #1563 P0 外洩的 ground-truth 防線。腳本 `scripts/security/anon-rls-probe.mjs`、workflow `.github/workflows/anon-rls-probe.yml`。

## 這是什麼

用「公開 anon key」（前端瀏覽器裡那把、攻擊者也拿得到）**實際去 SELECT 敏感表**，任何一張讀到資料、或被授權存取（即使目前 0 筆）＝FAIL。這是「像攻擊者一樣實測」，補既有 `rls-grants-preflight`（讀設定藍圖）看不到的洞。

- **唯讀**：只 SELECT，絕不寫入生產（避免 RLS 若破了、probe 反而竄改資料）。
- **不印 PII**：只 log 筆數與表名，不印實際資料列。

## Owner 必做的兩步（workflow 無法代做；不做則「擋 merge」不生效）

### 1. 新增 CI secret `SUPABASE_ANON_KEY`
repo **Settings → Secrets and variables → Actions → New repository secret**：
- Name：`SUPABASE_ANON_KEY`
- Value：Supabase Dashboard → Project Settings → API → **anon public** key（**不是** service_role）。
- （`SUPABASE_URL` 應已存在，供既有 workflow 使用。）

anon key 本就公開在前端，放進 secret 只是方便 CI 取用，風險低。

### 2. 把 probe 設為 main 的 required status check（這才是真正「擋 merge」）
repo **Settings → Branches（或 Rules → Rulesets）→ main**：
- 勾 **Require status checks to pass before merging**。
- 加入 check：**`probe`**（本 workflow 的 job 名；需先在一個 migration PR 上跑過一次才會出現在選單）。

沒有第 2 步，probe 紅燈只是紅燈，模型/人仍可 merge。

## 觸發時機

| 觸發 | 用途 |
|---|---|
| 每晚 19:00 UTC（03:00 台北） | 對 production 偵測，最長 24h 內抓到任何新外洩 |
| PR 觸碰 `supabase/migrations/**` | migration PR 的 merge gate |
| 手動 `workflow_dispatch` | 隨時複查 |

## ⚠️ 誠實限制

- **PR gate 測的是「當前 production」，不是「本 PR migration 套用後」的狀態**。要驗證 PR 本身的效果，需先把 migration 套到 ephemeral/branch DB 再探測（Supabase branching，另案；目前 branching 工具在 deny 清單且有成本）。現階段 PR gate 的語意＝「production 目前無外洩，才准再讓新 schema 變更進場」。
- **cold-start 空表**：`orders` 等目前可能 0 筆，讀不到列；但 probe 對「anon 被授權存取（authorized，即使 0 筆）」也判 FAIL（`exposed`），所以空表被誤開權限也擋得到。
- **最終的牆**仍是 Supabase MCP server 端唯讀 + DB 角色權限；probe 是偵測層，不是阻止寫入層。

## 缺 secret 時的行為

secret 未設 → job HOLD（跳過、不阻擋），step summary 提示去設定。設好後才真正生效。
