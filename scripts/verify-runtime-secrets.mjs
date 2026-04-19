#!/usr/bin/env node

const profileArg = process.argv.find((a) => a.startsWith('--profile='));
const profile = profileArg ? profileArg.split('=')[1] : 'web-runtime';

const requiredByProfile = {
  'web-runtime': [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ECPAY_MERCHANT_ID',
    'ECPAY_HASH_KEY',
    'ECPAY_HASH_IV',
    'GUIDE_SESSION_SECRET',
  ],
  'ci-baseline': [
    'DISABLE_SENTRY_BUILD',
  ],
};

if (!requiredByProfile[profile]) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(2);
}

const required = requiredByProfile[profile];
const missing = [];

for (const key of required) {
  if (!process.env[key] || String(process.env[key]).trim() === '') {
    missing.push(key);
  }
}

console.log(`Profile: ${profile}`);
console.log(`Required keys: ${required.length}`);
console.log(`Present keys: ${required.length - missing.length}`);

if (missing.length) {
  console.error('Missing keys:');
  for (const m of missing) console.error(`- ${m}`);
  process.exit(1);
}

console.log('✅ runtime secret presence check passed (values not printed)');
