-- Rollback: 001_mvp_core
-- Must drop tables in reverse dependency order: leaf tables first, then parents

-- Drop leaf tables (no FKs pointing to them)
DROP TABLE IF EXISTS order_events CASCADE;
DROP TABLE IF EXISTS payments CASCADE;

-- Drop tables with FK dependencies (in dependency order)
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS experiences CASCADE;
DROP TABLE IF EXISTS guide_profiles CASCADE;

-- Drop root table (no FKs pointing to it)
DROP TABLE IF EXISTS users CASCADE;
