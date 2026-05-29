import { readFileSync, existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const WORKFLOW_PATH = path.resolve(REPO_ROOT, '.github/workflows/booking-plan-repair.yml');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/admin/audit-or-repair-booking-plans.mjs');
const ROOT_PACKAGE_JSON = path.resolve(REPO_ROOT, 'package.json');

describe('GH-905 booking-plan-repair workflow presence and safety', () => {
  it('workflow file exists at the documented path', () => {
    assert.ok(
      existsSync(WORKFLOW_PATH),
      'Expected .github/workflows/booking-plan-repair.yml to exist (issue #905)',
    );
  });

  it('underlying repair script exists (delivered by PR #894)', () => {
    assert.ok(existsSync(SCRIPT_PATH), 'Expected the audit-or-repair-booking-plans.mjs script to exist');
  });

  it('npm alias repair:booking-plans:dry-run is still defined in package.json', () => {
    const pkg = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'));
    assert.ok(
      pkg.scripts && typeof pkg.scripts['repair:booking-plans:dry-run'] === 'string',
      'Expected root package.json to define repair:booking-plans:dry-run',
    );
  });

  it('workflow has workflow_dispatch trigger', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /workflow_dispatch:/);
  });

  it('workflow has NO schedule trigger (repair must never auto-run)', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.doesNotMatch(src, /^\s*schedule:/m);
    assert.doesNotMatch(src, /cron:/);
  });

  it('workflow references the repair script', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /scripts\/admin\/audit-or-repair-booking-plans\.mjs/);
  });

  it('workflow injects both required Supabase secrets', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /SUPABASE_URL:\s*\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}/);
    assert.match(src, /SUPABASE_SERVICE_ROLE_KEY:\s*\$\{\{\s*secrets\.SUPABASE_SERVICE_ROLE_KEY\s*\}\}/);
  });

  it('workflow has a HOLD path when secrets are missing', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /HOLD/);
    assert.match(src, /check-secrets/);
  });

  it('workflow defaults to DRY-RUN (apply input default = "false")', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /apply:[\s\S]*?default:\s*'false'/);
  });

  it('workflow apply path is triple-gated (apply=true + confirm=APPLY + script env)', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    // Workflow-level gates: apply == 'true' AND confirm == 'APPLY'
    assert.match(src, /INPUT_APPLY"?\s*=\s*"true"/);
    assert.match(src, /INPUT_CONFIRM"?\s*=\s*"APPLY"/);
    // Script-level gates carried through to the apply step
    assert.match(src, /ISSUE883_REPAIR_ALLOW_APPLY:\s*'1'/);
    assert.match(src, /APPLY:\s*'1'/);
    assert.match(src, /--yes/);
  });

  it('workflow uses Node 22 (matches .nvmrc + engines pin)', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /node-version:\s*'22'/);
  });

  it('workflow uploads the dry-run report artifact', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /actions\/upload-artifact@v4/);
    assert.match(src, /booking-plan-repair-dry-run-\*/);
  });

  it('workflow writes a step summary with run mode and actionable count', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    assert.match(src, /GITHUB_STEP_SUMMARY/);
    assert.match(src, /actionableCount/);
  });

  it('workflow never echoes raw secret values', () => {
    const src = readFileSync(WORKFLOW_PATH, 'utf-8');
    // Sanity: secret values only appear via the secrets.X reference, never echoed.
    assert.doesNotMatch(src, /echo\s+["'][^"']*\$\{\{\s*secrets\./);
  });
});
