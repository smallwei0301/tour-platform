#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const forbiddenFiles = [/\.env\.local$/i, /\.env\.production/i, /credentials\/.+\.env$/i];
const forbiddenValuePatterns = [
  /\bsbp_[a-z0-9]{20,}\b/i, // Supabase management token
  /\bre_[A-Za-z0-9_]{20,}\b/, // Resend API key
  /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/, // Google client secret format
  /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];

const findings = [];

for (const file of files) {
  if (forbiddenFiles.some((re) => re.test(file))) {
    findings.push(`[file] tracked forbidden secret file: ${file}`);
    continue;
  }

  let content = '';
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const re of forbiddenValuePatterns) {
    if (re.test(content)) {
      findings.push(`[content] ${file} matched ${re}`);
      break;
    }
  }
}

if (findings.length) {
  console.error('❌ Secret scan failed:');
  for (const line of findings) console.error(` - ${line}`);
  process.exit(1);
}

console.log('✅ Secret scan passed.');
