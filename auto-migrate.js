#!/usr/bin/env node

/**
 * Auto-execute Supabase migrations directly via PostgreSQL client
 * Bypasses Supabase CLI interactive prompts
 * 
 * Requirements: npm install pg dotenv
 * Usage: node auto-migrate.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Supabase PostgreSQL connection
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pyoderxmpeyqjwkeliiu.supabase.co';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'pyoderxmpeyqjwkeliiu';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5b2RlcnhtcGV5cWp3a2VsaWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzNDQ3MCwiZXhwIjoyMDkwNTEwNDcwfQ.DO0fwNkKCEOvOXERzM9GylmcnorB7RgF7Tt4qo645w4';

// PostgreSQL connection config
const pgConfig = {
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password: SERVICE_ROLE_KEY,
  database: 'postgres',
  ssl: 'require',
  statement_timeout: 30000, // 30s timeout per statement
  application_name: 'auto-migrate'
};

const migrations = [
  '012_guides_storage_bucket.sql',
  '013_activity_images_full_rls.sql'
];

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');

async function executeMigrations() {
  const client = new Client(pgConfig);
  let successCount = 0;
  let failCount = 0;

  try {
    console.log('🚀 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully');
    console.log('');

    for (const migration of migrations) {
      const migrationPath = path.join(migrationsDir, migration);

      if (!fs.existsSync(migrationPath)) {
        console.error(`❌ Migration not found: ${migrationPath}`);
        failCount++;
        continue;
      }

      try {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log(`⏳ Executing: ${migration}`);

        await client.query(sql);

        console.log(`✅ Completed: ${migration}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed: ${migration}`);
        console.error(`   PostgreSQL Error: ${error.code || 'UNKNOWN'}`);
        console.error(`   Message: ${error.message}`);
        failCount++;
      }
    }

  } catch (error) {
    console.error('❌ Connection failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Results: ${successCount} succeeded, ${failCount} failed`);
  console.log('═══════════════════════════════════════');

  process.exit(failCount > 0 ? 1 : 0);
}

executeMigrations();
