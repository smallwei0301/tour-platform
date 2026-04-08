#!/usr/bin/env node

/**
 * Supabase Migrations Runner
 * Executes SQL migrations 012 and 013 using Supabase REST API
 * 
 * Usage: node scripts/run-migrations.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const SUPABASE_URL = 'https://pyoderxmpeyqjwkeliiu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5b2RlcnhtcGV5cWp1a2VsaWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzNDQ3MCwiZXhwIjoyMDkwNTEwNDcwfQ.DO0fwNkQCEOvOXERzM9GylmcnorB7RgF7Tt4qo645w4';

const migrations = [
  'supabase/migrations/012_guides_storage_bucket.sql',
  'supabase/migrations/013_activity_images_full_rls.sql',
];

/**
 * Execute SQL via Supabase REST API
 */
async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/postgres_query`);
    const payload = JSON.stringify({ query: sql });

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Run all migrations
 */
async function runMigrations() {
  console.log('🚀 Starting Supabase Migrations Execution\n');
  console.log(`Project: pyoderxmpeyqjwkeliiu`);
  console.log(`URL: ${SUPABASE_URL}\n`);

  const results = [];

  for (const migrationFile of migrations) {
    const filePath = path.join(process.cwd(), migrationFile);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${migrationFile}`);
      results.push({
        migration: migrationFile,
        status: 'FAIL',
        error: 'File not found',
      });
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`▶️  Executing: ${migrationFile}`);
    console.log(`   SQL size: ${sql.length} bytes`);

    try {
      const response = await executeSql(sql);
      
      if (response.statusCode === 200 || response.statusCode === 201) {
        console.log(`✅ PASS (HTTP ${response.statusCode})\n`);
        results.push({
          migration: migrationFile,
          status: 'PASS',
          statusCode: response.statusCode,
        });
      } else {
        console.log(`❌ FAIL (HTTP ${response.statusCode})`);
        console.log(`   Response: ${response.body}\n`);
        results.push({
          migration: migrationFile,
          status: 'FAIL',
          statusCode: response.statusCode,
          response: response.body,
        });
      }
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}\n`);
      results.push({
        migration: migrationFile,
        status: 'ERROR',
        error: error.message,
      });
    }
  }

  // Summary
  console.log('=== Execution Summary ===\n');
  console.table(results.map(r => ({
    Migration: r.migration.split('/').pop(),
    Status: r.status,
    'HTTP Code': r.statusCode || '—',
  })));

  const allPassed = results.every(r => r.status === 'PASS');
  console.log(`\n${allPassed ? '✅ All migrations executed successfully!' : '❌ Some migrations failed. Check logs above.'}`);
  
  process.exit(allPassed ? 0 : 1);
}

// Run
runMigrations().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
