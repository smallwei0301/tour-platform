# Tour Platform MVP User Flows

> 給 Tracy / 工程 / 營運對齊用。每一條流程都要能對應到頁面、狀態、資料表。
> 更新日期：2026-03-27

---

## Flow 1：旅客瀏覽 → 下單 → 付款 → 訂單成立

### 目標
讓旅客可以不靠人工，在站上完成一次有效下單。

### 角色
- 旅客
- 系統
- 導遊

### 主流程
1. 旅客進入首頁或活動列表頁
2. 旅客篩選活動、查看活動詳情
3. 旅客選擇日期與人數
4. 旅客填寫聯絡資料
5. 旅客閱讀退款政策並勾選同意
6. 旅客進入 ECPay 完成付款
7. 系統建立訂單，狀態為 `paid`
8. 系統寄送付款成功通知給旅客與導遊
9. 導遊在後台查看待確認訂單

### 例外情況
- 付款失敗 → 訂單停留 `pending_payment` 或不成立
- 場次額滿 → 不可進入付款
- 資料缺漏 → 不可送出

### 涉及頁面
- `/`
- `/activities`
- `/activities/[id]`
- `/booking/[activityId]`
- `/orders/[id]`

### 涉及狀態
- `pending_payment`
- `paid`

---

## Flow 2：導遊先開場次 → 旅客選日期 → 付款成功後即時占位

### 目標
讓旅客只能預約導遊已開放的日期，並在付款成功後即時反映名額。

### 角色
- 導遊
- 旅客
- 系統
- Admin

### 主流程
1. 導遊在後台建立活動
2. 導遊先建立可預約場次，例如 4/1、4/3
3. 每個場次設定容量，例如 10 人
4. 前台活動頁只顯示已開放且未滿額的日期
5. 旅客選擇 4/1 並完成付款
6. 系統建立訂單並將該場次 `booked_count` 即時增加
7. 前台顯示名額從 `0/10` 變成 `1/10`
8. 若場次滿額，系統自動將該場次標記為 `full` 或停止預約

### 例外情況
- 名額不足 → 不可進入付款
- 付款失敗 → 不占用名額
- 導遊臨時調整場次 → Admin / 導遊人工處理
- 超賣或改期 → Admin 人工介入修正

### 涉及頁面
- `/guide/dashboard/activities`
- `/guide/dashboard/schedules`
- `/activities/[id]`
- `/booking/[activityId]`
- `/admin/orders`

### 涉及狀態
- 場次：`open` / `full` / `cancelled`
- 訂單：`pending_payment` / `paid` / `confirmed` / `refund_pending` / `refunded`

---

## Flow 3：旅客取消 → 退款申請 → 平台處理

### 目標
降低退款糾紛，讓客服可以有規則可循。

### 角色
- 旅客
- 系統
- Admin / 客服

### 主流程
1. 旅客到 `/orders/[id]` 查看訂單
2. 旅客點擊「申請取消 / 退款」
3. 系統要求旅客選擇原因並送出
4. 系統建立退款申請，退款狀態設為 `requested`
5. Admin 查看申請
6. 若符合規則，改為 `approved`
7. Admin 執行退款，狀態改為 `processing`
8. 退款完成後改為 `refunded`
9. 系統寄送退款通知

### 例外情況
- 不符合退款條件 → `rejected`
- 已完成活動不可走一般退款
- 導遊取消時，應由平台主動建立退款流程

### 涉及頁面
- `/orders`
- `/orders/[id]`
- `/admin/refunds`

### 涉及狀態
- 訂單：`cancelled_by_user` / `cancelled_by_guide`
- 退款：`requested` → `reviewing` → `approved` → `processing` → `refunded`

---

## Flow 4：導遊申請 → KYC → 審核通過 → 可上架

### 目標
讓平台能安全地擴充供給端。

### 角色
- 導遊申請者
- 系統
- Admin

### 主流程
1. 導遊進入 `/guide/apply`
2. 填寫基本資料、自介、專長地區、語言
3. 上傳個人照片、身份文件、銀行資料
4. 系統建立導遊申請，狀態 `pending`
5. Admin 審核文件
6. 通過後狀態改為 `approved`
7. 系統寄送通知，導遊可登入後台建立活動

### 例外情況
- 文件不足 → `rejected`，要求補件
- 資料造假 → `suspended` 或永久拒絕

### 涉及頁面
- `/guide/apply`
- `/admin/guides`
- `/guide/dashboard`

### 涉及狀態
- `pending`
- `approved`
- `rejected`
- `suspended`

---

## Flow 5：導遊建立活動 → 開放場次 → 開始接單

### 目標
讓導遊可以持續新增可交易供給。

### 角色
- 導遊
- 系統

### 主流程
1. 導遊登入後台
2. 建立活動：標題、描述、價格、地區、主題、圖片
3. 設定人數上限
4. 建立可預約日期 / 場次
5. 送出後由系統儲存
6. 活動顯示於前台（若已通過基本審核）

### 例外情況
- 必填欄位未完成 → 不可發布
- 沒有可售場次 → 前台不可預約

### 涉及頁面
- `/guide/dashboard/activities`
- `/guide/dashboard/schedules`
- `/activities`

### 涉及資料
- activities
- activity_schedules

---

## Flow 6：活動完成 → 可評價

### 目標
建立最小信任閉環。

### 角色
- 系統
- 旅客

### 主流程
1. 活動日期結束後，Admin 或系統將訂單改為 `completed`
2. 系統寄送評價邀請信
3. 旅客進入訂單頁留下星等與評論
4. 評價顯示於活動頁與導遊頁
5. 標記為已驗證訂單評論

### 例外情況
- 未完成訂單不可評論
- 每筆訂單只能評論一次

### 涉及頁面
- `/orders/[id]`
- `/activities/[id]`
- `/guides/[id]`

### 涉及狀態
- `completed`

---

## Flow 7：Admin 最小營運流

### 目標
確保 MVP 可以被人工營運撐住。

### Admin 每日要能做的事
1. 審核新導遊申請
2. 查看待處理訂單
3. 處理導遊拒單造成的退款
4. 處理旅客退款申請
5. 標記活動完成
6. 停用異常導遊

### 必備後台頁面
- `/admin/guides`
- `/admin/orders`
- `/admin/refunds`

---

## Tracy / 工程實作提醒

### 第一優先
- Flow 1：下單付款
- Flow 4：導遊申請審核
- Flow 5：導遊上架活動
- Flow 2：導遊接單
- Flow 3：退款處理

### 第二優先
- Flow 6：評價
- Flow 7：Admin 優化

### 原則
如果某個頁面很漂亮，但不支持以上流程，優先順序就不夠高。
