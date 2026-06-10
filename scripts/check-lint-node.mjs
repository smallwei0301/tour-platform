#!/usr/bin/env node
/**
 * #1335 — pre-lint Node version guard.
 *
 * `npm run lint` must run on the repo-pinned Node 22 (`.nvmrc`). On Node >=24,
 * ESLint 9.x + `eslint-config-next` (`next/core-web-vitals`) crash with an
 * upstream "Converting circular structure to JSON" error during config load —
 * an environment-only issue (CI uses Node 22 and stays green; the daily bug
 * scanner runs Node 24 and false-reports a lint failure).
 *
 * This guard turns that cryptic crash into an actionable message and fails fast
 * BEFORE ESLint runs. On Node 22 it is a no-op (exit 0), so CI is unaffected.
 *
 * LINT_NODE_MAJOR_OVERRIDE lets the focused test exercise both branches.
 */
const raw = process.env.LINT_NODE_MAJOR_OVERRIDE || process.versions.node;
const major = Number(String(raw).split('.')[0]);

if (Number.isFinite(major) && major >= 24) {
  console.error(`\n[lint] This repo pins Node 22 (.nvmrc); you are on Node ${process.versions.node}.`);
  console.error('[lint] ESLint 9.x + eslint-config-next crash on Node >=24 (upstream "Converting circular structure to JSON").');
  console.error('[lint] Run lint on Node 22 — e.g. `nvm use` (or `nvm install 22`). CI uses Node 22 and stays green.\n');
  process.exit(1);
}
