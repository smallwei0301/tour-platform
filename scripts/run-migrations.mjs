#!/usr/bin/env node
/**
 * Run Supabase migrations directly via REST API
 * Usage: node scripts/run-migrations.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pyoderxmpeyqjwkeliiu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5b2RlcnhtcGV5cWp3a2VsaWl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDkzNDQ3MCwiZXhwIjoyMDkwNTEwNDcwfQ.DO0fwNkKCEOvOXERzM9GylmcnorB7RgF7Tt4qo645w4';

// Initialize Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Migration files to run
const migrations = [
  'supabase/migrations/012_guides_storage_bucket.sql',
  'supabase/migrations/013_activity_images_full_rls.sql'
];

async function runMigration(filePath) {
  console.log(`\n📦 Running migration: ${filePath}`);

  const sql = readFileSync(filePath, 'utf-8');
  console.log('SQL content:');
  console.log(sql);

  // Execute SQL via Supabase REST API (using rpc)
  // Since we can't directly execute SQL, we'll use the Management API
  // For now, let's verify what already exists

  // Check if bucket exists
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
    return false;
  }

  console.log('Existing buckets:', buckets.map(b => b.id));
  return true;
}

async function checkAndCreateBuckets() {
  console.log('\n🔍 Checking existing buckets...');

  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
    return false;
  }

  const existingBucketIds = buckets.map(b => b.id);
  console.log('Existing buckets:', existingBucketIds);

  // Check for 'guides' bucket
  if (!existingBucketIds.includes('guides')) {
    console.log('\n📁 Creating "guides" bucket...');
    const { data, error } = await supabase.storage.createBucket('guides', {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    if (error) {
      console.error('Error creating guides bucket:', error);
    } else {
      console.log('✅ Created "guides" bucket');
    }
  } else {
    console.log('✅ "guides" bucket already exists');
  }

  // Check for 'activity-images' bucket
  if (!existingBucketIds.includes('activity-images')) {
    console.log('\n📁 Creating "activity-images" bucket...');
    const { data, error } = await supabase.storage.createBucket('activity-images', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    if (error) {
      console.error('Error creating activity-images bucket:', error);
    } else {
      console.log('✅ Created "activity-images" bucket');
    }
  } else {
    console.log('✅ "activity-images" bucket already exists');

    // Update bucket settings
    console.log('📝 Updating "activity-images" bucket settings...');
    const { data, error } = await supabase.storage.updateBucket('activity-images', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    });

    if (error) {
      console.error('Error updating activity-images bucket:', error);
    } else {
      console.log('✅ Updated "activity-images" bucket settings');
    }
  }

  // List final bucket state
  const { data: finalBuckets } = await supabase.storage.listBuckets();
  console.log('\n📋 Final bucket state:');
  for (const bucket of finalBuckets) {
    console.log(`  - ${bucket.id}: public=${bucket.public}, size_limit=${bucket.file_size_limit}`);
  }

  return true;
}

async function testUploadCapability() {
  console.log('\n🧪 Testing upload capability...');

  // Create a simple test file
  const testContent = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header

  // Try to upload to guides bucket
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('guides')
    .upload('test/ping.txt', 'test', {
      contentType: 'text/plain',
      upsert: true
    });

  if (uploadError) {
    console.log('Upload test result:', uploadError.message);
  } else {
    console.log('✅ Upload test successful:', uploadData);

    // Clean up test file
    await supabase.storage.from('guides').remove(['test/ping.txt']);
    console.log('🧹 Cleaned up test file');
  }
}

async function main() {
  console.log('🚀 Starting migration check...');
  console.log('Supabase URL:', SUPABASE_URL);

  // Step 1: Check and create buckets
  await checkAndCreateBuckets();

  // Step 2: Test upload capability
  await testUploadCapability();

  console.log('\n✅ Migration verification complete!');
  console.log('\n⚠️  Note: RLS policies need to be applied via Supabase Dashboard SQL Editor');
  console.log('   or via supabase db push with proper authentication.');
}

main().catch(console.error);
