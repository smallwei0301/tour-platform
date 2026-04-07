# Phase 11 — Task #1（修訂版）：後台照片上傳功能實裝

## 概述

**調整說明：** 移除「等待 Andy 提供照片」的外部依賴，改成由後台上傳功能支持用戶自行上傳。網站上線後，導遊帳號開通並登入後台，自行上傳照片（頭像、行程 Hero 封面、Gallery）。系統自動壓縮、優化、存放至 Supabase Storage，前台正常顯示。

**目標日期：** 4/14 上線（vs. 原 4/15）  
**新總工作量：** 1.5d（vs. 原 2.2d）  

---

## 1️⃣ 實裝範圍與調整

### 新增功能
- ✅ 導遊後台「頭像上傳」欄位（avatar）
- ✅ 行程編輯頁「Hero 上傳」規範修復（16:9, 1920×1080, max 5MB）
- ✅ 行程編輯頁「Gallery 上傳」規範修復（3:2, 1200×800, max 2MB, max 10 張）

### 基礎設施
- ✅ Supabase Storage bucket 設定（guides + tours）
- ✅ RLS policy 設定（公開讀取 + 認證上傳）
- ✅ API endpoint 新增/修改（上傳、更新 URL）

### 前台邏輯
- ✅ Placeholder 支援（無圖時顯示預設圖）
- ✅ 圖片 Fallback（圖片加載失敗時降級到 Placeholder）
- ✅ 響應式圖片顯示（不同螢幕尺寸適配）

### 移除的工作
- ❌ ~~聯繫 Andy 取得照片~~
- ❌ ~~照片篩選、裁切、優化~~
- ❌ ~~照片授權確認~~

---

## 2️⃣ 詳細工作分解

| # | 子任務 | 估時 | Owner | 前置依賴 | 說明 |
|----|--------|------|-------|--------|------|
| 2.1 | Supabase Storage bucket 設定 | 0.25d | backend | - | 建立 `guides` + `tours` bucket，設定 RLS policy |
| 2.2 | 導遊後台頭像上傳表單 | 0.2d | frontend | 2.1 | 新增 avatar 欄位，實裝上傳 UI + 驗證 |
| 2.3 | Hero 上傳規範修復 | 0.2d | frontend | 2.1 | 限制 16:9 比例、1920×1080 尺寸、max 5MB |
| 2.4 | Gallery 上傳規範修復 | 0.15d | frontend | 2.1 | 限制 3:2 比例、1200×800 尺寸、max 2MB、max 10 張 |
| 2.5 | API 上傳端點實裝 | 0.15d | backend | 2.1 | POST `/api/admin/[guide\|activity]/[id]/upload-image` |
| 2.6 | 前台顯示邏輯（Placeholder + Fallback） | 0.25d | frontend | 2.2, 2.3, 2.4 | 無圖時顯示預設、錯誤時降級 |
| 2.7 | 驗收測試（5 項） | 0.3d | qa | 全部完成 | 後台上傳、前台顯示、尺寸驗證 |
| | **合計** | **1.5d** | | | |

---

## 3️⃣ API 端點清單

### 新增端點

#### POST `/api/admin/guides/[id]/upload-avatar`
- **功能**：上傳導遊頭像
- **權限**：認證 + 該導遊帳號本人
- **請求**：
  ```json
  {
    "file": File,          // 圖片檔案
    "type": "avatar"       // 固定值
  }
  ```
- **響應**：
  ```json
  {
    "ok": true,
    "url": "https://..../guides/guide-123/avatar.webp",
    "path": "guides/guide-123/avatar.webp"
  }
  ```
- **存儲位置**：`guides/{guideId}/avatar.webp`
- **尺寸要求**：正方形，最終輸出 400×400px

#### POST `/api/admin/activities/[id]/upload-image`
- **功能**：上傳行程 Hero 或 Gallery
- **權限**：認證 + 該行程 owner
- **請求**：
  ```json
  {
    "file": File,
    "type": "hero|gallery"
  }
  ```
- **響應**（Hero）：
  ```json
  {
    "ok": true,
    "url": "https://..../tours/activity-123/hero.webp",
    "path": "tours/activity-123/hero.webp",
    "type": "hero"
  }
  ```
- **響應**（Gallery）：
  ```json
  {
    "ok": true,
    "url": "https://..../tours/activity-123/gallery/1.webp",
    "path": "tours/activity-123/gallery/1.webp",
    "type": "gallery",
    "seq": 1
  }
  ```
- **存儲位置**：
  - Hero: `tours/{activityId}/hero.webp`
  - Gallery: `tours/{activityId}/gallery/{seq}.webp`
- **尺寸要求**：
  - Hero: 16:9, 最終輸出 1920×1080px
  - Gallery: 3:2, 最終輸出 1200×800px

#### PATCH `/api/admin/guides/[id]`（擴充）
- **新增欄位**：
  ```json
  {
    "profilePhotoUrl": "https://...",  // 頭像 URL（來自 2.1 上傳）
    "bio": "我是導遊簡介..."           // 簡介文字（支援 Markdown）
  }
  ```

---

## 4️⃣ 前台顯示邏輯

### 導遊頭像顯示流程

```
導遊詳情頁面加載
    ↓
讀取 guide.profilePhotoUrl
    ↓
┌─────────────────────────────────┐
│ URL 是否存在且有效？             │
└─────────────────────────────────┘
    ↙ YES                      NO ↘
   顯示真實圖片              顯示 Placeholder
   (400×400px, 圓形)         (gray bg + icon)
    ↓                            ↓
 圖片加載成功 ←→ 加載失敗 ─→ 降級到 Placeholder
```

### 行程 Hero 顯示流程

```
行程卡片/詳情頁加載
    ↓
讀取 activity.heroImageUrl
    ↓
┌──────────────────────────────┐
│ URL 是否存在且有效？          │
└──────────────────────────────┘
    ↙ YES              NO ↘
   顯示真實圖片      顯示 Placeholder
   (1920×1080, cover) (color gradient)
    ↓                    ↓
 加載成功 ←→ 失敗 ─→ 降級到預設顏色
```

### 行程 Gallery 顯示流程

```
行程詳情頁 Gallery 區塊
    ↓
讀取 activity.images[]（陣列）
    ↓
如果 images 為空 → 顯示 "暫無照片"
如果 images 有資料 → Carousel 輪播
    ↓
┌────────────────────────────────┐
│ 每張圖片：URL 是否有效？        │
└────────────────────────────────┘
    ↙ YES                    NO ↘
  顯示真實圖片         顯示 Gallery Placeholder
  (1200×800, cover)    (gray + "無法加載")
    ↓                        ↓
 Swipe/Lazy-load 正常  降級顯示
```

### 實裝代碼示例

#### 頭像元件（`components/GuideAvatar.tsx`）

```tsx
import Image from 'next/image';

interface GuideAvatarProps {
  photoUrl?: string;
  name: string;
  size?: number;
}

export function GuideAvatar({ photoUrl, name, size = 96 }: GuideAvatarProps) {
  const [imageError, setImageError] = useState(false);
  
  // Placeholder 圖片 URL
  const placeholderUrl = `/images/placeholder-avatar.png`;
  
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
      <Image
        src={photoUrl && !imageError ? photoUrl : placeholderUrl}
        alt={name}
        width={size}
        height={size}
        onError={() => setImageError(true)}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
      />
    </div>
  );
}
```

#### Hero 區塊（`components/HeroSection.tsx`）

```tsx
interface HeroSectionProps {
  imageUrl?: string;
  title: string;
  description?: string;
}

export function HeroSection({ imageUrl, title, description }: HeroSectionProps) {
  const [imageError, setImageError] = useState(false);
  
  const placeholderGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
  
  return (
    <div
      style={{
        background: imageUrl && !imageError 
          ? `url('${imageUrl}') center/cover no-repeat`
          : placeholderGradient,
        height: '500px',
        position: 'relative',
      }}
    >
      {imageUrl && !imageError && (
        <img
          src={imageUrl}
          alt={title}
          onError={() => setImageError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {/* Overlay + Title */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px' }}>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
```

---

## 5️⃣ 驗收測試用例

### 測試 1：後台頭像上傳
- **步驟**：
  1. 導遊登入後台 → 個人資料頁面
  2. 點擊「上傳頭像」按鈕
  3. 選擇 JPG/PNG 圖片（>400×400px）
  4. 點擊上傳
- **預期結果**：
  - ✅ 頭像自動裁切為正方形、壓縮至 400×400px
  - ✅ 顯示 loading 狀態 → 上傳成功提示
  - ✅ 前台立即刷新，看到新上傳的頭像

### 測試 2：尺寸驗證（超出限制）
- **步驟**：
  1. 嘗試上傳超過 5MB 的圖片
  2. 嘗試上傳非圖片格式（如 .txt）
- **預期結果**：
  - ✅ 前端驗證：顯示錯誤提示「檔案過大」或「格式不支持」
  - ✅ 不提交至伺服器

### 測試 3：Hero 上傳規範驗證
- **步驟**：
  1. 行程編輯頁 → 上傳 Hero 封面
  2. 上傳 1920×1080（16:9）的圖片
  3. 驗證尺寸、比例、檔案大小
- **預期結果**：
  - ✅ 16:9 比例強制裁切（若原圖非 16:9）
  - ✅ 輸出尺寸 1920×1080px
  - ✅ 檔案大小 < 200KB（WebP 壓縮後）

### 測試 4：Gallery 上傳數量限制
- **步驟**：
  1. 行程編輯頁 → Gallery 區塊
  2. 選擇 12 張圖片上傳
- **預期結果**：
  - ✅ 前端驗證：提示「最多只能上傳 10 張」
  - ✅ 只上傳前 10 張（或提示用戶刪除）

### 測試 5：前台顯示 Fallback
- **步驟**：
  1. 刪除某行程的 Hero URL
  2. 訪問行程頁面
- **預期結果**：
  - ✅ Hero 區塊顯示預設漸層背景（不顯示 404）
  - ✅ Gallery 無圖時顯示「暫無照片」
  - ✅ 導遊無頭像時顯示灰色 Placeholder

---

## 6️⃣ 新時程表（4/07–4/14）

```
日期        里程碑                          Owner
──────────────────────────────────────────────────────────
4/07 (M)   Task #1 開發啟動                dev team
  │        • Supabase bucket 設定 (0.25d) backend
  │        • 後台頭像表單開發 (0.2d)       frontend
  │        • Hero/Gallery 修復 (0.35d)     frontend

4/08 (T)   API 實裝 + 前台邏輯               dev team
  │        • API endpoint 完成 (0.15d)     backend
  │        • Placeholder 邏輯 (0.25d)      frontend

4/09 (W)   測試與修復                       qa + dev
  │        • 驗收測試 5 項 (0.3d)          qa
  │        • Bug 修復                      dev

4/10 (Th)  Code review + 最終整合           pm + dev
  │        • Peer review
  │        • 測試環境驗證

4/14 (M)   ✅ Task #1 上線（功能就緒）      pm
           用戶可自行上傳照片
```

---

## 7️⃣ 修訂里程碑對應

| Phase 11 里程碑 | 原計畫 | 新計畫 | 變化 |
|----------------|-------|-------|------|
| **M1 內容就緒** | 4/14 | 4/14（無變） | ✅ 時程不變 |
| M1 依賴任務 | Task #1 照片取得 | Task #1 後台功能 | ✅ 內容改，時程同 |
| Task #2 MOCK 替換啟動 | 4/14 | 4/14（無變） | ✅ 時程同步 |
| **M2 文件與金流** | 4/21 | 4/21（無變） | ✅ 時程不變 |
| **M3 Go-Live** | 4/28 | 4/28（無變） | ✅ 時程不變 |

**總結**：移除外部依賴（等 Andy 照片），改成內部功能實裝（後台上傳），**時程加快 1 天（2.2d → 1.5d），整體 Phase 11 timeline 無變化**。

---

## 8️⃣ Supabase Storage 設定細節

### Bucket 建立

```sql
-- Migration: 011_create_guide_image_buckets.sql

-- 1. Guides bucket（導遊頭像）
INSERT INTO storage.buckets (id, name, public)
VALUES ('guides', 'guides', true);

-- 2. Tours bucket（行程照片）
INSERT INTO storage.buckets (id, name, public)
VALUES ('tours', 'tours', true);
```

### RLS Policy

```sql
-- Migration: 012_guide_image_storage_rls.sql

-- Guides bucket: 公開讀取，認證用戶上傳
CREATE POLICY "Public read guides"
ON storage.objects FOR SELECT
USING (bucket_id = 'guides');

CREATE POLICY "Authenticated upload guides"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'guides' 
  AND auth.role() = 'authenticated'
);

-- Tours bucket: 公開讀取，Service role 上傳（後台通過 API）
CREATE POLICY "Public read tours"
ON storage.objects FOR SELECT
USING (bucket_id = 'tours');

CREATE POLICY "Service role upload tours"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tours');
```

---

## 9️⃣ 上線後流程

### 導遊自行上傳流程

```
Andy 帳號開通（Emily 建立）
    ↓
Andy 登入導遊後台
    ↓
填寫個人資料（名字、簡介等）
    ↓
點擊「上傳頭像」
    ↓ [JPG/PNG → Storage 自動壓縮 → 400×400px]
Andy 的頭像上線
    ↓
進入「行程編輯」
    ↓
點擊「上傳 Hero 封面」
    ↓ [JPG/PNG → 自動裁切 16:9 → 1920×1080px]
Hero 圖片上線
    ↓
點擊「上傳 Gallery 照片」（可多張）
    ↓ [JPG/PNG → 自動裁切 3:2 → 1200×800px，max 10]
Gallery 圖片上線
    ↓
前台實時顯示（無需 PM 介入）
```

### 角色職責

| 角色 | 職責 |
|------|------|
| **PM/Emily** | 建立 Andy 帳號、提供後台登入方式 |
| **Andy** | 登入後台、上傳照片（無需技術支援） |
| **Tracy (Backend)** | 實裝 API + Storage、確保功能穩定 |
| **Frontend Team** | 後台表單 UI + 前台顯示邏輯 |

---

## 🔟 總結與後續

**Task #1 修訂版完成後：**
1. ✅ 後台上傳功能上線（4/14）
2. ✅ 用戶可自行管理照片（無外部依賴）
3. ✅ 前台正常顯示（含 Placeholder fallback）
4. ✅ Task #2–#12 時程不變，仍按原計畫進行

**上線前準備（Emily / PM）：**
- [ ] 建立 Andy 帳號
- [ ] 發送後台登入方式 + 簡單使用說明
- [ ] 提醒 Andy：4/14 後可登入後台上傳照片

**上線後驗收：**
- [ ] Andy 自行上傳頭像 + Hero + Gallery
- [ ] 前台確認圖片正常顯示
- [ ] E2E 測試通過（Task #7）
- [ ] Go-Live（4/28）

---

**文件完成。Task #1 改為「後台上傳功能實裝」，時程 1.5d，4/14 上線。**

