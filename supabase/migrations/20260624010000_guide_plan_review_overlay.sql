BEGIN;

-- Phase 2：方案（activity_plans，含每方案價格）開放給導遊自助編輯／新建，走送審。
--
-- 與行程（activities）相同的 pending overlay 模型：
--   - 導遊改「已上架（status=active）」方案時，修改另存於 pending_changes（JSONB），
--     live 欄位不動，前台照常以原方案售票；管理者核准才 merge 進 live 欄位。
--   - 導遊「新建」方案時，方案以 status='inactive' + pending_new_plan=true 落地（不對外
--     售票），核准後才轉 active 上架。
--   - 退回（changes_requested）保留 pending_changes，導遊改完可再送審。
--
-- status（active/inactive/archived）仍是既有上下架欄位，導遊永遠不能直接改它。

ALTER TABLE public.activity_plans
  -- null=無待審 / 'pending'=待審 / 'changes_requested'=已退回待修
  ADD COLUMN IF NOT EXISTS review_state text,
  -- 導遊提出的「待套用內容」，與方案編輯表單同 shape 的欄位集合（snake_case）
  ADD COLUMN IF NOT EXISTS pending_changes jsonb,
  -- 送審/編輯者（導遊）
  ADD COLUMN IF NOT EXISTS pending_submitted_by_guide_id uuid,
  ADD COLUMN IF NOT EXISTS pending_submitted_at timestamptz,
  -- 送審當下 live row 的 updated_at，核准時偵測「送審後 live 又被改過」的衝突
  ADD COLUMN IF NOT EXISTS pending_base_updated_at timestamptz,
  -- 管理者退回備註（導遊在編輯器看得到）
  ADD COLUMN IF NOT EXISTS review_admin_note text,
  -- true=導遊新建、尚未首次核准上架的方案；核准時據此把 status 轉為 active 並清旗標
  ADD COLUMN IF NOT EXISTS pending_new_plan boolean NOT NULL DEFAULT false;

-- review_state 合法值約束（NULL 允許）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'activity_plans_review_state_check'
    AND conrelid = 'public.activity_plans'::regclass
  ) THEN
    ALTER TABLE public.activity_plans
      ADD CONSTRAINT activity_plans_review_state_check
      CHECK (review_state IS NULL OR review_state IN ('pending', 'changes_requested'));
  END IF;
END $$;

-- 管理者「待審方案」清單以 review_state 過濾，建部分索引加速。
CREATE INDEX IF NOT EXISTS idx_activity_plans_review_state
  ON public.activity_plans (review_state)
  WHERE review_state IS NOT NULL;

COMMENT ON COLUMN public.activity_plans.pending_new_plan IS
  'true=guide-created plan awaiting first approval (status inactive, not bookable); approval flips status to active and clears this flag';

COMMIT;
