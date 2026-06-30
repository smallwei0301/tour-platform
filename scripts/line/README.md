# LINE Rich Menu 套用

把「免費 LINE 通知設計」的圖文選單套到正式 LINE 官方帳號。

## 選單格子與動作（3×2，1200×810）

| 位置 | 文字 | 動作 | 為什麼 |
|---|---|---|---|
| 上左 | 我的訂單 | **文字** `我的訂單` | 觸發免費 Reply 訂單查詢 |
| 上中 | 前往付款 | **文字** `付款` | 觸發免費 Reply（未付款帶付款連結） |
| 上右 | 探索行程 | 連結 `/activities` | — |
| 下左 | 我的帳號 | 連結 `/me/profile` | 綁定／個資 |
| 下中 | 我的收藏 | 連結 `/me/wishlist` | 收藏行程一鍵回看，促回訪 |
| 下右 | 常見問題 | 連結 `/faq` | 自助解答；找不到再在 LINE 打字問客服 |

> 「聯絡客服」不另設按鈕 —— 旅客本就在 OA 聊天室，要找客服直接打字即可。

> 前兩格刻意用「文字動作」而非「連結」：使用者主動傳訊息，我們才能用**免費的 Reply** 回覆。
> 這兩個詞由 `apps/web/src/lib/line-order-query.mjs` 的 `parseOrderQueryIntent` 命中。

## 方法 A（推薦）：腳本一鍵套用

在能讀到正式 token 的環境（本機 / Vercel CLI / CI secret）執行，**token 絕不寫進 repo**：

```bash
LINE_CHANNEL_ACCESS_TOKEN=<你的 long-lived token> \
NEXT_PUBLIC_APP_URL=https://<你的網域> \
RICHMENU_REPLACE=1 \
node scripts/line/apply-rich-menu.mjs
```

- 預設圖片 `scripts/line/richmenu-midao-1200x810.png`（已壓到 <1MB、符合 LINE 規格）。要換圖就把路徑當第一個參數傳入。
- `RICHMENU_REPLACE=1`：先刪掉帳號上既有 rich menu 再建立（避免堆積）；不想刪舊的就拿掉這行。
- 腳本會：建立 rich menu → 上傳圖片 → 設為所有使用者預設。完成後回 `richMenuId`。

前置：`LINE_MESSAGING_ENABLED=1`、webhook 已指向 `/api/line/webhook` 且關閉 OA 自動回覆（見 `docs/operations/line-free-notification-setup-guide.md`）。

## 方法 B：LINE Official Account Manager 手動上傳

1. [manager.line.biz](https://manager.line.biz/) → 圖文選單 → 建立 → 版型選 **3×2 六格**。
2. 上傳 `richmenu-midao-1200x810.png`。
3. 逐格設動作：上左＝文字`我的訂單`、上中＝文字`付款`、上右＝連結`/activities`、下左＝連結`/me/profile`、下中＝連結`/me/wishlist`、下右＝連結`/faq`。
4. 設為預設並發布。

## 驗證

在 LINE 重新進入 OA → 點「我的訂單」→ 應收到 Flex 訂單卡片。OA 後台「訊息則數」用量**不應增加**（走的是免費 Reply）。
