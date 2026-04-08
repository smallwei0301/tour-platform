#!/usr/bin/env node

/**
 * Execute Supabase migrations using PostgreSQL connection
 * Usage: node execute-migrations.js
 * 
 * Requires: pg (npm install pg)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Read SQL files
const migration012 = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/012_guides_storage_bucket.sql'),
  'utf8'
);
const migration013 = fs.readFileSync(
  path.join(__dirname, 'supabase/migrations/013_activity_images_full_rls.sql'),
  'utf8'
);

// PostgreSQL connection using Supabase
const client = new Client({
  host: 'db.pyoderxmpeyqjwkeliiu.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'tour-platform-prod-2025',  // ⚠️ Should use env var in production
  ssl: { rejectUnauthorized: false },
});

async function executeMigration(name, sql) {
  console.log(`\n⏳ Executing: ${name}`);
  
  try {
    // Split by statements and execute each one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    for (const statement of statements) {
      await client.query(statement);
    }

    console.log(`✅ ${name} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message);
    return false;
  }
}

async function recordMigrations() {
  console.log('\n⏳ Recording migrations in schema_migrations');
  
  const recordSql = `
    INSERT INTO schema_migrations (version, name, statements) VALUES
      (12, '012_guides_storage_bucket', 'Executed via Node.js'),
      (13, '013_activity_images_full_rls', 'Executed via Node.js')
    ON CONFLICT DO NOTHING;
  `;

  try {
    await client.query(recordSql);
    console.log(`✅ Recorded in schema_migrations`);
    return true;
  } catch (error) {
    console.warn(`⚠️ Recording skipped: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🚀 Executing Supabase Migrations (012 & 013)');
  console.log('════════════════════════════════════════════════════════════════');

  try {
    await client.connect();
    console.log('✅ Connected to Supabase database');

    const result012 = await executeMigration('012_guides_storage_bucket.sql', migration012);
    const result013 = await executeMigration('013_activity_images_full_rls.sql', migration013);

    if (result012 && result013) {
      await recordMigrations();
      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('✅ All migrations executed successfully!');
      console.log('\nVerify in Supabase Dashboard:');
      console.log('  • Storage → Check guides & activity-images buckets');
      console.log('  • Database → schema_migrations → Check versions 12 & 13');
      console.log('════════════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n════════════════════════════════════════════════════════════════');
      console.log('❌ Some migrations failed');
      console.log('════════════════════════════════════════════════════════════════\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

