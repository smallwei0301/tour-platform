#!/usr/bin/env node

const env = process.env;
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const projectRef = env.SUPABASE_PROJECT_REF || '';
const projectUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const targetEnv = (env.RESTORE_TARGET_ENV || '').toLowerCase();

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exit(1);
}

function parseRefFromUrl(url) {
  const m = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1].toLowerCase() : '';
}

const derivedRef = parseRefFromUrl(projectUrl);
const effectiveRef = (projectRef || derivedRef).toLowerCase();
const suspectProdWords = ['prod', 'production', 'live'];
const allowedEnv = ['staging', 'staging-restore', 'restore-drill', 'dry-run'];

if (!dryRun && !targetEnv) {
  fail('RESTORE_TARGET_ENV is required unless --dry-run is set.');
}

if (targetEnv && !allowedEnv.includes(targetEnv)) {
  fail(`RESTORE_TARGET_ENV=${targetEnv} is not an allowed non-production target.`);
}

if (suspectProdWords.includes(targetEnv)) {
  fail(`RESTORE_TARGET_ENV=${targetEnv} looks production-like.`);
}

if (effectiveRef && suspectProdWords.some((word) => effectiveRef.includes(word))) {
  fail(`SUPABASE project ref/url (${effectiveRef}) looks production-like.`);
}

if (projectUrl && !/\.supabase\.co/i.test(projectUrl)) {
  fail('SUPABASE_URL is not a valid Supabase project URL.');
}

const summary = {
  mode: dryRun ? 'dry-run' : 'preflight',
  targetEnv: targetEnv || '(unset in dry-run)',
  projectRef: effectiveRef || '(unset)',
  projectUrlPresent: Boolean(projectUrl),
  status: 'PASS'
};

console.log(JSON.stringify(summary, null, 2));
console.log('No restore executed. Safe to proceed only with operator-supplied non-production credentials.');
