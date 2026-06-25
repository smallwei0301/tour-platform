BEGIN;

-- 導遊共用行程編輯 + 管理者審核上架（pending overlay 模型）。
--
-- 導遊的修改不直接覆蓋 live 欄位，而是另存於 pending_changes（JSONB）；已上架行程
-- 在送審期間照常顯示 live 內容、照常可預約。管理者核准才把 pending_changes merge
-- 進 live 欄位，拒絕則退回（changes_requested）。
--
-- publication 狀態仍是既有的 status（draft/published/archived），導遊永遠不能直接改它。

ALTER TABLE public.activities
  -- null=無待審 / 'pending'=待審 / 'changes_requested'=已退回待修
  ADD COLUMN IF NOT EXISTS review_state text,
  -- 導遊提出的「待套用內容」，與編輯表單同 shape 的欄位集合
  ADD COLUMN IF NOT EXISTS pending_changes jsonb,
  -- 送審/編輯者（導遊）
  ADD COLUMN IF NOT EXISTS pending_submitted_by_guide_id uuid,
  ADD COLUMN IF NOT EXISTS pending_submitted_at timestamptz,
  -- 送審當下 live row 的 updated_at，核准時用來偵測「送審後 live 又被改過」的衝突
  ADD COLUMN IF NOT EXISTS pending_base_updated_at timestamptz,
  -- 管理者退回備註（導遊在編輯器看得到）
  ADD COLUMN IF NOT EXISTS review_admin_note text;

-- review_state 合法值約束（NULL 允許）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activities_review_state_check'
    AND conrelid = 'public.activities'::regclass
  ) THEN
    ALTER TABLE public.activities
      ADD CONSTRAINT activities_review_state_check
      CHECK (review_state IS NULL OR review_state IN ('pending', 'changes_requested'));
  END IF;
END $$;

-- 管理者「待審行程」清單以 review_state 過濾，建部分索引加速。
CREATE INDEX IF NOT EXISTS idx_activities_review_state
  ON public.activities (review_state)
  WHERE review_state IS NOT NULL;

COMMIT;
