import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = readFileSync(join(root, '.github/workflows/e2e-smoke.yml'), 'utf8');
const steps = workflow.split(/^      - name: /m).slice(1);
const supplemental = steps.filter(step => step.startsWith('Supplemental ordinary CI - '));
const specs = ['issue1882-upcoming-schedules.spec.ts', 'issue1882-policy-display.spec.ts'];
const outputs = ['test-results/issue1882-upcoming', 'test-results/issue1882-policy'];
const body = step => step.split('        run: |\n')[1].split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n');

test('supplemental browser checks stay sequential in the existing ordinary smoke job', () => {
  assert.equal(supplemental.length, 2);
  assert.equal((workflow.match(/^  [a-z][\w-]*:\n    runs-on:/gm) || []).length, 1);
  for (const [index, step] of supplemental.entries()) {
    assert.match(step, /timeout-minutes: 6/);
    assert.ok(body(step).endsWith(`npm run test:e2e -w @tour/web -- e2e/${specs[index]} --output=${outputs[index]}`));
    assert.doesNotMatch(step, /continue-on-error|tp-node22|\/root\/\.hermes|PW_EXECUTABLE_PATH|sudo|apt-get|npm install|playwright install/);
  }
  assert.match(supplemental[0], /id: supplemental_upcoming/);
  assert.match(supplemental[1], /!cancelled\(\).*steps\.supplemental_upcoming\.outcome == 'success'.*steps\.supplemental_upcoming\.outcome == 'failure'/);
  assert.match(workflow, /does not replace canonical host E2E evidence or clear its HOLD/);
  assert.match(workflow, /run: npm run test:e2e:smoke -w @tour\/web/);
  assert.match(workflow, /apps\/web\/test-results\//, 'retain both isolated supplemental outputs on failure');
  assert.doesNotMatch(workflow, /secrets\.|SUPABASE_SERVICE_ROLE_KEY|ECPAY_HASH/);
});

test('supplement does not change reviewed spec, config, diagnostics or classifier bytes', () => {
  const pins = {
    'apps/web/e2e/issue1882-upcoming-schedules.spec.ts': 'fe504f49691b742148c541bd840de4bd3ae7b591ed5c39680d8a7ee8c1ff71d7',
    'apps/web/e2e/issue1882-policy-display.spec.ts': '99fba043ec8c1eeed0177e2019157517cb76a0b416bb52874b93dd834b8ec806',
    'apps/web/playwright.config.ts': '5ed491b3fb5575672a98ac4e20d9cc235a8883e9f1c11cc33bc03157b3e9eba5',
    'scripts/testing/fixture-child-diagnostics.mjs': 'e586c4349c72703fbc15df9455012fcd75677f07ffc42d252a29972dbce89b52',
    'scripts/testing/policy-fixture-network.mjs': '4ff5249fea6a7127be513ab97a5ca4795c3167854c1140d50db42a6050a81aa3',
  };
  for (const [path, digest] of Object.entries(pins)) {
    assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), digest, path);
  }
});

for (const [index, spec] of specs.entries()) {
  test(`ordinary CI shell isolates environment and cleans owned configs: ${spec}`, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'issue1882-ci-contract-'));
    try {
      const bin = join(temporary, 'bin');
      const home = join(temporary, 'home');
      mkdirSync(bin);
      mkdirSync(join(home, '.cache/ms-playwright'), { recursive: true });
      mkdirSync(join(temporary, 'apps/web'), { recursive: true });
      symlinkSync(process.execPath, join(bin, 'node'));
      // A sentinel only: never invokes Playwright, a browser, network or a DB.
      writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf "ARG:%s\\n" "$@"\n/usr/bin/env\ntest -f "$npm_config_userconfig" && test ! -s "$npm_config_userconfig"\ntest -f "$npm_config_globalconfig" && test ! -s "$npm_config_globalconfig"\ntest "$npm_config_userconfig" != "$npm_config_globalconfig"\nexit 17\n', { mode: 0o755 });
      const script = body(supplemental[index]);
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
        cwd: temporary, encoding: 'utf8', timeout: 10_000,
        env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, GUIDE_SESSION_SECRET: 'must-not-leak', ADMIN_ACCESS_TOKEN: 'must-not-leak', SUPABASE_SERVICE_ROLE_KEY: 'must-not-leak', NODE_OPTIONS: '--definitely-invalid', PW_EXECUTABLE_PATH: '/wrong/browser', CI: '1', npm_config_registry: 'https://invalid.example' },
      });
      assert.equal(result.status, 17, result.stderr);
      assert.deepEqual(result.stdout.split('\n').filter(line => line.startsWith('ARG:')), ['run', 'test:e2e', '-w', '@tour/web', '--', `e2e/${spec}`, `--output=${outputs[index]}`].map(value => `ARG:${value}`));
      assert.doesNotMatch(result.stdout, /must-not-leak|NODE_OPTIONS=|PW_EXECUTABLE_PATH=|CI=|npm_config_registry=/);
      assert.match(result.stdout, /PLAYWRIGHT_NO_WEBSERVER=1/);
      assert.match(result.stdout, /npm_config_offline=true/);
      assert.match(result.stdout, /npm_config_ignore_scripts=true/);
      assert.ok(result.stdout.includes(`PLAYWRIGHT_BROWSERS_PATH=${home}/.cache/ms-playwright`));
      const cache = result.stdout.match(/^npm_config_cache=(.+)$/m)?.[1];
      assert.ok(cache);
      assert.equal(existsSync(cache), false, 'nonzero npm exit must still clean owned configs');
      writeFileSync(join(temporary, '.npmrc'), 'registry=https://invalid.example\n');
      const rejected = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], { cwd: temporary, encoding: 'utf8', timeout: 10_000, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home } });
      assert.notEqual(rejected.status, 0);
      assert.doesNotMatch(rejected.stdout, /ARG:/, 'repository npmrc must stop before npm');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
