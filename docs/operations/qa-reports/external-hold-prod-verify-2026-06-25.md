# 外部佔位防超賣 — Production 真人帳號手動驗收報告

- **功能 / PR**：導遊外部佔位防超賣（PR #1494，已 squash-merge 進 main）
- **驗收環境**：Production — `https://tour-platform-nine.vercel.app`
- **部署 / commit SHA**：`1b432913ec6b817911beee8dc7f4ea90afe2c89b`（`/api/health` version 欄位實測值）
- **資料庫**：Supabase project `pyoderxmpeyqjwkeliiu`（migration `20260624140000_external_hold_source_and_rpc.sql` 已套用）
- **驗收時間**：2026-06-25 11:44 (Asia/Taipei)
- **驗收方式**：以真實導遊帳號（測試帳號，下稱 `and***@gmail.com`）登入 production，對其自有場次跑完整「登記 → 驗證 → 超賣 → 釋放」流程，逐步擷取 API 實測證據
- **判定**：**PASS ✅**

---

## 測試對象

- 場次：「高雄柴山探洞體驗｜跟著 Andy Lee 走進城市邊緣的地形秘境」（`schedule_id=6478b419…`）
- 初始狀態：`booked 7 / capacity 8`、外部佔位 `0`、status `open`、剩餘名額 `1`

## 逐條驗證

| # | 驗證項目 | 操作 | 實測結果 | 判定 |
|---|---|---|---|---|
| 1 | 導遊登入（含 CSRF double-submit）| `GET /api/guide/auth/csrf` → `POST /api/guide/auth/session`（email + 密碼）| HTTP 200，取得 `guide_token` / `tp_csrf` session | ✅ |
| 2 | 讀取場次列表 | `GET /api/guide/schedules` | HTTP 200，共 50 筆；目標場次 `booked 7/8`、externalHold `0` | ✅ |
| 3 | **登記外部佔位 1 位 → 名額同步上升** | `POST /api/guide/schedules/{id}/external-holds {participants:1}` | HTTP 201 `{bookedCount:8, remaining:0}`；複查 `booked 8/8`、externalHold `1` | ✅ |
| 4 | **超賣防護** | 對已額滿場次再 `POST {participants:1}` | HTTP 409 `SCHEDULE_NOT_OPEN`「此場次目前未開放（可能已額滿或關閉）」 | ✅ |
| 4b | **非法人數防呆** | `POST {participants:0}` | HTTP 400 `INVALID_COUNT`「外部佔位人數需至少 1 人」 | ✅ |
| 5 | **釋放外部佔位 → 名額還原** | `DELETE /api/guide/schedules/{id}/external-holds/{holdId}` | HTTP 200 `{released:true}`；複查 `booked 7/8`、externalHold `0` | ✅ |

### 關鍵觀察

- 目標場次剛好只剩 1 位，登記後 `booked` 達 `8/8`，**auto-full trigger** 自動把 status 轉為「已額滿」；因此第 4 步超賣請求直接吃到 409 `SCHEDULE_NOT_OPEN` —— 一次同時驗到 **auto-full 觸發** 與 **超賣防護** 兩道防線。
- 外部佔位走的是與線上付款回調相同的 `fn_book_schedule` / `fn_cancel_booking`（`FOR UPDATE` 行鎖），與 web/line/admin_pos 共用同一個 `activity_schedules.booked_count` 池。
- 對 production 的庫存改動為 `7 → 8 → 7`，**淨值為零、測試後已完整復原**，未殘留任何外部佔位（`external_hold` booking 已 cancelled）。

## 補充說明（驗證限制）

- **真實瀏覽器 UI（production）**：嘗試以 Playwright 直連 production 失敗 —— sandbox egress proxy 與 bundled Chromium 的 CONNECT 隧道不相容（`net::ERR_CONNECTION_CLOSED`，非憑證問題；同一 proxy 下 curl / Node fetch 皆正常）。故 production 此輪以**真實帳號 authenticated API 端到端**驗證。
- **前端 UI 渲染／互動**：已於本機 `next dev` 以 Playwright 驗過（`e2e/external-hold-guide.spec.ts`，登記後顯示 `🔒 N 人`、釋放回復），**2/2 綠**。
- 後端單元 + 契約測試（`external-hold-rule.test.mjs` / `external-hold-contract.test.mjs`）**15/15 綠**；CI（test / smoke / scan / schema-drift / migration-contract / Vercel）全綠。

## 結論

外部佔位防超賣功能在 production 真實環境、真實導遊帳號下，**登記扣位、跨通路名額同步、超賣與非法輸入防護、釋放還原**皆符合預期，判定 **PASS ✅**。

---

> 本報告不含任何密鑰 / cookie / token / service-role key / 完整付款 payload；導遊 email 已遮蔽。
