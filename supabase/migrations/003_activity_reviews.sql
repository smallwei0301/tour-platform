-- ============================================================
-- 003_activity_reviews.sql
-- 旅客評價 table + seed data from fixtures
-- ============================================================

-- 1. Create activity_reviews table
CREATE TABLE IF NOT EXISTS activity_reviews (
  id              text PRIMARY KEY,
  activity_slug   text NOT NULL,
  guide_slug      text NOT NULL,
  author          text NOT NULL,
  city            text,
  rating          integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text     text NOT NULL,
  review_date     date NOT NULL,
  is_verified     boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reviews_activity_slug ON activity_reviews (activity_slug);
CREATE INDEX IF NOT EXISTS idx_reviews_guide_slug ON activity_reviews (guide_slug);
CREATE INDEX IF NOT EXISTS idx_reviews_date ON activity_reviews (review_date DESC);

-- RLS
ALTER TABLE activity_reviews ENABLE ROW LEVEL SECURITY;

-- Public can read reviews
CREATE POLICY "public_read_reviews" ON activity_reviews
  FOR SELECT USING (true);

-- Service role can do everything
CREATE POLICY "service_role_all_reviews" ON activity_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Seed data from fixtures
INSERT INTO activity_reviews (id, activity_slug, guide_slug, author, city, rating, review_text, review_date, is_verified)
VALUES
  ('r1', 'kaohsiung-chaishan-cave-experience', 'andy-lee',      '小美',      '台北',   5, '大人小人都開心😍 Andy 很有耐心，路線比想像中刺激但又很安全！',                                    '2026-03-15', true),
  ('r2', 'kaohsiung-chaishan-cave-experience', 'andy-lee',      'David K.',  '香港',   5, '奇幻的探洞之旅，完全不像在高雄市區旁邊！Andy 的德語解說也很棒。',                                 '2026-03-08', true),
  ('r3', 'kaohsiung-chaishan-cave-experience', 'andy-lee',      '阿翔',      '台中',   5, '謝謝 Andy 的導覽，會想再參加一次。帶小朋友去也很適合。',                                           '2026-02-28', true),
  ('r4', 'kaohsiung-chaishan-cave-experience', 'andy-lee',      '陳老師',    '高雄',   5, '帶學生去的戶外教學，孩子們超興奮，學到很多地質知識。',                                              '2026-02-14', true),
  ('r5', 'dadadaocheng-walk',                  'chen-jian-zhi', 'Vivian C.', '台北',   5, '本來以為只是一般古蹟導覽，沒想到建志帶我們走進了老屋廚房、爬上二樓看迪化街全景。比任何旅遊書都精彩！', '2026-02-14', true),
  ('r6', 'dadadaocheng-walk',                  'chen-jian-zhi', '佐藤太郎',  '東京',   5, '台北最棒的體驗，建志的英語解說非常清楚。強烈推薦！',                                               '2026-01-20', true),
  ('r7', 'hualien-river-trekking',             'lin-a-ming',    '小琪',      '新竹',   5, '人生清單打勾！阿明超專業，全程很安心。花蓮最棒的體驗沒有之一！',                                    '2026-03-01', true),
  ('r8', 'hualien-river-trekking',             'lin-a-ming',    'Mike W.',   'Sydney', 5, 'Best river trekking experience ever! Ming is incredibly professional and fun.', '2026-02-20', true)
ON CONFLICT (id) DO UPDATE SET
  review_text = EXCLUDED.review_text,
  updated_at  = now();
