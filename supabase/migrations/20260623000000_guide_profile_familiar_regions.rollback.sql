-- Rollback：導遊熟悉區域／專業證照／收款方式（複選）欄位
ALTER TABLE public.guide_profiles DROP COLUMN IF EXISTS regions;
ALTER TABLE public.guide_profiles DROP COLUMN IF EXISTS certifications;
ALTER TABLE public.guide_profiles DROP COLUMN IF EXISTS payment_methods;
ALTER TABLE public.guide_applications DROP COLUMN IF EXISTS payment_methods;
