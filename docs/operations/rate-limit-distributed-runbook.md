# 分散式登入限流 runbook（Upstash Redis）

> 對應 issue #1599。登入限流（adminLogin／guideLogin）在記憶體版之外疊加**跨實例**分散式層，
> 防止攻擊者把暴力破解請求打散到不同 serverless 實例來稀釋名目限制。

## 現況

- 程式碼：`src/lib/rate-limit-distributed.ts`（可插拔 store：Upstash Redis REST／記憶體 fallback）
- 接入點：`app/api/admin/auth/session`、`app/api/guide/auth/session`（各 10 次失敗／分鐘／IP）
- **未 provision Upstash 時**：自動 fallback 到共享記憶體 store（單實例）——與導入前行為一致，**不影響現有登入**。
- **Redis 逾時／錯誤**：fail-open（放行）＋`recordIncident` 告警——限流服務故障不會讓登入全站不可用。

## 開通步驟（owner）

1. **建立 Upstash Redis**（擇一）：
   - Vercel Marketplace → Upstash → Create（region 選近 `ap-northeast-1`），env 自動注入專案；或
   - Upstash Console 建 database，複製 REST URL／TOKEN。
2. **設定 env**（Vercel Project → Settings → Environment Variables，Production＋Preview）：
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. **重新部署**。部署後 `resolveRateStore()` 偵測到 env → 自動改用 Upstash（無需改碼）。

## 驗證（staging drill）

1. 對 `POST /api/admin/auth/session` 以錯誤 token 連續打 11 次（同 IP）→ 第 11 次應回 `429 RATE_LIMITED`。
2. **跨實例驗證**：連打到接近上限 → 觸發一次新部署或等冷啟換實例 → 再打，計數**仍延續**（證明是 Redis 共享而非單實例記憶體）。
3. 於 Upstash Console 應看到 `admin-login:<ip>` / `guide-login:<ip>` key 出現並帶 TTL。

## 緊急停用

刪除 `UPSTASH_REDIS_REST_URL`／`TOKEN` env 並重部署 → 立即回退到記憶體 store（不會壞登入）。

## 監控

- 分散式 store 失敗會以 `severity=warn`、`source=rate-limit-distributed`、`category=rate_store_failure`
  過 `recordIncident`（Sentry／Telegram）。key 含 IP（PII），故只記 limiter 名稱前綴、不記完整 key。
- 若頻繁看到 `rate_store_failure` 告警：檢查 Upstash 額度／區域延遲；fail-open 期間限流退回單實例。
