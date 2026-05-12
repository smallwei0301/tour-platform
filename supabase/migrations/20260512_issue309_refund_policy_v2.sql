-- Issue #309: Refund Policy v2 — config table + order snapshot
BEGIN;

-- refund_policies: versioned config rows, Admin-writable
CREATE TABLE IF NOT EXISTS refund_policies (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text        NOT NULL UNIQUE,          -- e.g. 'v2', 'v2.1'
  tiers          jsonb       NOT NULL,                 -- [{cutoff_hours, refund_pct}]
  reschedule_rules jsonb     NOT NULL DEFAULT '{}',
  force_majeure_rules jsonb  NOT NULL DEFAULT '{}',
  effective_from timestamptz NOT NULL DEFAULT now(),
  is_active      boolean     NOT NULL DEFAULT false,
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Only one active policy at a time
CREATE UNIQUE INDEX IF NOT EXISTS refund_policies_active_unique
  ON refund_policies (is_active) WHERE is_active = true;

-- Add refund_policy_snapshot to orders (stores active policy at order creation time)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_policy_snapshot jsonb;

-- RLS
ALTER TABLE refund_policies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='refund_policies' AND policyname='refund_policies_service_role') THEN
    CREATE POLICY refund_policies_service_role ON refund_policies USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Seed v2 policy (the decided rules from spec)
INSERT INTO refund_policies (version, tiers, reschedule_rules, force_majeure_rules, is_active)
VALUES (
  'v2',
  '[
    {"cutoff_hours": 168, "label": "7d+",    "refund_pct": 100},
    {"cutoff_hours": 72,  "label": "3-7d",   "refund_pct": 70},
    {"cutoff_hours": 0,   "label": "<=72h",  "refund_pct": 0}
  ]'::jsonb,
  '{"max_reschedule": 1, "cutoff_hours": 72, "window_days": 90}'::jsonb,
  '{"eligible": ["government_order", "typhoon", "earthquake", "organizer_cancel"]}'::jsonb,
  true
) ON CONFLICT (version) DO NOTHING;

COMMIT;
