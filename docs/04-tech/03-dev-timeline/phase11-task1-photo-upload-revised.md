# Phase 11 Task #1（修訂版）：導遊後台照片上傳功能實裝

> **文件版本**: v2.0（重新規劃）
> **規劃日期**: 2026-04-07
> **預計完成**: 2026-04-14
> **總工時估計**: 1.5 工作天

---

## 1. 調整說明

### 1.1 原方案（已棄用）
- 等待 Andy 提供照片 → Marketing/Ops 聯繫取得 → 手動上傳至 Supabase Storage
- 估時 2.2d，流程被動依賴外部資源

### 1.2 新方案（本文件）
- **改為自助上傳**：導遊登入後台 → 自行上傳 Avatar/Hero/Gallery → 系統自動處理
- **移除外部等待**：無需聯繫 Andy 取得照片，導遊帳號開通後即可自行操作
- **立即實裝功能**：後台上傳功能上線後，前台即可顯示真實圖片
- **Placeholder 過渡**：上線前使用備選圖，上傳後自動切換

### 1.3 效益
| 項目 | 原方案 | 新方案 |
|------|--------|--------|
| 工時 | 2.2d | 1.5d |
| 外部依賴 | 需等照片 | 無 |
| 可擴展性 | 僅 Andy | 所有導遊適用 |
| 維護成本 | 每位導遊需人工處理 | 自助式，無需介入 |

---

## 2. 實裝範圍

### 2.1 導遊後台：新增頭像上傳欄位（Avatar）
| 項目 | 規格 |
|------|------|
| 欄位名稱 | `avatar_url` |
| 建議比例 | 1:1（正方形） |
| 建議尺寸 | 400×400px 以上 |
| 最大檔案 | 2MB |
| 格式 | JPG, PNG, WebP |
| 上傳位置 | 導遊後台 `/guide/profile` |
| Storage Bucket | `guides` |
| 路徑規則 | `avatars/{guide_slug}/avatar-{timestamp}.webp` |

### 2.2 行程編輯頁：Hero 封面上傳修復
| 項目 | 規格 |
|------|------|
| 欄位名稱 | `cover_image_url` / `hero_image_url` |
| 比例 | 16:9 |
| 尺寸 | 1920×1080px（自動壓縮） |
| 最大檔案 | 5MB |
| 格式 | JPG, PNG, WebP |
| 上傳位置 | Admin 行程編輯 `/admin/activities/[id]/edit` |
| Storage Bucket | `tours` |
| 路徑規則 | `activities/{activity_slug}/cover-{timestamp}.webp` |

### 2.3 行程編輯頁：Gallery 照片上傳修復
| 項目 | 規格 |
|------|------|
| 欄位名稱 | `image_urls` / `gallery_urls` |
| 比例 | 3:2（建議） |
| 尺寸 | 1200×800px（自動壓縮） |
| 最大檔案 | 2MB/張 |
| 最大張數 | 10 張 |
| 格式 | JPG, PNG, WebP |
| 上傳位置 | Admin 行程編輯 `/admin/activities/[id]/edit` |
| Storage Bucket | `tours` |
| 路徑規則 | `activities/{activity_slug}/gallery-{index}-{timestamp}.webp` |

### 2.4 Supabase Storage Bucket 設定
需要建立/設定以下兩個 bucket：

| Bucket | 用途 | Public | RLS |
|--------|------|--------|-----|
| `guides` | 導遊頭像 | Yes | 導遊只能上傳自己的資料夾 |
| `tours` | 行程封面/Gallery | Yes | Admin 或導遊自己的行程 |

**RLS 政策：**
```sql
-- guides bucket: 導遊頭像
CREATE POLICY "Public read for guide avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'guides');

CREATE POLICY "Guides can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'guides' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- tours bucket: 行程圖片
CREATE POLICY "Public read for tour images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tours');

CREATE POLICY "Admin can upload tour images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tours' AND
  auth.role() = 'service_role'
);
```

### 2.5 前台顯示邏輯（Placeholder Fallback）
```typescript
// 通用 Placeholder 邏輯
function getImageUrl(url: string | null | undefined, type: 'avatar' | 'hero' | 'gallery'): string {
  if (url && url.trim()) return url;

  const placeholders = {
    avatar: '/images/placeholder-avatar.jpg',
    hero: '/images/placeholder-hero.jpg',
    gallery: '/images/placeholder-gallery.jpg',
  };

  return placeholders[type];
}

// 使用方式
<Image src={getImageUrl(guide.avatarUrl, 'avatar')} alt={guide.displayName} />
<Image src={getImageUrl(activity.coverImageUrl, 'hero')} alt={activity.title} />
```

---

## 3. 工作分解表（WBS）

| # | 子任務 | 估時 | Owner | 前置依賴 | 驗收指標 |
|---|--------|------|-------|----------|----------|
| 1.1 | Supabase Storage bucket 建立（guides, tours） | 0.25d | Backend | - | Bucket 存在、RLS 生效 |
| 1.2 | 導遊後台頭像上傳欄位 UI | 0.2d | Frontend | 1.1 | 可選檔、預覽、儲存 |
| 1.3 | 行程編輯 Hero 上傳修復（尺寸/比例限制） | 0.2d | Frontend | 1.1 | 16:9 驗證、壓縮、上傳 |
| 1.4 | 行程編輯 Gallery 上傳修復（數量/尺寸限制） | 0.15d | Frontend | 1.1 | 10張上限、3:2驗證 |
| 1.5 | API 上傳路徑修正（guides bucket） | 0.15d | Backend | 1.1 | Avatar 上傳至正確路徑 |
| 1.6 | 前台 Placeholder 邏輯與實際圖片 fallback | 0.25d | Frontend | 1.2-1.4 | 無圖顯示 placeholder |
| 1.7 | 驗收測試（5 項用例） | 0.3d | QA | 1.1-1.6 | 全部 PASS |

**總計**：1.5d

---

## 4. API 端點清單

### 4.1 新增 API

| Method | Endpoint | 用途 | Request | Response |
|--------|----------|------|---------|----------|
| POST | `/api/guide/avatar/upload` | 導遊上傳頭像 | `FormData: file` | `{ ok: true, data: { url } }` |

### 4.2 修改 API

| Method | Endpoint | 修改項目 |
|--------|----------|----------|
| POST | `/api/admin/activities/[id]/upload-image` | 新增 `type: 'hero'` 支援、加入尺寸驗證 |
| PUT | `/api/admin/guides/[id]` | 支援更新 `avatar_url` 欄位 |

### 4.3 API 規格詳情

#### `POST /api/guide/avatar/upload`
```typescript
// Request (FormData)
{
  file: File // 圖片檔案，max 2MB
}

// Response (Success)
{
  ok: true,
  data: {
    url: "https://xxx.supabase.co/storage/v1/object/public/guides/avatars/andy-lee/avatar-1712505600.webp",
    path: "avatars/andy-lee/avatar-1712505600.webp"
  }
}

// Response (Error)
{
  ok: false,
  error: {
    code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "UPLOAD_FAILED",
    message: "檔案大小不得超過 2MB"
  }
}
```

#### `POST /api/admin/activities/[id]/upload-image`（修改後）
```typescript
// Request (FormData)
{
  file: File,
  type: "cover" | "gallery" | "hero",  // 新增 hero type
  slug?: string
}

// 尺寸驗證規則
const RULES = {
  hero: { maxSize: 5 * 1024 * 1024, aspectRatio: 16/9, tolerance: 0.1 },
  cover: { maxSize: 5 * 1024 * 1024, aspectRatio: 16/9, tolerance: 0.1 },
  gallery: { maxSize: 2 * 1024 * 1024, aspectRatio: 3/2, tolerance: 0.15 },
};
```

---

## 5. 前台顯示邏輯詳細規格

### 5.1 影響頁面清單

| 頁面 | 欄位 | 邏輯 |
|------|------|------|
| `/guides` (列表) | Avatar | 有 → 顯示 / 無 → placeholder |
| `/guides/[slug]` (詳情) | Avatar, Hero, Gallery | 同上 |
| `/activities/[slug]` (行程詳情) | Hero, Gallery | 有 → 顯示 / 無 → placeholder |
| `/admin/guides` | Avatar 預覽 | 後台使用小尺寸預覽 |
| `/admin/activities/[id]/edit` | Hero, Gallery 預覽 | 後台編輯預覽 |

### 5.2 Placeholder 圖片規格

| Type | 檔名 | 尺寸 | 說明 |
|------|------|------|------|
| Avatar | `placeholder-avatar.jpg` | 400×400 | 灰色漸層 + 人像 icon |
| Hero | `placeholder-hero.jpg` | 1920×1080 | 山景示意圖 + 文字 |
| Gallery | `placeholder-gallery.jpg` | 1200×800 | 風景示意圖 |

### 5.3 實作位置

```
apps/web/
├── public/images/
│   ├── placeholder-avatar.jpg
│   ├── placeholder-hero.jpg
│   └── placeholder-gallery.jpg
├── src/lib/
│   └── image-utils.ts          # getImageUrl(), validateImageDimensions()
├── src/components/
│   └── common/
│       └── ImageWithFallback.tsx
```

---

## 6. 驗收測試用例（5 項）

### TC-1：導遊後台頭像上傳
| 項目 | 內容 |
|------|------|
| **前置條件** | 導遊已登入後台 |
| **測試步驟** | 1. 進入 /guide/profile<br>2. 點擊頭像上傳區<br>3. 選擇 500×500 JPG 檔案（1.5MB）<br>4. 確認上傳 |
| **預期結果** | ✅ 上傳成功、預覽更新、URL 存入 DB |
| **邊界測試** | 超過 2MB → 顯示錯誤；非圖片格式 → 拒絕 |

### TC-2：行程 Hero 封面上傳
| 項目 | 內容 |
|------|------|
| **前置條件** | Admin 進入行程編輯頁 |
| **測試步驟** | 1. 點擊封面上傳區<br>2. 選擇 1920×1080 PNG（4MB）<br>3. 確認上傳 |
| **預期結果** | ✅ 自動壓縮為 WebP、上傳成功、預覽更新 |
| **邊界測試** | 非 16:9 比例 → 顯示警告；超過 5MB → 拒絕 |

### TC-3：行程 Gallery 多圖上傳
| 項目 | 內容 |
|------|------|
| **前置條件** | Admin 進入行程編輯頁 |
| **測試步驟** | 1. 點擊 Gallery 上傳區<br>2. 選擇 5 張 1200×800 圖片<br>3. 確認批次上傳 |
| **預期結果** | ✅ 5 張全部上傳、預覽更新、可拖曳排序 |
| **邊界測試** | 上傳第 11 張 → 顯示「已達上限」；單張超 2MB → 跳過該張 |

### TC-4：前台 Placeholder 顯示
| 項目 | 內容 |
|------|------|
| **前置條件** | 資料庫中有一筆導遊/行程，圖片欄位為 NULL |
| **測試步驟** | 1. 訪問導遊頁面<br>2. 訪問行程頁面<br>3. 檢查圖片顯示 |
| **預期結果** | ✅ 顯示對應 placeholder 圖片、無 404、無空白 |

### TC-5：上傳後前台即時更新
| 項目 | 內容 |
|------|------|
| **前置條件** | 導遊已有 placeholder 顯示 |
| **測試步驟** | 1. 後台上傳真實頭像<br>2. 重整前台導遊頁面<br>3. 檢查圖片 |
| **預期結果** | ✅ 顯示剛上傳的真實圖片、URL 正確 |

---

## 7. 時程表（4/07 - 4/14）

```
Week 1: 2026-04-07 (Mon) ~ 2026-04-11 (Fri)
═══════════════════════════════════════════════════════════════

4/07 (Mon) ─────────────────────────────────────────────────────
  [Backend] Supabase Storage bucket 設定 (0.25d)
    - 建立 guides bucket
    - 建立 tours bucket
    - 設定 RLS 政策
    - 驗證公開讀取權限

4/08 (Tue) ─────────────────────────────────────────────────────
  [Frontend] 導遊後台頭像上傳欄位 (0.2d)
    - ImageUpload 組件調整
    - 導遊 Profile 頁面整合
    - Avatar 預覽功能

  [Backend] API 上傳路徑修正 (0.15d)
    - POST /api/guide/avatar/upload
    - 更新 guides 表結構

4/09 (Wed) ─────────────────────────────────────────────────────
  [Frontend] 行程編輯 Hero 上傳修復 (0.2d)
    - 16:9 比例驗證
    - 5MB 大小限制
    - 自動壓縮邏輯

  [Frontend] 行程編輯 Gallery 上傳修復 (0.15d)
    - 3:2 比例驗證
    - 10 張上限檢查
    - 批次上傳 UI

4/10 (Thu) ─────────────────────────────────────────────────────
  [Frontend] 前台 Placeholder 邏輯實作 (0.25d)
    - ImageWithFallback 組件
    - Placeholder 圖片準備
    - 所有頁面整合

4/11 (Fri) ─────────────────────────────────────────────────────
  [QA] 驗收測試 (0.3d)
    - TC-1 ~ TC-5 執行
    - Bug 修復
    - 最終確認

Week 2: 2026-04-14 (Mon)
═══════════════════════════════════════════════════════════════

4/14 (Mon) ─────────────────────────────────────────────────────
  [ALL] 功能上線
    - Production 環境部署
    - Storage bucket 正式設定
    - 通知 Andy 可開始上傳
```

---

## 8. 里程碑對應（修訂後）

### Phase 11 Milestones 調整

| 原里程碑 | 調整後 |
|----------|--------|
| **M1: 內容就緒 (4/14)** | 照片上傳功能上線、Andy 可自行上傳 |
| ↳ Andy 照片全部到位 | ↳ 上傳功能就緒，由 Andy 自行操作 |
| ↳ MOCK 數據替換完成 | 維持不變 |
| ↳ 場次開放設定 | 維持不變 |

### Task #1 與其他任務關聯

```
Task #1 照片上傳 (1.5d)
    ↓
Task #2 MOCK 數據替換 (1d) — 可並行
    ↓
Task #8 Andy Lee 場次開放 (0.5d) — 依賴 #1, #2
    ↓
M1: 內容就緒 ✓
```

---

## 9. 技術實作參考

### 9.1 現有相關檔案

| 檔案 | 用途 | 修改需求 |
|------|------|----------|
| `apps/web/app/api/admin/activities/[id]/upload-image/route.ts` | 行程圖片上傳 | 加入 hero type、尺寸驗證 |
| `apps/web/src/components/admin/ImageUpload.tsx` | 上傳組件 | 增加比例驗證參數 |
| `apps/web/src/lib/db-guides.ts` | 導遊資料查詢 | 增加 avatar_url fallback |
| `apps/web/src/fixtures/data.ts` | Fixture 資料 | 加入 placeholder URLs |
| `supabase/migrations/011_storage_rls.sql` | Storage RLS | 擴展支援新 bucket |

### 9.2 新增檔案清單

| 檔案 | 用途 |
|------|------|
| `apps/web/app/api/guide/avatar/upload/route.ts` | 導遊頭像上傳 API |
| `apps/web/src/lib/image-utils.ts` | 圖片工具函數 |
| `apps/web/src/components/common/ImageWithFallback.tsx` | 通用圖片組件 |
| `apps/web/public/images/placeholder-*.jpg` | Placeholder 圖片 |
| `supabase/migrations/012_guides_tours_storage.sql` | Storage bucket RLS |

### 9.3 Database Schema 補充

```sql
-- guides 表新增欄位（若尚未存在）
ALTER TABLE guides
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 確認 activities 表欄位
-- cover_image_url: 主封面（已存在）
-- image_urls: Gallery JSONB 陣列（已存在）
```

---

## 10. 風險與對策

| 風險 | 機率 | 影響 | 對策 |
|------|------|------|------|
| Supabase Storage 配額限制 | 低 | 中 | Free tier 1GB，足夠 MVP；監控用量 |
| 圖片壓縮失敗 | 低 | 低 | Client-side 壓縮 + Server fallback |
| 導遊不會操作上傳 | 中 | 中 | 準備操作手冊、首次由 Ops 協助 |
| 比例驗證過嚴導致體驗差 | 中 | 低 | 提供建議而非強制；可設定 tolerance |

---

## 11. 上線後流程

```
┌─────────────────────────────────────────────────────────────┐
│                    導遊照片上傳流程                          │
└─────────────────────────────────────────────────────────────┘

1. Admin 開通導遊帳號
   └─→ 發送登入邀請給 Andy

2. Andy 首次登入後台
   └─→ 進入 /guide/profile

3. 上傳頭像
   └─→ 選擇圖片 → 自動壓縮 → 上傳至 guides bucket
   └─→ DB 更新 avatar_url

4. 上傳行程圖片（若有權限）
   └─→ 進入行程編輯頁
   └─→ 上傳 Hero + Gallery
   └─→ DB 更新 cover_image_url, image_urls

5. 前台自動顯示
   └─→ 導遊頁面顯示真實頭像
   └─→ 行程頁面顯示真實封面
```

---

## 12. Checklist（開發用）

### Backend
- [ ] 建立 `guides` Storage bucket
- [ ] 建立 `tours` Storage bucket
- [ ] 設定 RLS 政策（讀取公開、寫入限制）
- [ ] 實作 `/api/guide/avatar/upload` API
- [ ] 修改 `/api/admin/activities/[id]/upload-image` 支援 hero type
- [ ] 資料庫 migration 確認 `avatar_url` 欄位

### Frontend
- [ ] 導遊後台 Profile 頁面加入頭像上傳 UI
- [ ] ImageUpload 組件增加 aspectRatio 參數
- [ ] Hero 上傳加入 16:9 驗證
- [ ] Gallery 上傳加入 10 張上限 + 2MB 驗證
- [ ] 建立 ImageWithFallback 通用組件
- [ ] 準備 3 張 placeholder 圖片
- [ ] 整合前台所有頁面使用 fallback 邏輯

### QA
- [ ] 執行 TC-1：導遊頭像上傳
- [ ] 執行 TC-2：行程 Hero 上傳
- [ ] 執行 TC-3：行程 Gallery 上傳
- [ ] 執行 TC-4：Placeholder 顯示
- [ ] 執行 TC-5：上傳後即時更新
- [ ] 所有測試 PASS 簽核

---

**文件結束**

> 負責人：Tracy (Backend), Chris (Frontend), Emily (PM/QA)
> 最後更新：2026-04-07
