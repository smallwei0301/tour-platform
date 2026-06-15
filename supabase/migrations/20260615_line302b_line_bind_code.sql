-- line_bind_code: one-time traveler LINE binding codes (#302b traveler binding).
-- Mirrors guide_line_bind_code. The /me console mints a TBIND-XXXXXX code; the
-- traveler sends it to the bot; the webhook consumes it (single-use, delete on
-- redeem) and binds line_user_id ↔ this traveler's user_id / contact_email.
CREATE TABLE IF NOT EXISTS line_bind_code (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_email text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lbc_user_id ON line_bind_code(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lbc_email ON line_bind_code(lower(contact_email)) WHERE contact_email IS NOT NULL;

-- RLS: service_role only (codes are minted + consumed server-side).
ALTER TABLE line_bind_code ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_bind_code: service_role full" ON line_bind_code
  FOR ALL TO service_role USING (true) WITH CHECK (true);
