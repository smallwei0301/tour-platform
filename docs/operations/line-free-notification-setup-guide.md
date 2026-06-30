# LINE 免費通知設定教學（operator 一步步操作）

> 對象：負責正式環境設定的 operator。本文件教你**在 LINE 免費額度內**完成通知。
> 對應實作：PR #920（LINE 全鏈路）＋ 本輪「免費 LINE 訂單查詢（Reply pull）」。
> 安全：所有 token / secret 只存 Vercel 環境變數，**永遠不要**貼進 issue／PR／截圖／聊天室。

---

## 0. 先懂原理（決定怎麼設定的關鍵）

LINE 官方帳號（Messaging API）的計費**只看「主動推播」**：

| 訊息類型 | 計費？ |
|---|---|
| **Push API**（伺服器主動推給個人）、群發、分眾 | 💰 **計費**（免費方案每月 200 則） |
| **Reply API**（使用者先傳訊息→我們回覆）、歡迎訊息、自動回應、1 對 1 聊天 | ✅ **免費、不限量** |

> 計費單位是「**收訊人數**」；一個 Push 請求裡塞幾個泡泡不影響則數。

**本平台的免費策略**：
- **主動通知**（建單、未付款、出發前提醒）→ 走 **Email + Telegram**（兩者皆免費），**不用 LINE Push**。
- **LINE 只做免費的事**：
  1. **LIFF 視覺化預約入口**（不發訊息，0 成本）。
  2. **訂單查詢 pull**：旅客在 OA 傳「我的訂單／付款」→ 我們用 **Reply API 免費**回覆最新訂單狀態＋付款連結。
  3. **綁定碼兌換、歡迎訊息、1 對 1 客服**（皆免費）。

只要**不開** `LINE_PUSH_ENABLED` / `LINE_GUIDE_PUSH_ENABLED`，LINE 用量永遠是 0 則 → 永久免費。

---

## Step 1 — 建立 LINE 官方帳號 + Messaging API channel

1. 用公司 LINE 帳號登入 **LINE Developers Console**：<https://developers.line.biz/console/>
2. 建立（或選擇）一個 **Provider**（例如「Midao 祕島」）。
3. 在該 Provider 下 **Create a new channel → Messaging API**。
4. 填寫官方帳號名稱、類別、地區（台灣）等基本資料並建立。
5. 建立後會同時得到一個 **LINE 官方帳號（OA）**；之後旅客就是加這個 OA 為好友。

> 若你已用「LINE 官方帳號管理後台（manager.line.biz）」建好 OA，可在 Console 將它與 Messaging API channel 連動，不必重建。

---

## Step 2 — 取得 Channel access token 與 secret

在 Messaging API channel 頁面：

1. **Basic settings** 分頁 → 記下 **Channel secret** → 之後填 `LINE_CHANNEL_SECRET`。
2. **Messaging API** 分頁 → 最下方 **Channel access token (long-lived)** → 點 **Issue** 產生長期 token → 之後填 `LINE_CHANNEL_ACCESS_TOKEN`。
3. 同分頁記下官方帳號的 **Bot basic ID**（形如 `@midao`）→ 之後填 `LINE_BOT_BASIC_ID`（綁定深連結用）。

> token / secret 是機密：直接貼進 Vercel，**不要**寫在文件、訊息或截圖裡。

---

## Step 3 — 設定 webhook 與關閉自動回覆

在 **Messaging API** 分頁：

1. **Webhook URL** 填：`https://<你的正式網域>/api/line/webhook`
2. 開啟 **Use webhook**。
3. 點 **Verify** 測試（部署完成後做；應回 200）。
4. **LINE Official Account features** 區塊：
   - **Auto-reply messages**：關閉（否則會蓋掉我們的 Reply）。
   - **Greeting messages**：可開（歡迎訊息免費），建議放一句引導，例如「輸入『我的訂單』即可查詢訂單與付款 🧾」。

---

## Step 4 —（選配）開 LIFF 視覺化預約入口

只有要在 LINE 內提供「視覺化預約頁」才需要；**不影響**訂單查詢與通知。

1. 在同一 Provider **Create a new channel → LINE Login**。
2. 記下 **Channel ID** → 填 `LINE_LOGIN_CHANNEL_ID`（idToken `aud` 驗證用）。
3. 在 LINE Login channel 的 **LIFF** 分頁 **Add** 一個 LIFF app：
   - **Endpoint URL**：`https://<你的正式網域>/booking/line`
   - **Size**：Full
   - 取得 **LIFF ID**（形如 `1234567890-abcdEFGh`）→ 填 `NEXT_PUBLIC_LIFF_ID`。

---

## Step 5 — 建立 Rich Menu「我的訂單／前往付款」（讓免費查詢更好按）

旅客點選單按鈕 → 自動送出「我的訂單」文字 → webhook 用 **Reply 免費**回覆訂單卡片。

在 **LINE Official Account Manager**（<https://manager.line.biz/>）：

1. 左側 **主頁 → 圖文選單（Rich menu）→ 建立**。
2. **版型**：選一個有按鈕格子的版型（例如 2×1 或 2×3）。
3. **背景圖片**：上傳你的選單圖（尺寸需求見下方；可用文末提示詞請 AI 生成）。
4. 為「我的訂單」「前往付款」這兩格各設定 **動作 = 文字**：
   - 「我的訂單」格 → 動作文字填 **`我的訂單`**
   - 「前往付款」格 → 動作文字填 **`付款`**
   （這兩個詞都會被 `parseOrderQueryIntent` 命中，觸發免費 Reply 查詢。）
5. 其他格可放「探索行程」（動作 = 連結 `https://<網域>/activities`）、「我的帳號」（連結 `https://<網域>/me/profile`）。
6. 設為**預設顯示**並發布。

> 動作用「文字」而非「連結」，是因為要讓使用者主動傳訊息 → 才能用免費的 Reply 回覆。

---

## Step 6 — 在 Vercel 設定環境變數

到 Vercel 專案 **Settings → Environment Variables**（Production），新增：

| 變數 | 值 | 必要性 |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | Step 2 的 long-lived token | ✅ 必填 |
| `LINE_CHANNEL_SECRET` | Step 2 的 channel secret | ✅ 必填 |
| `LINE_BOT_BASIC_ID` | `@midao` | 建議 |
| `NEXT_PUBLIC_APP_URL` | `https://<你的正式網域>` | ✅ 必填（訂單查詢的連結用此組絕對網址） |
| `LINE_LOGIN_CHANNEL_ID` | Step 4 | 開 LIFF 才需要 |
| `NEXT_PUBLIC_LIFF_ID` | Step 4 | 開 LIFF 才需要 |
| `LINE_OPS_GROUP_ID` | ops 群組 ID | 要推管理群 ops 才需要 |

> 改完環境變數要 **redeploy** 才生效。`startup-env` 會在 production build 檢查 LINE secret 的強度（太短／預設值會擋）。

---

## Step 7 — 分階段開旗標（保持省錢的開法）

旗標預設全 `0`（OFF）。**推薦的免費開法**只開前兩項：

```
LINE_MESSAGING_ENABLED=1        # 開啟 Messaging API（Reply 才會真的送出）
NEXT_PUBLIC_LINE_LIFF_ENABLED=1 # （選配）開 LIFF 視覺化預約入口

# 以下保持 0 → 不產生任何計費 Push，主動通知交給 Email/Telegram：
LINE_PUSH_ENABLED=0
LINE_GUIDE_PUSH_ENABLED=0
```

- `LINE_MESSAGING_ENABLED=1` 是 Reply 能送出的前提；**Reply 免費**，開了也不耗那 200 則。
- 想恢復「LINE 也主動推播事件」時才把 `LINE_PUSH_ENABLED` 開起來（會開始吃額度），詳見 `issue-179-line-liff-rollout-support-sop.md` 的 L0–L3 分階段。

---

## Step 8 — 驗證（不需動到正式付款）

1. 用測試手機加 OA 好友 → 應收到 greeting（若有設）。
2. **綁定**：到網站 `/me/profile` 產生一次性碼 `TBIND-XXXXXX`，在 OA 把碼傳給 bot → 應收到「✅ 已完成 LINE 通知綁定」。
3. **查詢**：在 OA 傳「我的訂單」（或點 Rich Menu）→ 應收到 Flex 卡片：
   - 有訂單 → 顯示行程、日期、人數、狀態、金額、訂單編號；**未付款**者帶「前往付款」按鈕（連到 `/me/orders`）。
   - 未綁定 → 收到「尚未綁定」卡片 + 前往綁定按鈕。
   - 查無訂單 → 收到「查無訂單」卡片 + 探索行程按鈕。
4. 觀察 LINE OA 後台的「訊息則數」用量應**不增加**（因為走的是 Reply）。

---

## 旅客綁定：做法與 Google 登入注意事項

LINE 只給匿名的 `lineUserId`，要對應到「哪位旅客／哪些訂單」必須有一次身分連結。

> ⚠️ **本站登入為 Google-only。訂單的權威鍵是 `user_id`**（`contact_email` 是結帳自填、未必等於 Google 或 LINE 信箱）。所以**綁到 `user_id` 才最可靠**；只靠 LINE 信箱（email）綁定有兩個風險：(1) LINE 信箱常 ≠ Google 帳號信箱、或 LINE 帳號根本沒 email；(2) Google OAuth 在 LINE 內建瀏覽器可能被擋（`disallowed_useragent`）。因此**「綁定碼／深連結」是最穩的主路徑**。

- **A. 深連結（推薦、最穩；已內建，設個 env 即生效）**：在 Vercel 設 `LINE_BOT_BASIC_ID=@你的ID` 後，旅客在**自己平常的瀏覽器（已用 Google 登入）**開 `/me/profile`，綁定按鈕會產生 `line.me/R/oaMessage/<id>/?<綁定碼>` —— 點一下自動打開 LINE、帶入綁定碼，按送出即綁定。**綁定碼在登入狀態下產生，綁的是 `user_id`，最可靠**。
- **B. LIFF 一鍵綁定（在 LINE 對話內）**：未綁定者按「我的訂單／付款」時，Reply 卡片首選「一鍵綁定」→ 開 `/line/bind`（LIFF）。本頁**優先綁 `user_id`**（先讀平台 session；webview 內已登入才拿得到），拿不到才退回用 idToken 內 email 綁定（僅對「LINE 信箱＝訂單聯絡信箱」的訪客有效）。需要 Step 4 的 LINE Login channel + LIFF，並在 LINE Login channel **開啟 email 權限**（OpenID `email` scope）。卡片同時保留「改用綁定碼」退路；綁完查不到訂單時，提示改用綁定碼。

> 兩條路徑都收斂到同一筆 `line_user_id ↔ 旅客` 對應。**運營建議**：把「綁定 LINE」入口放在網站（`/me/profile`、下單完成頁），讓旅客在已登入的正常瀏覽器完成深連結綁定，避開 webview 的 Google 登入限制。實作：`app/line/bind/*`、`/api/line/auth/verify`、`src/lib/line-order-query.mjs`。

> ✅ **已修（webview Google 封鎖）**：實測在 LINE 內按綁定會出現 `403 disallowed_useragent`（Google 禁止 webview 內 OAuth）。修法：未綁定卡片的綁定碼連結（`/me/profile`）與 Rich Menu 需登入的連結（`/me/wishlist`）一律加 **`openExternalBrowser=1`**，讓 LINE 用系統瀏覽器（Chrome/Safari）開啟 —— 旅客在那已有 Google session，登入正常。LIFF 一鍵綁定（`/line/bind`）需在 LINE 內執行故不外開，且只在 `NEXT_PUBLIC_LINE_LIFF_ENABLED=1` 時才出現在卡片上（LIFF 關閉時卡片只給可靠的綁定碼路徑）。

## 額度與省錢提醒

- **免費方案 200 則/月**只在你開 `LINE_PUSH_ENABLED` 後才會被消耗；本教學的開法不消耗。
- 若未來要用 LINE 推「出發前提醒」這類最有價值的主動通知，只推給「已綁定 + 即將出團」者，並評估是否超過 200 則 → 超過再升中用量（NT$800／3,000 則）。
- 主動通知能用 Email/Telegram 解決的，就不要用計費的 LINE Push。

## Kill-switch / 緊急回退

- 立刻停掉所有 LINE 訊息（含 Reply）：`LINE_MESSAGING_ENABLED=0` → redeploy。
- 只停主動推播、保留免費查詢：`LINE_PUSH_ENABLED=0` / `LINE_GUIDE_PUSH_ENABLED=0`。
- 關 LIFF、回退到 query-param 入口：`NEXT_PUBLIC_LINE_LIFF_ENABLED=0`。

---

## 附錄：Rich Menu 背景圖規格

- 全尺寸：**2500 × 1686 px**（或 2500 × 843 px 的半高版）。
- 格式：PNG／JPEG，檔案 < 1 MB。
- 切格要與你在 Manager 選的版型一致（例如 2×3 = 六格）。
- 生成圖片用的 AI 提示詞見聊天回覆／README 對應段落。
