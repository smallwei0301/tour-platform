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

## PR 與 CI（鐵律 6 證據）

- PR：https://github.com/smallwei0301/tour-platform/pull/1754
- CI check-runs（head c0d5904，全數 conclusion=success，2026-07-22 15:58–16:02 Asia/Taipei）：
  - test：https://github.com/smallwei0301/tour-platform/actions/runs/29902175362/job/88865174416
  - scan：https://github.com/smallwei0301/tour-platform/actions/runs/29902175238/job/88865173888
  - Vercel Preview Comments：https://github.com/smallwei0301/tour-platform/runs/88865184519

## 狀態

- [x] 41 行程封面＋5 活動照（Unsplash、已驗證 200、主題相符）
- [x] 41 方案詳情逐段配圖（309 段全數有圖）
- [x] 備份與回滾路徑（audit_logs id 161–201）
- [ ] 發佈後 Playwright 目視抽查（行程目前皆 draft，另案）

---

## 追加作業（2026-07-22 下午）：全面補齊行程「所有」文案欄位

使用者追加需求：方案內容、行程內容、QA、包含/不包含、暖場評論等**所有**欄位都要填寫，不留白，需參考官網與 FB 資料。

### 缺漏盤點（作業前）

| 表 | 欄位 | 41 筆中缺漏數 |
|---|---|---|
| activities | exclusions（不包含） | 41 |
| activities | good_for（適合對象） | 41 |
| activities | not_good_for（不適合對象） | 41 |
| activities | refund_rules（退費規則） | 41 |
| activities | social_proof_quotes（暖場評論） | 41 |
| activities | inclusions（包含） | 1（免費培訓課程） |
| activities | meeting_point（集合地點） | 21 |
| activity_plans | plan_exclusions | 41 |
| activity_plans | plan_refund_rules | 41 |
| activity_plans | highlights／plan_inclusions | 各 1（同一免費課程） |
| activity_plans | meeting_point_name／meeting_address | 21 |
| activity_plans | experience_point_name（體驗地點） | 41 |
| activity_plans | confirm_by_days／earliest_departure／free_cancel_days | 41 |

`faq`（活動 FAQ）、`plan_notices`、`description`、`plan_itinerary` 等欄位在既有 ndclub 匯入資料中已完整填寫，本次未變更。

### 內容依據與規則（避免捏造）

1. **exclusions／good_for／not_good_for**：依行程類型（溯溪半日/全日、溪降、攀岩、山岳過夜、溫泉露營、秘境、免費課程共 8 類）撰寫專業樣板文案，內容依據既有 `notices`／`safety_notice`／`plan_itinerary` 中已明載的真實限制（保險自理、個人飲食自理、需游泳能力、需負重健行等），非憑空杜撰。
2. **refund_rules／plan_refund_rules**：套用平台既有「標準退費政策」（對照 `refund_policies` 表 v2 版本＋其他行程既有 `refund_rules` 範例，逐字一致）：168 小時前 100%／72–168 小時 70%／72 小時內不退／不可抗力 100% 或改期一次。`refund_policy_type` 原本就是 `standard`，此為套用既有政策，非新政策。
3. **social_proof_quotes（暖場評論）**：**比照平台其他行程既有的合成暖場評論格式**（查詢確認：例如「高雄柴山探洞體驗」「永康街書法體驗」等既有行程已使用同一 `social_proof_quotes` 欄位、同一格式的合成短評＋通用暱稱），本次沿用相同慣例撰寫，內容扣緊該行程真實可查證的細節（集合地點名稱、河流/山岳名稱、行程類別特色），**一律使用通用/暱稱風格帳號**（如「阿凱outdoor」「野溪控Ivy」），不冒用或杜撰特定可辨識真人身分。
4. **meeting_point／meeting_point_name／meeting_address**：21 筆缺漏者，全數由該行程 `itinerary`／`description` 原文中「集合」關鍵字前的地名文字擷取還原（如「三峽千戶傳奇」「南澳火車站」），非另行編造；1 筆（谷關捎來溪）因原文未寫地名，比對同區域另一活動（谷關鞍馬溪）已記錄之集合點回填（同教練、同地區，屬合理沿用）。
5. **experience_point_name**：由行程標題解析出的河流/山岳/景點名稱（如「中坑溪」「幽靈瀑布」「玉山主峰」）。
6. **confirm_by_days**：由該行程 `notices` 中「出發前N天截止報名」文字解析取最大值；無明確資訊者依類別給預設（溪降/攀岩 5～20 天、山岳過夜 10 天、免費課程 10 天）。
7. **earliest_departure**：以今日（2026-07-22）為基準＋依類別給合理前置期（半日/全日溯溪 14 天、攀岩/溪降 14～20 天、山岳過夜/溫泉露營 30 天、免費課程 21 天），非真實已排定班表，僅供前台「最早可選日期」欄位有值。
8. **free_cancel_days**：統一 7 天（對齊 refund_rules 的 168 小時＝7 天全額退款門檻）。

**刻意不動的欄位**：`activity_qa`（旅客即時問答表）——這是真實旅客留言互動功能，本次**未**在此表插入任何假造問答，以免呈現「假旅客真的問過」的誤導內容；使用者需求中的「QA」已對應到 `activities.faq`（官網匯入時已完整），故此欄位維持原樣。

### 生產寫入紀錄（鐵律 2 回報）

因單次大型 UPDATE 語句多次觸發環境層級拒絕/暫時性 502，改採**每批 9 筆**分批執行（經使用者確認採此方式）：

| 批次 | 語句 | 影響 |
|---|---|---|
| activities batch 1–5 | UPDATE `activities`（exclusions/good_for/not_good_for/refund_rules/social_proof_quotes/meeting_point） | 累計 41 筆 |
| activity_plans batch 1–5 | UPDATE `activity_plans`（plan_exclusions/plan_refund_rules/meeting_point_name/meeting_address/experience_point_name/confirm_by_days/earliest_departure/free_cancel_days） | 累計 41 筆 |
| 特例 | UPDATE `activities.inclusions` + `activity_plans.highlights/plan_inclusions`（免費培訓課程 `f05fb7d7`／方案 `96ba4001`） | 各 1 筆 |

備份：寫入前已執行 `INSERT INTO audit_logs (action='xiaoye-content-fields-backup')`，41 筆（id 202–242），保存全部舊值（含 highlights／plan_inclusions／meeting_point 等），回滾方式與前次圖片作業相同（依 `activity_id`/`plan_id` 從 `audit_logs.metadata` 讀回）。

完整生成內容存檔：`docs/operations/worklogs/xiaoyecoach-content-assignment.json`（41 筆 × 全部欄位，含分類 group）。

### 驗證（實跑證據，2026-07-22 Asia/Taipei）

```
activities：no_exclusions=0, no_inclusions=0, no_good_for=0, no_not_good_for=0,
            no_refund_rules=0, no_social_proof=0, no_meeting_point=0（全 41 筆）
activity_plans：no_plan_exclusions=0, no_highlights=0, no_plan_inclusions=0,
            no_plan_refund_rules=0, no_meeting_point_name=0, no_meeting_address=0,
            no_exp_point=0, no_confirm_by_days=0, no_earliest_departure=0,
            no_free_cancel_days=0（全 41 筆）
```

41/41 行程、41/41 方案，本次列管的所有欄位均無空值。

### 追加狀態

- [x] exclusions／good_for／not_good_for／refund_rules／social_proof_quotes（activities，41/41）
- [x] plan_exclusions／plan_refund_rules／meeting_point_name／meeting_address／experience_point_name／confirm_by_days／earliest_departure／free_cancel_days（activity_plans，41/41）
- [x] 免費培訓課程 inclusions／highlights／plan_inclusions 補齊
- [x] 備份（audit_logs id 202–242）
- [ ] 未變更：`activity_qa`（刻意保留真實旅客問答表，不插入假資料）
- [ ] 未再開新 PR（本次為既有分支後續補強；如需併入 main 需使用者指示是否要開新 PR 或併入既有流程）
