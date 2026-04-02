# ToursByLocals 網站完整解構規格書

> 資料擷取日期：2026-03-25  
> 目的：作為我們平台的 UI/UX 設計範本，完整複製架構後台灣化
> 原始網站：https://www.toursbylocals.com/

---

## 一、整體頁面架構（完整頁面區塊順序）

```
[NAVBAR]
[SECTION 1] Hero — 主視覺 + 四大賣點
[SECTION 2] Find tours in popular destinations — 熱門目的地卡片輪播
[SECTION 3] Explore popular attractions — 熱門景點卡片輪播
[SECTION 4] Featured experiences — 精選行程卡片輪播
[SECTION 5] Celebrating over 17 years — 數據信任區塊
[SECTION 6] Meet your local guides — 導遊卡片輪播
[SECTION 7] Go farther ashore — 郵輪岸遊 CTA（我們改成企業團建或類似應用）
[SECTION 8] What travellers say — 旅客評價區塊
[SECTION 9] Design your perfect safari — 主題行程 CTA（我們改成其他主題）
[SECTION 10] From the blog — 部落格文章卡片
[SECTION 11] FAQ — 常見問題手風琴
[SECTION 12] Why choose a private tour? — SEO 文字區塊
[SECTION 13] Become a guide — 導遊招募 CTA
[FOOTER] 熱門城市連結表 + 品牌資訊
```

---

## 二、NAVBAR（導航列）

### 佈局
- **左側**：Logo（img，可點擊回首頁）
- **中間**：搜尋框（Where to? 佔位符）+ 搜尋按鈕（icon）
- **右側**：漢堡選單按鈕（Open menu）

### 搜尋框行為
- 輸入框 placeholder：`Where to?`
- 右側有搜尋 icon 按鈕
- 點擊後展開搜尋 dropdown

### 台灣版調整
```
Logo：我們的品牌 LOGO
搜尋框 placeholder：「要去哪裡？」
右側：登入 / 語言切換 / 漢堡選單
```

---

## 三、SECTION 1 — Hero 區塊

### 視覺結構
```
┌─────────────────────────────────────────────────────────────┐
│  [背景大圖：三人交談、在地導覽氛圍照]                          │
│                                                              │
│  H1: Explore private tours,                                  │
│      tailored to you                                         │
│                                                              │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │
│  │🏅Expert   │ │🗺️Customizable│ │✂️Flexible    │ │📞In-   │ │
│  │local      │ │private tours │ │cancellation  │ │house   │ │
│  │guides     │ │              │ │              │ │support │ │
│  │           │ │              │ │              │ │        │ │
│  │Vetted for │ │Shape a tour  │ │Standard is   │ │Our team│ │
│  │expertise  │ │to your inter-│ │included,     │ │is ready│ │
│  │and experi-│ │ests, pace,   │ │upgrade for   │ │to help │ │
│  │ence       │ │and priorities│ │total flex.   │ │24/7    │ │
│  └──────────┘ └──────────────┘ └──────────────┘ └────────┘ │
│                                                              │
│                           [Learn more →]                     │
└─────────────────────────────────────────────────────────────┘
```

### 文案（原文）
- H1：`Explore private tours, tailored to you`
- Badge 1：`Expert local guides` / `Vetted for their expertise and experience`
- Badge 2：`Customizable private tours` / `Shape a tour to your interests, pace, and priorities`
- Badge 3：`Flexible cancellation` / `Standard is included, upgrade for total flexibility`
- Badge 4：`In-house support` / `Our team is ready to help you with 24/7 assistance`
- CTA Link：`Learn more` → `/why-choose-tours-by-locals`

### 台灣版調整
```
H1：發現屬於你的在地私人導遊體驗
Badge 1：✅ 實名認證導遊 / 每位導遊完成 KYC 實名驗證
Badge 2：🗺️ 量身訂製行程 / 依你的興趣、步調、人數設計
Badge 3：💰 退款 3 天到帳 / 申請退款，3 個工作天內到帳
Badge 4：📞 緊急熱線 30 分鐘 / 活動當天遇問題，30分鐘內回應
CTA：了解更多 → /why-choose-us
```

---

## 四、SECTION 2 — 熱門目的地輪播

### 結構
```
[Header]
  H2: Find private tours in popular destinations
  副文字: Explore cities around the world through the eyes of a local.
  [→ View all] 連結 → /tours

[卡片輪播] 水平滑動，每次顯示 4~5 張
  每張卡片包含：
  - 城市背景照（大圖）
  - 城市名稱（文字覆蓋）
  - 導遊頭像群組（3 個小圓形頭像疊加）
  - 行程數量："{數字} Tours Available"

[控制按鈕]
  ← previous（disabled 時灰色）
  → next
```

### 卡片範例資料
```
Edinburgh, United Kingdom — 255 Tours Available
Tokyo, Japan — 452 Tours Available
Hong Kong, China — 110 Tours Available
Mexico City, Mexico — 182 Tours Available
Sao Paulo, Brazil — 48 Tours Available
New York City, United States — 337 Tours Available
London, United Kingdom — 600 Tours Available
Belfast, United Kingdom — 195 Tours Available
```

### 台灣版調整
```
H2：探索台灣在地私人導遊行程
副文字：透過在地導遊的眼睛，發現台灣最真實的風景

卡片城市：
  台北 — XX 個行程
  花蓮 — XX 個行程
  台南 — XX 個行程
  台東 — XX 個行程
  高雄 — XX 個行程
  宜蘭 — XX 個行程
  墾丁 — XX 個行程
  澎湖 — XX 個行程
```

---

## 五、SECTION 3 — 熱門景點輪播

### 結構（與 Section 2 相同格式）
```
H2: Explore popular attractions
副文字: See top sights through private tours shaped around your interests.

卡片：景點名稱 + 景點圖 + 導遊頭像群組 + "{數字} Tours Available"
```

### 卡片範例
```
Stonehenge — 116 Tours Available
Grand Teton National Park — 4 Tours Available
Great Wall of China — 57 Tours Available
Teotihuacan — 24 Tours Available
Ilha Grande — 11 Tours Available
Positano — 203 Tours Available
```

### 台灣版調整
```
H2：探索台灣熱門景點
副文字：在地導遊帶你深度認識每個景點背後的故事

卡片景點：
  九份老街
  太魯閣國家公園
  阿里山
  日月潭
  墾丁國家公園
  野柳地質公園
  平溪天燈
  奮起湖
```

---

## 六、SECTION 4 — 精選行程卡片輪播

### 行程卡片結構（最重要！）
```
┌──────────────────────────────────┐
│ [❤️ 收藏按鈕 - 右上角]             │
│                                   │
│ [行程封面圖 - 大圖]                 │
│                                   │
│ [導遊頭像] Your guide: {導遊名稱}   │
├──────────────────────────────────┤
│ H3: {行程標題}                     │
│ ⭐ {評分} ({評價數})                │
│                                   │
│ 🕐 {時長}  🚶 {交通方式}  👥 {人數}  │
│                                   │
│ total / from                       │
│ $ {價格} USD                       │
└──────────────────────────────────┘
```

### 行程卡片欄位說明
| 欄位 | 說明 | 圖示 |
|------|------|------|
| 封面圖 | 行程主圖 | - |
| 收藏 | 愛心按鈕（右上角浮動）| ❤️ |
| 導遊頭像 | 小圓圖 + "Your guide: {名稱}" | - |
| 標題 | H3 行程名稱 | - |
| 評分 | ⭐ 5.0 (9) 格式 | star icon |
| 時長 | `2 hours` / `4 hours` 等 | clock-circle icon |
| 交通方式 | `Walking` / `Private transportation` | personWalking / car icon |
| 人數 | `Private tour for 1-10 people` | team icon |
| 價格類型 | `total`（固定總價）/ `from`（起始價）| - |
| 價格 | `$ 535 USD` | - |

### 精選行程範例資料
```
行程1: The Music History of Music City
  導遊: David Steele E.
  評分: 5.0 (9) | 時長: 2 hours | 交通: Walking
  人數: 1-10 | 價格: $ 535 USD (total)

行程2: Marrakech Foodie Half-day Tour
  導遊: Redouan A.
  評分: 5.0 (9) | 時長: 4 hours | 交通: Walking
  人數: 1-4 | 價格: $ 316 USD (from)

行程3: Scenic tour of the Northern Lakes from Keswick
  導遊: Anna G.
  評分: 5.0 (4) | 時長: 8 hours | 交通: Private transportation
  人數: 1-3 | 價格: $ 773 USD (total)

行程4: Bac Ha Farmers' Market Tour from Sapa
  導遊: Rua G.
  評分: 5.0 (3) | 時長: 11 hours | 交通: Private transportation
  人數: 1-10 | 價格: $ 208 USD (from)

行程5: Discover Your Irish Roots Research Trip
  導遊: Francis H.
  評分: 5.0 (3) | 時長: 8 hours | 交通: Private transportation
  人數: 1-4 | 價格: $ 877 USD (total)

行程6: Full Day Giza Pyramids with the Grand Egyptian Museum
  導遊: Mohamed H.
  評分: 5.0 (16) | 時長: 7 hours | 交通: Private transportation
  人數: 1-10 | 價格: $ 241 USD (from)

行程7: Maipo Mountain Valley, Chile
  導遊: Joaquin C.
  評分: 4.9 (21) | 時長: 9 hours | 交通: Private transportation
  人數: 1-3 | 價格: $ 621 USD (from)
```

### 台灣版欄位調整
```
價格：NT$ 代替 USD
導遊標示："您的導遊：{名稱}" 
交通：步行 / 包車 / 機車
人數：1人私人 / 2~4人小團
```

---

## 七、SECTION 5 — 品牌信任數據區塊

### 視覺結構
```
┌─────────────────────────────────────────────────┐
│  [左側：品牌照片]  │  [右側：文字+數據]           │
│                   │                              │
│                   │  H2: Celebrating over 17 years│
│                   │  副文字: of connecting people  │
│                   │          with places          │
│                   │                              │
│                   │  We connect travellers with  │
│                   │  trusted local guides who    │
│                   │  create thoughtful, private  │
│                   │  tours wherever your journey  │
│                   │  takes you                   │
│                   │                              │
│                   │  [數據三欄]                   │
│                   │  Travellers served: 3,182,003│
│                   │  Guides: 5,146               │
│                   │  Countries: 177              │
└─────────────────────────────────────────────────┘
```

### 數據欄位
```
Travellers served — 3,182,003
Guides — 5,146
Countries — 177
```

### 台灣版調整
```
H2：專注台灣在地導遊媒合
副文字：連結每一位旅人與最懂台灣的在地嚮導

數據（MVP 初期可顯示目標或實際）：
  服務旅客：0（從0開始顯示真實成長）
  合作導遊：XX 位
  涵蓋縣市：22 個
```

---

## 八、SECTION 6 — 導遊卡片輪播

### 導遊卡片結構
```
┌──────────────────────────────┐
│ [導遊大圖 - 縱長型]            │
├──────────────────────────────┤
│ {導遊名稱}                    │
│ ⭐ {評分} ★★★★★ ({評價數})    │
│ 📍 {城市}, {國家}              │
│ 🌍 {語言1}, {語言2} and more  │
│                              │
│ [❤️ 收藏按鈕]                  │
│                              │
│ [View profile {名稱}] 按鈕    │
└──────────────────────────────┘
```

### 導遊卡片欄位
| 欄位 | 說明 |
|------|------|
| 大圖 | 導遊個人照 |
| 名稱 | 導遊姓名（縮寫保護隱私，如 David B.）|
| 評分 | 數字 + 星星圖示 + (評價數) |
| 城市/國家 | 📍 Nashville, United States |
| 語言 | 🌍 English, Russian |
| 收藏按鈕 | ❤️ 右上角或卡片內 |
| CTA 按鈕 | "View profile {名稱}" |

### 範例導遊資料
```
David B. — Nashville, US — 5.0 (32) — English, Russian
Noura E. — Marrakech, Morocco — 4.9 (395) — Arabic, English, ASL
James Rushforth — Lake District, UK — 5.0 (34) — English
Rua G. — Sa Pa, Vietnam — 5.0 (19) — Vietnamese, Hmong, English
```

### 台灣版調整
```
城市：台灣各縣市
語言：中文（普通話）/ 台語 / 英語 / 日語 / 韓語
按鈕文字：「查看導遊簡介」
```

---

## 九、SECTION 7 — 特殊主題 CTA 橫幅（兩個）

### 設計 A：Go farther ashore（郵輪岸遊）
```
┌─────────────────────────────────────────────────┐
│ [左側：郵輪/岸遊背景大圖]                          │
│                                                  │
│ H6: Go farther ashore                           │
│                                                  │
│ When your cruise docks, the experience doesn't  │
│ have to follow the crowd...（3行文字）             │
│                                                  │
│ [Explore →] 按鈕 → /shore-excursions            │
└─────────────────────────────────────────────────┘
```

### 設計 B：Design your perfect safari
```
┌─────────────────────────────────────────────────┐
│ [左側：野生動物背景大圖]（暖橘/土黃色調）         │
│                                                  │
│ H6: Design your perfect safari                  │
│                                                  │
│ Set out on a journey where every turn brings    │
│ a surge of discovery...（2行文字）                │
│                                                  │
│ [Explore →] 按鈕 → /safaris                     │
└─────────────────────────────────────────────────┘
```

### 台灣版調整（替換兩個主題）
```
橫幅 A：企業員工旅遊
  標題：「為您的團隊打造難忘的旅程」
  文字：不再是無聊的員工旅遊。讓在地導遊設計一趟屬於你們的行程。
  按鈕：了解企業方案 → /enterprise

橫幅 B：親子在地探索
  標題：「和孩子一起認識台灣的故事」
  文字：適合親子的在地導覽行程，讓孩子用不同眼光看見台灣。
  按鈕：探索親子行程 → /family
```

---

## 十、SECTION 8 — 旅客評價區塊

### 結構
```
H2: What travellers say

[評價卡片] 2×2 grid 或輪播
  每張卡片：
  ┌────────────────────────────────────┐
  │ [引號開頭圖示 " ]                   │
  │                                    │
  │ {長篇評價文字，2-4行}                │
  │                                    │
  │ [5顆星 ★★★★★]                       │
  │ {旅客姓名}                          │
  │ traveller                          │
  │                                    │
  │ [連結到行程：{行程名稱}]              │
  └────────────────────────────────────┘
```

### 四則評價範例
```
評價 1：
  "If you want to truly understand the history of Florence...Sinisa added some 
  special photo opportunities along the way...We had a meaningful and memorable time."
  — Liz B., traveller
  行程：Florence Full Day in a Private Tour

評價 2：
  "Best tour that we have EVER had! We covered so many things from city highlights 
  to the cultural beginnings of Brazil...By the end it became more like seeing the 
  city with a great friend than a tour guide."
  — Anthony L W., traveller
  行程：Highlights of Rio Private Tour

評價 3：
  "Great tour with fantastic guide. We were able to customize the tour to our 
  interests, got an early start to beat the crowds...Eunji is a wonderful guide, 
  interesting and knowledgeable, with a great sense of humor."
  — Joe M., traveller
  行程：Tokyo Foodie Tour - Full Day Private Tour

評價 4：
  "The highlight of our trip to Greece for sure! Panos was so knowledgeable and 
  personable - it felt like we were walking around with a longtime friend."
  — Raghu N., traveller
  行程：Gods and Heroes of Ancient Greece Half Day Tour
```

---

## 十一、SECTION 10 — 部落格文章卡片

### 結構
```
H2: From the blog

[文章卡片] 橫向排列（3-4 張）
  每張卡片：
  ┌──────────────────────────┐
  │ [文章封面圖]               │
  ├──────────────────────────┤
  │ H6: {文章標題}             │
  │ {文章開頭 2 行摘要}         │
  │ {發布日期}                 │
  └──────────────────────────┘
```

### 文章範例
```
文章1：How to navigate the world's biggest cities, with a local perspective
  → Mar 20 2026

文章2：Beyond the Games: Five Day Trips That Deepen a Journey to Milan
  → Feb 06 2026

文章3：Making the Most of a British Isles Cruise, Port by Port
  → Jan 20 2026

文章4：Planning shore excursions: why the best cruise moments happen off ship
  → Jan 16 2026
```

### 台灣版調整
```
文章主題範例：
  - 台灣東部自由行，找導遊 vs 自己玩的差別
  - 花蓮太魯閣，在地導遊帶你走的路線和觀光客完全不同
  - 帶爸媽出遊，這樣找導遊最省心
  - 外國人在台灣：為什麼英語導遊比 App 更值得
```

---

## 十二、SECTION 11 — FAQ 手風琴

### 結構
```
H2: Frequently Asked Questions

[手風琴列表] 點擊展開/收合
  每個問題：
  ┌──────────────────────────────────────[+/-]┐
  │ {問題文字}                                  │
  └────────────────────────────────────────────┘
  
  展開時顯示：
  ┌────────────────────────────────────────────┐
  │ {答案文字，可多段落}                          │
  └────────────────────────────────────────────┘
```

### 完整 FAQ 列表（原文）

**Q1：What's the difference between a private and a group tour?**（預設展開）
> The easiest way to explain it is there are no strangers on a private tour! It's just you, whoever you are traveling with, and the guide you've chosen. If you're traveling solo, this means it's just you and the guide. Booking a private tour gives you the freedom to explore exactly the way you want, without the friction of big groups, rushed schedules, or canned commentary.
> 
> All of the tours on ToursByLocals are private. We'll never join groups together, so the tours always remain personalised to you, your pace, and your interests.

**Q2：Can I customize a tour?**（摺疊）

**Q3：Do you vet the guides on the platform?**（摺疊）

**Q4：What's your cancellation policy?**（摺疊）

**Q5：Do you sell shore excursions?**（摺疊）

**Q6：Do your tours come with transportation?**（摺疊）

**Q7：How far in advance should I book?**（摺疊）

### 台灣版 FAQ
```
Q1：私人導遊行程和一般跟團有什麼不同？
Q2：我可以客製化行程內容嗎？
Q3：導遊都有經過審核嗎？
Q4：如何申請退款？幾天會到帳？
Q5：付款支援哪些方式？
Q6：導遊有提供交通嗎？
Q7：需要提前多久預約？
Q8：如果導遊臨時取消怎麼辦？
```

---

## 十三、SECTION 12 — SEO 文字區塊

### 結構
```
H2: Why choose a private tour?

[長篇文字說明，4段落]

[Find your private tour] 按鈕（主要 CTA）→ 連到行程列表
```

### 原文內容
> Booking a private tour gives you the freedom to explore exactly the way you want, without the stress of big groups, rushed schedules, or scripted commentary. Whether it's a sightseeing tour through a historic neighbourhood or a guided food tour rooted in local culture, the experience unfolds at your rhythm, with room for questions, stories, and real conversation.
> 
> With a private tour, you explore alongside a local guide who shapes the day around what genuinely interests you. During the tour booking process, you connect directly with your guide to share what you're curious about and how you prefer to travel. The result is a personalized tour with a tailor-made itinerary.
> 
> For couples, families, and small groups, private tours often offer stronger value than standard group tour options. You receive dedicated attention, flexibility to adjust plans on the fly, skip the line access at attractions, and the ease of knowing someone local is looking out for the details.
> 
> "A private tour is simply a better way to travel: thoughtful, flexible, and shaped around you."

**CTA 按鈕**：`Find your private tour`

### 台灣版調整
```
H2：為什麼選擇私人在地導遊？

段落1：跟私人導遊旅行，沒有陌生人、沒有趕行程、沒有照本宣科。
       你決定步調，你決定停留多久，你決定想深入哪裡。

段落2：我們的導遊都是台灣在地人，他們知道哪個攤子最好吃、
       哪條小路才是真正的在地路線。

段落3：對情侶、家庭、小型群體來說，私人導遊往往比跟團更划算。
       你得到的是全程專注的陪伴，而不是 30 人裡的一個背影。

引言："私人導遊，是旅行最好的方式：用心、彈性、為你而設計。"

CTA 按鈕：「立即尋找導遊」
```

---

## 十四、SECTION 13 — 導遊招募 CTA

### 視覺結構
```
┌──────────────────────────────────────────────────────┐
│  [左側：戶外導覽大圖，自然/街景感]                      │
│                                                       │
│  H2: Become a                                         │
│      guide                                            │
│  （"guide" 有特殊字體或顏色）                           │
│                                                       │
│  We're trail breakers, change-makers, storytellers    │
│  and side-street takers, and we're here for those     │
│  who want to travel differently...                    │
│                                                       │
│  [Apply Now] 按鈕 → /become-a-guide                  │
└──────────────────────────────────────────────────────┘
```

### 原文文案
> We're trail breakers, change-makers, storytellers and side-street takers, and we're here for those who want to travel differently. If you're ready to join a network of creative local tour guides who thrive on providing visitors with truly memorable experiences, we'd love to hear from you

**H2**：`Become a guide`（"guide" 字特殊樣式）  
**CTA 按鈕**：`Apply Now` → `/become-a-guide`

### 台灣版調整
```
H2：成為我們的
    導遊

副文字：你是台灣的在地人，你最懂自己的故鄉。
       不管是帶著旅人走夜市、爬山、騎車，還是說故事——
       如果你喜歡讓人記住台灣，我們想認識你。
       平台抽成只有 15%，業界最低，你的專業值得更多。

CTA：立即申請成為導遊 → /guide/apply
```

---

## 十五、FOOTER

### 結構（標籤頁式導航）
```
[↑ 城市導航 Tab列]
  Popular cities in Europe
  Popular cities in the Americas & Caribbean
  Popular cities in Asia
  Other popular cities
  Popular countries
  Things to do

[Tab 內容] 城市名稱連結列表（4列，每列約8個城市）

[底部資訊欄]
  左側：Logo + 品牌簡介 + 社群連結（Facebook、Instagram、YouTube）
  中間：連結群組（About / Guides / Travel Blog...）
  右側：法律連結（Privacy Policy / Terms of Service）

[版權聲明]：© 2026 ToursByLocals. All rights reserved.
```

### 熱門城市（歐洲）Tab 完整清單
```
Amsterdam, Athens, Barcelona, Belfast, Berlin, Bruges, Brussels, Budapest,
Copenhagen, Córdoba, Dublin, Edinburgh, Florence, Granada, Istanbul, Killarney,
Krakow, Lisbon, London, Lyon, Madrid, Milan, Palermo, Paris, Porto, Prague,
Reykjavik, Rome, Salzburg, Santorini, Seville, Stockholm（32個）
```

### 台灣版 Footer Tab
```
台灣熱門城市
台灣熱門景點
台灣行程分類（美食/文化/戶外/親子）
關於平台
```

---

## 十六、頁面色彩系統

### 觀察色系
- **主背景**：白色 (#FFFFFF)
- **英雄區塊**：深色/半透明疊加在背景圖上
- **數據區塊（Section 5）**：暖白/米色系
- **岸遊 CTA 區塊**：深藍/海洋色調
- **Safari CTA 區塊**：暖橘/土黃色（#D4A076 類似色）
- **導遊招募 CTA**：深綠/森林色調
- **文字主色**：深灰 (#1A1A1A 類)
- **連結/CTA 按鈕**：黑色填充 + 白字，或描邊黑色
- **星評顏色**：金黃 (#F5A623 類)
- **收藏心型**：空心灰色，hover 變紅色

### 台灣版色彩建議
```
主色調：深翠綠（#1B6B4A）— 台灣山林感
輔助色：暖橘（#E8834D）— 活力、溫暖
背景：純白 / 淡米色
CTA 按鈕：主色填充 + 白字
強調色：金黃（評星）
```

---

## 十七、字體系統（觀察）

- **H1**：大型 serif 或 sans-serif，粗體
- **H2**：中型，semi-bold
- **H6（特殊區塊標題）**：較大，用於主題 CTA 標題
- **body text**：14~16px，灰色
- **價格**：較大，semi-bold，深色

---

## 十八、互動功能清單

| 功能 | 說明 |
|------|------|
| 搜尋框 | 首頁 Navbar，輸入地點，下拉建議 |
| 城市/景點/行程卡片 | 點擊整張卡片可跳轉 |
| 收藏（Wishlist）❤️ | 行程卡片、導遊卡片右上角，需登入 |
| 輪播 ←/→ | Section 2/3/4/6 均有左右箭頭控制 |
| FAQ 手風琴 | 點擊問題展開/收合答案，+/- 圖示切換 |
| Footer Tab | 點擊分類切換城市列表 |
| 貨幣選擇器 | Navbar（ToursByLocals 有，我們用 NT$ 固定）|

---

## 十九、重要頁面路由（參考）

| 路徑 | 說明 |
|------|------|
| `/` | 首頁 |
| `/tours` | 全部行程列表 |
| `/tours/{country}/{city}` | 城市行程列表 |
| `/tours/{country}/{city}/tour-details/{slug}` | 行程詳情 |
| `/tour-guides` | 全部導遊列表 |
| `/tour-guides/{country}/{city}/guide-profile/{slug}` | 導遊個人頁 |
| `/become-a-guide` | 導遊申請頁 |
| `/why-choose-tours-by-locals` | 品牌說明頁 |
| `/shore-excursions` | 岸遊主題頁 |
| `/safaris` | 主題行程頁 |
| `/travel-blog` | 部落格列表 |
| `/travel-blog/{slug}` | 部落格文章 |

### 台灣版對應路由
```
/ → 首頁
/activities → 行程列表（或 /tours）
/activities/{region} → 縣市行程列表
/activities/{region}/{slug} → 行程詳情
/guides → 導遊列表
/guides/{slug} → 導遊個人頁
/guide/apply → 導遊申請
/booking/{activityId} → 預約流程
/orders → 訂單管理
/about → 關於我們
/blog → 部落格
```

---

*這份文件是完整的 ToursByLocals 首頁解構，可直接作為前端開發規格書使用。*  
*所有文案均保留原文，台灣版建議附在各 Section 下方供替換參考。*
