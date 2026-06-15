# 旅客 Profile 資料表 正式環境套用 Runbook（traveler_profiles + region）

Owner: 平台工程
Last updated: 2026-06-15（Asia/Taipei）
Scope: 旅客「個人資料」`/me/profile` 讀寫所需的 `public.traveler_profiles` 資料表與 `region` 欄位

---

## 0) 背景與症狀

旅客在前台「個人資料」頁（`/me/profile`）按「儲存」時出現 **`profile save failed`**，且頁面載入時欄位（電話等）為空。

根因為 **schema drift**：

- `20260611_issue1387_traveler_profiles.sql`（建表，Issue #1387）**未套用**到正式 Supabase →
  `public.traveler_profiles` 資料表不存在，GET 讀不到、PATCH 寫入失敗。
- `20260615_traveler_profiles_region.sql`（新增 `region` 欄位）使用 `ALTER TABLE **IF EXISTS** …
  ADD COLUMN IF NOT EXISTS region`，**在資料表不存在時會「靜默成功」（`Success. No rows returned`）**，
  因此「執行成功」不代表欄位真的加上去了。

> 程式端已加 schema-drift guard（`app/api/me/profile/route.ts` 的 `isMissingRegionColumn`）：
> `region` 欄位缺失時 GET/PATCH 會退回不含 `region` 的版本，核心 profile 仍可讀寫。
> 但**資料表本身不存在**時無法繞過 —— 必須套用建表 migration。

---

## 1) 套用步驟（Supabase Dashboard → SQL Editor）

於正式專案的 **SQL Editor** 貼上並執行下列整段（建表 + `region` 欄位 + RLS，**全部 idempotent，可安全重複執行**，不會動到既有資料）：

```sql
-- 1) 建立 traveler_profiles（若不存在）
CREATE TABLE IF NOT EXISTS public.traveler_profiles (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name            text NOT NULL DEFAULT '',
  phone                   text NOT NULL DEFAULT '',
  marketing_email_opt_in  boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 2) 區域欄位（表已存在但缺欄時補上）
ALTER TABLE public.traveler_profiles ADD COLUMN IF NOT EXISTS region text;

-- 3) RLS 與政策（本人可讀寫自己；service_role 全權）
ALTER TABLE public.traveler_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS traveler_profiles_select_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_select_own ON public.traveler_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_upsert_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_upsert_own ON public.traveler_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_update_own ON public.traveler_profiles;
CREATE POLICY traveler_profiles_update_own ON public.traveler_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS traveler_profiles_service_all ON public.traveler_profiles;
CREATE POLICY traveler_profiles_service_all ON public.traveler_profiles
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

對應 repo migration 檔：

- `supabase/migrations/20260611_issue1387_traveler_profiles.sql`
- `supabase/migrations/20260615_traveler_profiles_region.sql`

---

## 2) 驗證

### 2.1 欄位存在性（SQL Editor）

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'traveler_profiles'
order by ordinal_position;
```

預期回傳 7 個欄位：`user_id, display_name, phone, marketing_email_opt_in, created_at, updated_at, region`。

- 回 **0 列** → 套用前資料表原本不存在（執行完第 1 段後再查一次應已存在）。

### 2.2 前台實測

登入旅客帳號 → `/me/profile` →
1. 填寫暱稱／區域／電話 → 按「儲存」→ 應顯示「已儲存 ✓」（不再是 `profile save failed`）。
2. 重新整理頁面 → 剛才填的值（含「區域」）應被回填。

---

## 3) Rollback

> 一般無需 rollback（idempotent 且僅新增）。若需移除 `region` 欄位：

```sql
-- supabase/migrations/20260615_traveler_profiles_region.rollback.sql
ALTER TABLE IF EXISTS public.traveler_profiles DROP COLUMN IF EXISTS region;
```

移除整張表（**會刪除所有旅客 profile 資料，請謹慎**）：

```sql
DROP TABLE IF EXISTS public.traveler_profiles;
```

---

## 4) 預防（為什麼會漏）

正式環境 migration 目前非自動套用（CI 只有 `migration-drift-detect.yml` 偵測 drift，不執行）。
新增 migration 後，需由 operator 依本類 runbook 手動套用到正式 Supabase。新功能上線前，
務必確認其依賴的資料表／欄位已在正式環境存在（可用 §2.1 的 `information_schema` 查詢預檢）。
