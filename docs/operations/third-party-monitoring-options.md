# 第三方獨立監控服務評估

> 用途：供 Wei 選定 GitHub Actions 以外的 uptime/synthetic 監控服務。
> 參考：issue #685、#629（GitHub Actions probe），#607（alert drill）
> 建立日期：2026-06-03（AI 分析，Wei 做最終決定）

---

## 為何需要第三方監控

GitHub Actions synthetic probe（#629）的殘餘風險：若 GitHub 與 Vercel **同時局部異常**，probe job 可能不觸發，監控盲點最長可達 1 個 scheduled interval（目前 5 分鐘）。

第三方服務從獨立基礎設施探測，消除這個盲點。

---

## 候選方案比較

### A. Better Stack (BetterUptime / Logtail)

| 項目 | 說明 |
|------|------|
| 免費方案 | 是（50 次 monitor / 3 分鐘間隔）|
| 付費起點 | US$24/月（More plan：1 分鐘間隔、status page、Slack/PagerDuty）|
| 檢查頻率 | 免費 3 分鐘；付費最短 30 秒 |
| 告警通道 | Email, Slack, Teams, PagerDuty, LINE（需 webhook）, **Telegram webhook** ✅ |
| Status page | 付費方案包含，可公開給旅客 |
| Incident management | 有 on-call schedule、escalation |
| 從幾個區域探測 | 8+ 個全球 PoP（免費方案限 1 個）|
| 管理介面 | 直覺，documentation 清楚 |
| 與 Vercel 整合 | 有 native Vercel integration（deploy notification）|
| **推薦指數** | ⭐⭐⭐⭐⭐ 最推薦 |

**優點：** Telegram 告警 webhook 可直接整合現有 bot；有 status page 可對外；免費方案已足夠 soft-launch。

---

### B. UptimeRobot

| 項目 | 說明 |
|------|------|
| 免費方案 | 是（50 monitors / **5 分鐘** interval）|
| 付費起點 | US$7/月（Pro：1 分鐘間隔、advanced alerts）|
| 檢查頻率 | 免費 5 分鐘；Pro 1 分鐘 |
| 告警通道 | Email, SMS, Slack, Telegram ✅, Discord, webhook |
| Status page | 是（免費）|
| Incident management | 基本（沒有 on-call schedule）|
| 從幾個區域探測 | 免費 1 個；Pro 多個 |
| 管理介面 | 簡單，functional |
| **推薦指數** | ⭐⭐⭐⭐ 適合快速開始 |

**優點：** 最快上手、Telegram 原生支援、免費方案足夠；5 分鐘間隔在 soft-launch 期間可接受。  
**缺點：** 免費方案只有 5 分鐘間隔（GitHub Actions 也是）；如果 GitHub + Vercel + UptimeRobot 都掛，仍可能有短暫盲點（但這概率極低）。

---

### C. Sentry Cron / Check-in（既有基礎設施）

| 項目 | 說明 |
|------|------|
| 費用 | 已包含在 Sentry 訂閱中（若有付費方案）|
| 做法 | 在 `/api/health` route 加入 Sentry.captureCheckIn()；Sentry 若 N 分鐘未收到 check-in → alert |
| 告警通道 | Sentry alerts → Email, Slack, PagerDuty |
| Status page | 無（需另外設定）|
| 複雜度 | 需要改程式碼（加 check-in ping），不是純外部探測 |
| **推薦指數** | ⭐⭐⭐ 只推薦作為補充 |

**適用時機：** 已有 Sentry 付費方案，且不想多一個外部服務帳號。  
**限制：** 不是真正的「外部探測」（還是靠應用程式主動 ping），不能偵測應用完全無法啟動的情況。

---

## Wei 的決策清單

**請勾選以下項目並填入決定：**

- [ ] 選擇的監控服務：**UptimeRobot / Better Stack / Sentry Cron / 其他 ______**
- [ ] 付費 / 免費方案：___________
- [ ] 告警通道：**Telegram bot / Email / Slack / 其他**
- [ ] 監控目標（最少需要）：
  - [ ] `https://tour-platform-nine.vercel.app/api/health` (HTTP 200)
  - [ ] `https://tour-platform-nine.vercel.app/` (HTTP 200)
  - [ ] `https://tour-platform-nine.vercel.app/activities` (HTTP 200)
  - [ ] （選填）Booking V2 關鍵頁 `/booking/[slug]`
- [ ] 帳號 owner：Wei（不存放 API key 在 repo）
- [ ] 告警 escalation owner：Wei，備援：______

---

## 最低配置建議（Soft-launch 用）

**推薦：UptimeRobot 免費方案（立即可用）**

設定步驟：
1. 到 [uptimerobot.com](https://uptimerobot.com) 建立帳號（不需信用卡）
2. Add Monitor → HTTP(s) → URL: `https://tour-platform-nine.vercel.app/api/health`
3. Friendly Name: `Midao tour-platform /api/health`
4. Monitoring Interval: 5 minutes
5. Alert Contacts → 加入 Telegram（webhook URL from Claudia/Telegram bot）
6. Repeat for root URL `/`

**後續升級路徑：** 當月流量穩定後，升級 Better Stack More plan for 1-min interval + status page。

---

## 與既有告警路徑分工

| 觸發條件 | 告警路徑 | 備注 |
|---|---|---|
| `/api/health` 連不上 | 第三方監控 → Telegram bot | 獨立於 GitHub |
| GitHub Actions health probe 失敗 | GitHub CI notification | 原有 #629 路徑 |
| Sentry error spike | Sentry alert → Email | 原有路徑 |
| 人工觸發 incident drill | 客服 SOP → #319 路徑 | 手動 |

**目標：** 三個告警路徑互補，不互相噪音。建議設定一個 Telegram 群組作為 ops 告警集中點（不要和旅客/導遊群混用）。

---

## 補充：需更新的文件

完成設定後，請更新以下文件：
- `docs/operations/synthetic-health-monitoring.md` §107-125：移除「accepted deferred risk」，填入選定的服務、endpoint、interval、alert channel
- `docs/05-business/07-operations-plan/05-emergency-contact-chain.md`：補上監控告警的 escalation contact
