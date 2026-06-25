-- 三種預約模式 booking_type 實裝 — bookings 新增「導遊審核」維度（與 status 正交）
-- 2026-06-24
--
-- request plan：先審核後付款。旅客送出申請 → guide_approval_status='pending'，
-- 導遊審核通過（'approved'）才放行付款；婉拒（'rejected'）則 booking 轉 cancelled。
-- instant / scheduled：'not_required'（預設值，對既有流程零影響）。
--
-- 與 booking status enum 正交，避免動 CHECK 約束、VALID_TRANSITIONS、RPC 硬編碼字串。

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guide_approval_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (guide_approval_status IN ('not_required', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS guide_approval_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guide_approval_note TEXT;

-- 部分索引：導遊「待審核」清單是高頻查詢，只索引 pending 列。
CREATE INDEX IF NOT EXISTS idx_bookings_guide_approval_status
  ON bookings (guide_approval_status)
  WHERE guide_approval_status = 'pending';

COMMENT ON COLUMN bookings.guide_approval_status IS
  'request plan 的導遊審核維度（與 status 正交）：not_required(instant/scheduled) | pending | approved | rejected';
COMMENT ON COLUMN bookings.guide_approval_decided_at IS '導遊做出審核決定（approve/reject）的時間';
COMMENT ON COLUMN bookings.guide_approval_note IS '導遊審核備註（婉拒理由等）';
