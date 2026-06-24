# Midao 祕島 — Brag Launch Video

用 `/brag` skill（`latent-spaces/brag`）＋ HyperFrames（`heygen-com/hyperframes`）為本專案產生的 20 秒 launch 影片。

## 成品

- `brag.mp4` — 1920×1080 · 30fps · 20s（不入 git，見下方重建指令）
- `share-copy.txt` — 社群分享文案（繁中＋雙語 tagline）
- `brag-plan.md` — 創作北極星（angle／hook／storyboard／tone／配色）
- `composition-brief.md` — 交給 HyperFrames 的 composition brief
- `composition/index.html` — 唯一的 composition 源碼（單檔，一條 GSAP master timeline 驅動 5 幕）

## 設計重點

- **Tone**：polished + cinematic，遵 `BRAND_BOOK.md` Voice & Tone（禁形容詞／網紅口吻／驚嘆號濫用）。
- **配色／字體**：山墨 #1A2E1F、古紙 #F4ECD8、朝霞 #C2542E；Noto Serif TC（標題）＋ Fraunces（英文）。
- **真實素材**：真實文案（島嶼裡，還有一座島／島嶼深處，有故事的人帶路）、真實 UI（編輯精選行程卡 ★4.9 NT$1,680）、真實圖片（柴山探洞 `feat-chaishan`、引路人 Andy Lee `portrait-hawk`、霧谷山景 `hero-mountains`）。
- **音訊**：自製破曉山林氛圍 bed（ffmpeg 合成）＋ 兩處克制 SFX；bundled「business moves」上揚節奏與品牌衝突故不用。

## 重建 assets 與 render

`composition/assets/`（字體 17MB／圖片／音樂／gsap）與 `brag.mp4` 不入 git。重建：

```bash
cd brag-output/composition && mkdir -p assets/fonts assets/images assets/audio

# 1) GSAP（render 無外連，需在地化）
curl -sSL -o assets/gsap.min.js https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js

# 2) 字體（變數字體，全字重）
curl -sSL -o assets/fonts/NotoSerifTC.ttf     "https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf"
curl -sSL -o assets/fonts/Fraunces.ttf         "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
curl -sSL -o assets/fonts/Fraunces-Italic.ttf  "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf"
# 同步安裝到系統字體讓 headless Chrome 取用：
sudo cp assets/fonts/*.ttf /usr/share/fonts/truetype/ && sudo fc-cache -f

# 3) 圖片（取自本專案 public/images）
cp ../../apps/web/public/images/lp/feat-chaishan.webp           assets/images/card-chaishan.webp
cp ../../apps/web/public/images/guides/andy-lee/portrait-hawk.webp assets/images/guide-andy.webp
cp ../../apps/web/public/images/lp/hero-mountains.webp          assets/images/hero-mountains.webp

# 4) 氛圍 bed（破曉山風＋低頻 drone 五度，21s）
ffmpeg -y -f lavfi -i "sine=frequency=98:duration=20.5" -f lavfi -i "sine=frequency=147:duration=20.5" \
  -f lavfi -i "sine=frequency=49:duration=20.5" -f lavfi -i "anoisesrc=d=20.5:c=pink:a=0.18" \
  -filter_complex "[0:a]volume=0.16,tremolo=f=0.12:d=0.5[d1];[1:a]volume=0.10,tremolo=f=0.10:d=0.4[d2];[2:a]volume=0.20[sub];[3:a]highpass=f=500,lowpass=f=3200,volume=0.9,tremolo=f=0.15:d=0.85[wind];[d1][d2][sub][wind]amix=inputs=4:duration=longest:weights=1 1 1 0.5,aecho=0.8:0.85:350|520:0.3|0.2,afade=t=in:st=0:d=2.5,afade=t=out:st=17.5:d=3,loudnorm=I=-22:TP=-2:LRA=11,alimiter=limit=0.9[out]" \
  -map "[out]" -ac 2 -ar 44100 -c:a libmp3lame -q:a 4 assets/audio/bed.mp3
# 兩處 SFX 取自 /brag skill 的 Kenney 素材（impactSoft_heavy_001 / card-slide-3），轉 mp3 為 assets/audio/sfx-seal.mp3、sfx-slide.mp3

# 5) Render
npx hyperframes lint
npx hyperframes render -o ../brag.mp4 -q high -f 30 -w 4 --no-browser-gpu
```

> 需要：Node 22、ffmpeg、`npx hyperframes browser ensure`（Chrome Headless Shell）。
