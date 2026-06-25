# Brag Plan: Midao 祕島

## What is this app?
Midao（祕島）是台灣在地導遊預約平台——旅客直接預約「真正走過這條路」的在地引路人，走進沒被寫進手冊的山徑、野溪、老街與夜市；導遊管理場次、接單、收款。不跟團、不趕路。

## The angle
不是又一個 OTA 的促銷影片。這支片把品牌當成一本破曉時翻開的「祕島田野誌」：古紙、印章、宋體、朝霞色的一道光。賣點不是「便宜、好玩」，而是**信任**——「有故事的人帶路」。用品牌自己的真實文案與真實 UI（編輯精選行程卡、引路人 Andy Lee、預約成功微文案），而不是通用 SaaS 大話。語氣克制，靠留白與一道曙光取勝。

## Hook (first 2-3 seconds)
古紙背景上，一枚「祕」印章落下（柔和印壓聲），主標語以宋體浮現：**「島嶼裡，還有一座島。」**，下面一行 Fraunces 斜體 *An island, untold.*，一道朝霞色細線自左劃開。這枚印章＋這句話，就是整支片的承諾。

## Key moments (the middle)
- **承諾**：山墨深色大標「島嶼深處，有故事的人帶路。」朝霞色句點。副標「在地嚮導 × 深度路線 × 真實相遇」。
- **真實產品 UI**：重建首頁「編輯精選」行程卡——柴山探洞・城市祕境，編輯精選書籤、標籤（探洞・一日・難度●●○○○）、★ 4.9 共 128 則評論、NT$ 1,680 起。卡片滑入（紙張聲），評分數字跳到 4.9。
- **引路人**：Andy Lee 卡——導遊原話「不是觀光打卡，是懂路的人帶你走進柴山。」＋四枚信任徽章（實名驗證／在地審核／旅客保障／真實評價）逐一亮起。

## Outro / punchline
預約成功微文案像確認般落下：**「好了，引路人會在山上等你。」**，收束成 logo lockup「祕島 · MIDAO」與雙語主標語，最後一道曙光與 CTA「尋找一條你的徑 →」。音樂淡出。

## User flow worth showing
真實旅客動線：瀏覽編輯精選路線 → 看見「適合誰、會記住什麼、誰帶你走」（行程卡＋引路人）→ 留一個位置 → 收到「引路人會在山上等你」。中段三、四幕即依此動線：行程卡 → 引路人 → 預約成功微文案。

## Tone
- Preset: polished（融入 cinematic 的緩起與大標）
- Creative direction: 破曉時翻開的祕島田野誌——古地圖在呼吸
- Interpretation: 少場次、長停留、慢溶接；靠宋體、留白、一道朝霞光取勝。禁形容詞、禁網紅口吻、禁驚嘆號濫用（遵 BRAND_BOOK Voice & Tone）。

## Format: landscape — 1920x1080
## Duration: 24.6s（5 幕：4.0 + 4.8 + 6.6 + 5.8 + 5.2；依文字量加長，S3 行程卡與 S4 引路人停留最久，與導遊片節奏一致）

## Visual identity (from the project)
- Background: 古紙 #F4ECD8（開場/outro）、山墨 #1A2E1F（承諾/引路人）
- Accent: 朝霞 #C2542E
- Secondary: 苔綠 #5E7A4F、黃銅 #B08D3E、礦石 #2A2422
- Text: #1A2E1F on paper／#F4ECD8 on ink
- Display font: Noto Serif TC（思源宋體，標題 Black）
- Body font: Fraunces（英文，斜體優美）
- Strongest visual element: 編輯精選行程卡（柴山探洞）、引路人 Andy Lee 卡、預約成功微文案、祕印章＋羅盤浮水印

## Share copy (draft)
島嶼裡，還有一座島。Midao 祕島——預約真正走過這條路的在地引路人，走進沒被寫進手冊的台灣。⛰️

## Audio direction
- Role: 有旋律的暖調配樂——音樂盒／鐘琴旋律（A 大調五聲音階）鋪在和弦 pad 上
- Music: 自製 `assets/audio/bed.mp3`（Python 合成：五聲音階主旋律＋A→D→A 和弦 pad＋sub bass＋殘響；旋律在 ~20.6s 升到 E5 climax 對齊 logo，落回主音 A 收尾）。純合成無噪音（已徹底解決先前「沙沙」問題）。
- Music treatment: 全程低音量 bed，0–2.5s 淡入、17.5s 起 3s 淡出收在 logo
- Music cue guidance: 無節拍 grid（氛圍 bed）；視覺節奏由幕與動畫驅動，不對拍
- Audio-reactive treatment: none（保持克制）
- SFX posture: sparse — 僅兩處：開場印章柔和印壓（`sfx-seal.mp3`）、行程卡滑入紙張聲（`sfx-slide.mp3`）
- Audio-coupled moments: 印章落下、行程卡滑入、評分跳數
- Restraint rule: 不得有 whoosh 連發、不得對拍閃字、整支不超過兩個 SFX

## Storyboard

### Scene 1 — 印章開場 / Tagline — 3.6s
古紙背景＋羅盤浮水印。「祕」印章自上落下並輕微回彈；主標語宋體浮現「島嶼裡，還有一座島。」，下方 Fraunces 斜體 *An island, untold.*；朝霞細線自左劃開。
Sequential/interaction: yes — 印章落下 → 主標淡入 → 英文副標 → 細線劃開
Audio intent: 一聲柔和印壓，奠定安靜、莊重、田野誌的基調
Audio-coupled idea: 印章落下對 `sfx-seal.mp3`
Music: 低頻 drone 淡入
Transition mood: soft 溶接 → Scene 2

### Scene 2 — 承諾 / Hero line — 3.8s
山墨深背景。大標「島嶼深處，／有故事的人帶路<朝霞句點>」；副標「在地嚮導 × 深度路線 × 真實相遇」；英文 caption「TAIWAN · LOCAL GUIDE · REAL STORIES」。
Sequential/interaction: 大標兩行先後浮現，句點以朝霞色點亮
Audio intent: bed 緩緩抬升，留白
Audio-coupled idea: none
Transition mood: soft 慢溶 → Scene 3

### Scene 3 — 真實產品 UI / 編輯精選行程卡 — 4.4s
重建首頁編輯精選卡：左側照片區以苔綠→礦石漸層代表（無外連圖），「編輯精選」書籤；右側標題「柴山探洞・城市祕境」、副標「走進城市邊緣的地形祕境」、標籤（探洞・一日・難度●●○○○）、★ 評分由 4.6 跳到 4.9・共 128 則評論、NT$ 1,680 起。
Sequential/interaction: yes — 卡片自右滑入；標籤逐一彈入；評分數字跳到 4.9
Audio intent: 紙張滑動聲點出「翻開一張檔案卡」
Audio-coupled idea: 卡片滑入對 `sfx-slide.mp3`
Transition mood: clean 切 → Scene 4

### Scene 4 — 引路人 / 信任 — 4.2s
山墨背景。左側引路人肖像區（朝霞→山墨漸層占位）；導遊原話「不是觀光打卡，／是懂路的人帶你走進柴山。」；署名「高雄柴山・Andy Lee」；右側 2×2 信任徽章（實名驗證／在地審核／旅客保障／真實評價）逐一亮起。
Sequential/interaction: yes — 引言先現，四枚徽章依序亮起
Audio intent: bed 維持，安靜可信
Audio-coupled idea: none（克制，不為每枚徽章加音）
Transition mood: soft 溶 → Scene 5

### Scene 5 — 預約成功 + Outro — 4.0s
古紙背景。預約成功微文案「好了，引路人會在山上等你。」如確認般落下並停留；化為 logo lockup「祕島 · MIDAO」＋雙語主標語「島嶼裡，還有一座島。／ An island, untold.」＋ CTA「尋找一條你的徑 →」。最後一道朝霞光。
Sequential/interaction: 微文案 → logo → CTA 先後
Audio intent: bed 自 17.5s 起 3s 淡出，收在留白
Audio-coupled idea: none
Transition mood: 收 → 黑/紙

**Music mood for this video:** cinematic / ambient（破曉山林，非上揚節奏）
**Audio summary:** 一段低限的破曉山風氛圍 bed 從頭鋪到尾，緩起緩落；只在印章與行程卡兩處點兩聲克制 SFX，其餘交給留白與宋體。
