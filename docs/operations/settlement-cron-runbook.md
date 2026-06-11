# Settlement 自動排程 Runbook（#1365 缺口 1）

> 對應 workflow：`.github/workflows/settlement-sweep.yml`
> 相關：#1365（缺口）、#1336（INTERNAL_ALERT_TOKEN）、`docs/05-business/06-payment-plan/03-settlement-rules.md`（結算規則 v1）

## 這條排程做什麼

每日 **02:00 UTC（10:00 Asia/Taipei）** 串行執行兩支 internal endpoint，把「已完成的訂單」推進到「admin 可確認的待出款單」：

| 順序 | Endpoint | 動作 |
|---|---|---|
| 1 | `POST /api/internal/settlement/sweep` | 將 `status='completed'` 且出團日已過 T 天（預設 7）的訂單結算進 `payout_items`，累積 `guide_balances` |
| 2 | `POST /api/internal/settlement/generate-payouts` | 對 `guide_balances ≥ min_withdrawal_twd`（預設 5,000）的導遊產生 `pending` payout，admin 出款管理才看得到 |

**順序不可顛倒**：generate-payouts 讀的是 sweep 寫入的 `guide_balances`。Step 1 非 200 即中止，不執行 Step 2（避免用過期餘額產生出款單）。

## 啟用所需 secrets（operator 一次性）

GitHub repo → Settings → Secrets and variables → Actions：

| Secret | 用途 | 缺失時行為 |
|---|---|---|
| `INTERNAL_ALERT_TOKEN` | 兩支 endpoint 的 `x-internal-token` 守門（與其他 5 支 internal sweep 共用） | workflow graceful skip（無 POST、無誤產） |
| `NEXT_PUBLIC_VERCEL_URL` | 目標 host（不含 `https://`） | 同上 graceful skip |

> 同時須在 **Vercel production 環境變數**設定相同的 `INTERNAL_ALERT_TOKEN`，否則 endpoint 端會回 401（見 #1336）。GitHub secret 是「呼叫端帶的鑰匙」，Vercel env 是「伺服器端的鎖」，兩邊必須一致。

## 設好後怎麼手動驗證（不必等到隔天）

1. GitHub → Actions → **settlement-sweep** → **Run workflow**（workflow_dispatch）
2. 看 run log：
   - secrets 齊全 → 兩個 step 應各印 `HTTP status: 200` 與 `✅ ... completed successfully.`
   - secrets 缺失 → 印 `⚠️ ... not configured.` 並 skip（代表 secret 還沒設好）
3. 進 admin 出款管理（`/admin/payouts`）：
   - 「導遊結算餘額」區塊應出現有完成訂單的導遊餘額
   - 達門檻者會由 generate-payouts 自動產生 `pending` 出款單，列在上方待出款列表
4. 回 #1365 以無 PII 證據（settled / generated 計數、Asia/Taipei 時間、run URL）留 sign-off

## 與手動 fallback 的關係（#1365 缺口 2）

此排程是常態自動路徑。`/admin/payouts` 的「手動產生出款單／取消」是備援，用於：
- 排程尚未啟用（secret 未設）期間
- 臨時需對未達門檻導遊提前出款（admin 判斷）

兩者共用同一組 `payouts` / `guide_balances` 資料與 pending 唯一性守門，不會衝突。

## 調整週期 / 參數

- 改頻率：編輯 workflow 的 `cron`（目前 `0 2 * * *`）
- 改結算規則（T 天、抽成、門檻）：改 `settlement_rules` 資料表（`is_active=true` 那列）或對應 env（`SETTLEMENT_T_DAYS` / `SETTLEMENT_COMMISSION_RATE` / `SETTLEMENT_MIN_WITHDRAWAL_TWD`），見 `src/lib/settlement-config.ts`
