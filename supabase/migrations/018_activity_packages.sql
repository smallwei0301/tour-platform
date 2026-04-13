-- Migration: Activity Packages
-- Description: Add activity packages and package-activity relationships

CREATE TABLE IF NOT EXISTS activity_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'TWD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES activity_packages(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(package_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_packages_is_active ON activity_packages(is_active);
CREATE INDEX IF NOT EXISTS idx_package_activities_package_id ON package_activities(package_id);
CREATE INDEX IF NOT EXISTS idx_package_activities_activity_id ON package_activities(activity_id);

ALTER TABLE activity_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity packages are viewable by everyone" ON activity_packages FOR SELECT USING (true);
CREATE POLICY "Activity packages are manageable by authenticated users" ON activity_packages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Package activities are viewable by everyone" ON package_activities FOR SELECT USING (true);
CREATE POLICY "Package activities are manageable by authenticated users" ON package_activities FOR ALL USING (auth.role() = 'authenticated');

CREATE TRIGGER update_activity_packages_updated_at BEFORE UPDATE ON activity_packages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
