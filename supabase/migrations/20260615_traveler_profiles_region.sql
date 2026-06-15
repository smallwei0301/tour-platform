-- 旅客個人資料新增「區域」欄位（顯示用，存全站地區 slug，如 'taipei'）。
-- 與 /me/profile 的下拉清單（src/lib/region-slugs.mjs listRegionOptions）一致。
alter table if exists public.traveler_profiles
  add column if not exists region text;
