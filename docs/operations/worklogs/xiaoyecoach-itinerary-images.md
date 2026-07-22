# Worklog — 小野教練 41 個行程 Unsplash 圖片與方案詳情補齊

- 分支：`claude/xiaoyecoach-itinerary-images-n9mdwb`（無對應 GitHub issue，由使用者對話直接派工）
- 時間：2026-07-22 14:29（Asia/Taipei）
- 範圍：**純生產資料（DML）作業，未動任何程式碼／schema**。依鐵律 2 走 `execute_sql` 自動寫入＋事後回報。

## 需求

1. 小野教練（guide_profiles `047ae720-d8f1-4399-969d-5294617947b3`）的 41 個行程，每個行程 1 張封面照＋5 張活動照，使用「真實符合行程主題」的 Unsplash 圖片。
2. 方案詳情（`activity_plans.plan_itinerary`）每個段落都要有對應照片。
3. 內容參考 ndclub.com.tw 與 FB 粉專；行程與方案詳情盡可能填滿不留白。

## 內容來源查證

- `http://www.ndclub.com.tw/`：現況為 Big5 舊站，只剩聯絡資訊（公司名：自然探索工作室／自然探索俱樂部、電話 0958156618），無行程內容可抓。
- FB 分享連結（ndclub2001）：需登入，無法抓取。
- **DB 內已有先前 `ndclub-phase2` 匯入的完整官網行程文案**（41 個 activities＋41 個 plans，description/plan_itinerary 均非空白），故文字內容以既有官網匯入文案為準，本次不改寫文字、只做「段落結構化＋配圖」。

## 圖片管線（真實性保證）

1. 以 WebFetch 抓 Unsplash 搜尋頁（canyoning、river-trekking、waterfall-hike、cliff-jumping、mountain-stream、canyon-river、wild-swimming、abseiling、rock-climbing、sea-cliff、snow-mountaineering、alpine-lake、mountain-summit-sunrise、sea-of-clouds、cherry-blossom-mountain、taiwan-mountains、forest-hiking-trail、climbing-rope-harness、hot-spring-nature、camping-mountains、waterfall-swimming、turquoise-river、waterfall-canyon、rocky-creek 共 24 組查詢），取得**帶 alt 描述**的真實圖片 URL，人工依 alt 剔除不相關者（室內攀岩、橋樑、城市、水鳥等）。
2. 圖池 253 張全部以 curl 驗證 `images.unsplash.com` 回應 **HTTP 200**（0 失敗、0 重複 id）。
3. 依行程主題配方指派（溯溪 28、溪降 1、攀岩 3、山岳 7、溫泉露營 1、秘境 1）：每行程 6 張（封面＋5 活動照，封面同時為 image_urls[1]，沿用既有資料慣例）；行程內不重複，跨行程全域輪替（246 個圖位、190 張獨立圖、55 張重複使用、單張最多 3 次）。
4. 完整指派表（activity_id → 6 張 URL＋alt＋主題分類）：`docs/operations/worklogs/xiaoyecoach-unsplash-assignment.json`。

## 生產寫入紀錄（鐵律 2 回報）

專案：`pyoderxmpeyqjwkeliiu`（tour platform, prod）

| 步驟 | 語句 | 影響 |
|---|---|---|
| 1. 備份 | INSERT `audit_logs`（action=`xiaoye-unsplash-images-backup`） | 41 筆（id 161–201），保存舊 cover_image_url／image_urls／plan_itinerary／plan_itinerary_image_url |
| 2. 行程圖 | UPDATE `activities`（VALUES join） | 41 筆：cover_image_url＋image_urls（6 張）＋updated_at |
| 3. 方案詳情 | UPDATE `activity_plans`（CTE 切段） | 41 筆：plan_itinerary 由單段長文切為帶 title 的站點段落、每段配 imageUrl；plan_itinerary_image_url 空值補封面；updated_at |

切段規則：以「(空格)HH:MM／上午·下午HH:MM／第N堂／(上午場)(下午場)／（一）（二）…／第一天…／山下課程／山上課程／行前訓練」為段落界線；原文完整保留於各段 description，未刪改任何文字。

## 驗證（實跑證據）

最終驗證查詢（2026-07-22 14:2x Asia/Taipei）：

- `acts_ok = 41`：41/41 行程 cover 為 unsplash 且 image_urls 恰為 6 張。
- `plans_with_itin_img = 41`：41/41 方案 plan_itinerary_image_url 非空。
- `total_steps = 309`、`steps_with_img = 309`：**309/309 段落全部帶 Unsplash imageUrl**。
- 抽查 `dd5070b5`（三峽中坑溪）：4 段 09:00/10:00/13:00/15:00，title/description/imageUrl 結構正確。
- 前端相容性：`PlanItinerarySection.tsx` 支援 `{title, description, imageUrl}` 站點格式；`next.config.mjs` CSP 與 `images.remotePatterns` 已允許 `images.unsplash.com`（既有設定，未改動）。
- `NOT_VERIFIED-live`：未跑 Playwright 實際瀏覽器驗證（行程皆為 draft 狀態，前台不可見；發佈後建議抽 2–3 個行程頁面目視確認圖片載入）。

## 回滾方式

```sql
-- 以 audit_logs 備份還原（範例）
update activities a set
  cover_image_url = b.metadata->>'old_cover_image_url',
  image_urls = b.metadata->'old_image_urls'
from audit_logs b
where b.action='xiaoye-unsplash-images-backup'
  and (b.metadata->>'activity_id')::uuid = a.id;

update activity_plans p set
  plan_itinerary = b.metadata->'old_plan_itinerary',
  plan_itinerary_image_url = nullif(b.metadata->>'old_plan_itinerary_image_url','')
from audit_logs b
where b.action='xiaoye-unsplash-images-backup'
  and (b.metadata->>'plan_id')::uuid = p.id;
```

原 ndclub 圖檔仍留在 Supabase storage `activity-images/ndclub*`，未刪除。

## 狀態

- [x] 41 行程封面＋5 活動照（Unsplash、已驗證 200、主題相符）
- [x] 41 方案詳情逐段配圖（309 段全數有圖）
- [x] 備份與回滾路徑（audit_logs id 161–201）
- [ ] 發佈後 Playwright 目視抽查（行程目前皆 draft，另案）
