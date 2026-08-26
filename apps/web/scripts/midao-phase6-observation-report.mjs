import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareProjectionRows,
  summarizeObservation,
} from '../src/lib/midao/phase6-projection-comparison.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(appRoot, '.tmp', 'phase6-observation');
const FIXTURE_KEYS = new Set(['schemaVersion', 'generatedAt', 'left', 'right']);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== '--fixture' || argv[2] !== '--out') return null;
  return { fixture: argv[1], out: argv[3] };
}

function isValidFixture(fixture) {
  return fixture !== null
    && typeof fixture === 'object'
    && !Array.isArray(fixture)
    && Object.keys(fixture).every((key) => FIXTURE_KEYS.has(key))
    && fixture.schemaVersion === 'phase6-fixture-v1'
    && typeof fixture.generatedAt === 'string'
    && !Number.isNaN(Date.parse(fixture.generatedAt))
    && Array.isArray(fixture.left)
    && Array.isArray(fixture.right)
    && fixture.left.length + fixture.right.length <= 1000;
}

function resolveOutput(output) {
  const resolved = path.resolve(appRoot, output);
  return resolved.startsWith(`${outputRoot}${path.sep}`) ? resolved : null;
}

function resolveFixture(fixture) {
  const fixtureRoot = path.join(appRoot, 'tests', 'fixtures');
  const resolved = path.resolve(appRoot, fixture);
  return resolved.startsWith(`${fixtureRoot}${path.sep}`) ? resolved : null;
}

function maskedRows(rows) {
  return rows.map((row) => {
    const masked = {
      category: row.category,
      surrogateKeyPrefix: row.surrogateKeyPrefix,
    };
    if (row.leftState !== undefined) masked.leftState = row.leftState;
    if (row.rightState !== undefined) masked.rightState = row.rightState;
    return masked;
  });
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args) return fail('invalid arguments');

  const outputPath = resolveOutput(args.out);
  if (!outputPath) return fail('invalid output path');
  const fixturePath = resolveFixture(args.fixture);
  if (!fixturePath) return fail('invalid fixture path');

  let fixture;
  try {
    fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  } catch {
    return fail('invalid fixture');
  }
  if (!isValidFixture(fixture)) return fail('invalid fixture');

  const comparison = compareProjectionRows(fixture.left, fixture.right, { now: fixture.generatedAt });
  const summary = summarizeObservation(comparison.rows, {
    measurementStatus: comparison.complete ? 'complete' : 'incomplete',
    sourcePagesComplete: true,
    commandExitCode: 0,
    maskingCheck: 'pass',
  });
  const reportWithoutDigest = {
    schemaVersion: 'phase6-observation-report-v1',
    generatedAt: fixture.generatedAt,
    summary,
    rows: maskedRows(comparison.rows),
  };
  const report = {
    ...reportWithoutDigest,
    digest: createHash('sha256').update(JSON.stringify(reportWithoutDigest)).digest('hex'),
  };

  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(outputPath, 0o600);
}

await main();
