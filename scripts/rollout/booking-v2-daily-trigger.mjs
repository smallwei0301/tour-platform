#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`Command failed (${code}): ${command} ${args.join(' ')}`);
  }
}

function parseDateArg(argv) {
  const byFlag = argv.find((a) => a.startsWith('--date='));
  const byEnv = process.env.GO_NOGO_DATE;
  const raw = (byFlag ? byFlag.slice('--date='.length) : byEnv || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Invalid date format: ${raw} (expected YYYY-MM-DD)`);
  }
  return raw;
}

const targetDate = parseDateArg(process.argv.slice(2));
console.log(`[booking-v2-daily-trigger] start date=${targetDate}`);

try {
  run('node', ['scripts/rollout/booking-v2-dashboard.mjs']);
  run('node', ['scripts/rollout/booking-v2-go-no-go.mjs', `--date=${targetDate}`], {
    GO_NOGO_DATE: targetDate,
  });
  console.log('[booking-v2-daily-trigger] done');
} catch (err) {
  console.error('[booking-v2-daily-trigger] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
