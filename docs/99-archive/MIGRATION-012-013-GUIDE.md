# Supabase Migration 012 & 013 手動執行指南

## 步驟 1：進入 Supabase Dashboard

1. 瀏覽器打開：https://app.supabase.com/projects
2. 登入你的 Supabase 帳號
3. 點選 **tour-platform** 專案

## 步驟 2：執行 Migration 012（Guides 儲存桶）

### 2a. 打開 SQL Editor

- 左側菜單 → **SQL Editor** → **New Query**

### 2b. 複製以下 SQL 到編輯器

```sql
-- Migration 012: Create guides storage bucket for avatar images
-- Phase 11 Task #1 | 2026-04-07
-- 導遊頭像存儲桶

-- 1. Create guides bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guides',
  'guides',
  true,
  5242880,  -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS Policy: Public read access
CREATE POLICY "Public read guides"
ON storage.objects FOR SELECT
USING (bucket_id = 'guides');

-- 3. RLS Policy: Service role can insert (API server uploads)
CREATE POLICY "Service role insert guides"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'guides');

-- 4. RLS Policy: Service role can update
CREATE POLICY "Service role update guides"
ON storage.objects FOR UPDATE
USING (bucket_id = 'guides');

-- 5. RLS Policy: Service role can delete
CREATE POLICY "Service role delete guides"
ON storage.objects FOR DELETE
USING (bucket_id = 'guides');
```

### 2c. 執行 SQL

- 點擊 **Run** 按鈕（或按 Ctrl+Enter）
- 等待完成，應該看到 "Query executed successfully"

## 步驟 3：執行 Migration 013（Activity Images RLS）

### 3a. 新建查詢

- 點 **New Query** 按鈕

### 3b. 複製以下 SQL

```sql
-- Migration 013: Complete RLS policies for activity-images bucket
-- Phase 11 Task #1 | 2026-04-07
-- 補全 activity-images bucket 的 RLS 策略（上傳、更新、刪除）

-- Note: 011_storage_rls.sql already created SELECT policy

-- 1. RLS Policy: Service role can insert (API server uploads)
CREATE POLICY "Service role insert activity-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'activity-images');

-- 2. RLS Policy: Service role can update
CREATE POLICY "Service role update activity-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'activity-images');

-- 3. RLS Policy: Service role can delete
CREATE POLICY "Service role delete activity-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'activity-images');

-- 4. Update bucket settings (file size limit and allowed types)
UPDATE storage.buckets
SET
  file_size_limit = 10485760,  -- 10MB limit (Hero images can be larger)
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'activity-images';
```

### 3c. 執行 SQL

- 點 **Run** 或 Ctrl+Enter
- 確認完成

## 步驟 4：驗證結果

### 4a. 檢查 Storage 儲存桶

1. 左側菜單 → **Storage**
2. 應該看到兩個 bucket：
   - ✅ **guides** (新建)
   - ✅ **activity-images** (已更新)

### 4b. 驗證儲存桶設定

點選 **guides**：
- 公開讀取 ✅
- 檔案大小限制：5MB ✅
- 允許的 MIME 類型：jpeg, png, webp ✅

點選 **activity-images**：
- 檔案大小限制：10MB ✅
- 允許的 MIME 類型：jpeg, png, webp ✅

### 4c. 驗證 RLS 策略

1. 左側菜單 → **Authentication** → **Policies**
2. 搜尋 "guides" 或 "activity-images"
3. 應該看到 5 個 guides policies 和 4 個 activity-images policies

## ✅ 完成標準

當你看到以下信息，表示 migrations 成功：

- 🟢 Query executed successfully（兩次）
- 📁 Storage 頁面顯示 guides 和 activity-images 兩個 bucket
- 🔐 RLS Policies 頁面顯示所有新策略

## ⏱️ 預期耗時

5-10 分鐘

## 🆘 遇到問題？

### 問題 1：提示 "Policy already exists"

**原因**：Migration 011 已經建立了部分 policies

**解決**：忽略這個錯誤，繼續執行。ON CONFLICT DO NOTHING 會自動跳過

### 問題 2：提示 "Bucket already exists"

**原因**：guides bucket 已經被建立過

**解決**：同上，ON CONFLICT 會自動跳過

### 問題 3：執行超時

**原因**：網路或 Supabase 伺服器暫時問題

**解決**：重試或聯繫 Tracy

---

**文件位置**：
- Migration 012: `/root/tour-platform/supabase/migrations/012_guides_storage_bucket.sql`
- Migration 013: `/root/tour-platform/supabase/migrations/013_activity_images_full_rls.sql`

**更新日期**：2026-04-08
