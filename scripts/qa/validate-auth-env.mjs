#!/usr/bin/env node
import { validateStartupEnv } from '../../apps/web/src/config/startup-env.mjs';

const args = new Set(process.argv.slice(2));
const targetArg = process.argv.slice(2).find((arg) => arg.startsWith('--target='));
const target = (targetArg?.split('=')[1] || process.env.VERCEL_ENV || process.env.NODE_ENV || 'production').trim();

function hasValue(value) {
  return String(value || '').trim().length > 0;
}

function isValidUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function masked(value) {
  const raw = String(value || '');
  if (!raw) return '(missing)';
  if (raw.length <= 8) return `${raw.slice(0, 2)}***`;
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function add(result, ok, key, message, detail = '') {
  result.push({ ok, key, message, detail });
}

const envForStartup = {
  ...process.env,
  NODE_ENV: target === 'development' ? 'development' : 'production',
  VERCEL_ENV: target,
};
const startup = validateStartupEnv(envForStartup);
const checks = [];

for (const item of startup.errors) {
  add(checks, false, item.key, item.reason, item.envScope);
}
if (startup.ok) {
  add(checks, true, 'startup-env', `startup env profile ${startup.profile} is valid`);
}

for (const key of ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  if (!hasValue(process.env[key])) {
    add(checks, false, key, 'required for QA login parity with deployed environments');
  } else {
    add(checks, isValidUrl(process.env[key]), key, 'must be a valid http(s) URL', masked(process.env[key]));
  }
}

for (const key of ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  add(checks, hasValue(process.env[key]), key, 'required for Supabase-backed admin/guide login checks', masked(process.env[key]));
}

const adminToken = String(process.env.ADMIN_ACCESS_TOKEN || '').trim();
const qaAdminToken = String(process.env.QA_ADMIN_TOKEN || '').trim();
const qaAdminEmail = String(process.env.QA_ADMIN_EMAIL || '').trim().toLowerCase();
const allowlist = String(process.env.ADMIN_EMAIL_ALLOWLIST || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

add(checks, adminToken.length >= 16, 'ADMIN_ACCESS_TOKEN', 'admin login token must be >=16 chars', masked(adminToken));
add(checks, qaAdminToken.length >= 16, 'QA_ADMIN_TOKEN', 'QA admin test token must be provided locally', masked(qaAdminToken));
add(checks, !qaAdminToken || qaAdminToken === adminToken, 'QA_ADMIN_TOKEN', 'must match ADMIN_ACCESS_TOKEN for admin login smoke tests');
add(checks, hasValue(qaAdminEmail), 'QA_ADMIN_EMAIL', 'QA admin email is required');
if (allowlist.length > 0 && qaAdminEmail) {
  add(checks, allowlist.includes(qaAdminEmail), 'ADMIN_EMAIL_ALLOWLIST', 'must include QA_ADMIN_EMAIL', qaAdminEmail);
}

const guideSecret = String(process.env.GUIDE_SESSION_SECRET || '').trim();
const guideEmail = String(process.env.QA_GUIDE_EMAIL || '').trim();
const guidePassword = String(process.env.QA_GUIDE_PASSWORD || '');
const guideInviteToken = String(process.env.QA_GUIDE_INVITE_TOKEN || '').trim();
const guideId = String(process.env.QA_GUIDE_ID || '').trim();

add(checks, guideSecret.length >= 32, 'GUIDE_SESSION_SECRET', 'guide session secret must be >=32 chars', masked(guideSecret));
add(checks, hasValue(guideEmail) || hasValue(guideId) || hasValue(guideInviteToken), 'QA_GUIDE_EMAIL/ID/INVITE', 'provide a QA guide login identifier');
add(checks, guidePassword.length >= 6, 'QA_GUIDE_PASSWORD', 'QA guide password must be >=6 chars');

if (hasValue(process.env.VERCEL_TOKEN)) {
  add(checks, String(process.env.VERCEL_TOKEN).startsWith('vcp_'), 'VERCEL_TOKEN', 'Vercel token is present locally and has expected prefix', masked(process.env.VERCEL_TOKEN));
} else if (args.has('--require-vercel-token')) {
  add(checks, false, 'VERCEL_TOKEN', 'required by --require-vercel-token');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? '✅' : '❌';
  const detail = check.detail ? ` (${check.detail})` : '';
  console.log(`${prefix} ${check.key}: ${check.message}${detail}`);
}

if (failed.length > 0) {
  console.error(`\nAuth env validation failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log('\nAuth env validation passed.');
