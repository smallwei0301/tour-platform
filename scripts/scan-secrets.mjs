#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const EXCLUDES = [
  /^apps\/web\/\.env\.example$/,
  /^apps\/web\/\.env\.local$/,
  /^apps\/web\/app\/admin\/unauthorized\/page\.tsx$/,
  /^apps\/web\/e2e\//,
  /^.*\.md$/,
  /^.*\/fixtures\//,
  /^.*\/__snapshots__\//,
];

const PATTERNS = [
  { name: 'GitHub PAT', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'Google OAuth secret-like', re: /GOCSPX[-_A-Za-z0-9]{10,}/g },
  { name: 'Resend API key', re: /\bre_[A-Za-z0-9]{12,}/g },
  { name: 'Supabase personal token', re: /\bsbp_[A-Za-z0-9]{20,}/g },
  { name: 'Private key header', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    name: 'Hardcoded service role key assignment',
    re: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!\s*(?:process\.env|['\"]?your[-_]|['\"]?\*{3}))["'`]?[^\s"'`]{16,}/g,
  },
  {
    name: 'Hardcoded admin access token assignment',
    re: /ADMIN_ACCESS_TOKEN\s*=\s*(?!\s*(?:process\.env|['\"]?your[-_]|['\"]?test-token-123|['\"]?\*{3}))["'`]?[^\s"'`]{16,}/g,
  },
];

function shouldSkip(path) {
  return EXCLUDES.some((re) => re.test(path));
}

let files = [];
try {
  files = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !shouldSkip(p));
} catch (e) {
  console.error('Failed to list tracked files', e.message);
  process.exit(2);
}

const findings = [];
for (const file of files) {
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  // ignore obvious placeholders in examples/docs
  const normalized = content.replace(/your[-_][A-Za-z0-9_-]+/gi, '');

  for (const p of PATTERNS) {
    const matches = normalized.match(p.re);
    if (matches && matches.length) {
      findings.push({ file, pattern: p.name, count: matches.length });
    }
  }
}

if (!findings.length) {
  console.log('✅ secrets scan passed (no high-confidence secrets detected)');
  process.exit(0);
}

console.error('❌ secrets scan failed:');
for (const f of findings) {
  console.error(`- ${f.file} | ${f.pattern} | matches=${f.count}`);
}
process.exit(1);
