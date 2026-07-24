#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_SECTIONS, validateRawCatalog } from './extract-catalog.mjs';

const UNSTABLE_KEYS = new Set([
  'oid', 'objectAddress', 'statistics', 'rowCount', 'sequenceValue', 'timestamp',
  'capturedAt', 'runtimeState',
]);

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeRoutineBody(definition) {
  if (typeof definition !== 'string' || definition.length === 0) throw new Error('routine definition missing');
  const lines = definition.replace(/\r\n?/gu, '\n').split('\n').map((line) => line.trimEnd());
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines.at(-1) === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort(compareCodeUnits)) {
    if (!UNSTABLE_KEYS.has(key)) output[key] = sanitize(value[key]);
  }
  return output;
}

function normalizeEntry(section, entry) {
  const routineLike = section === 'routines' || (section === 'managedSchemaOverlays' && entry.overlayKind === 'routine');
  const output = sanitize(entry);
  if (routineLike) {
    const body = normalizeRoutineBody(entry.definition);
    delete output.definition;
    output.bodySha256 = createHash('sha256').update(body).digest('hex');
  }
  return sanitize(output);
}

export function normalizeCatalog(rawCatalog) {
  const raw = validateRawCatalog(rawCatalog);
  const normalizedSections = {};
  for (const section of CATALOG_SECTIONS) {
    normalizedSections[section] = raw.sections[section]
      .map((entry) => normalizeEntry(section, entry))
      .sort((left, right) => compareCodeUnits(left.canonicalKey, right.canonicalKey));
  }
  const normalized = {
    schemaVersion: 1,
    normalizerVersion: 1,
    extractorVersion: raw.extractorVersion,
    serverMajorVersion: Math.trunc(raw.serverVersionNum / 10_000),
    sections: normalizedSections,
  };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write('Usage: normalize-catalog.mjs --input <raw.json>\n');
    return;
  }
  const input = value(args, '--input');
  if (!input || args.length !== 2) throw new Error('normalizer requires exact --input');
  const raw = JSON.parse(await readFile(input, 'utf8'));
  process.stdout.write(normalizeCatalog(raw));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`catalog normalizer: ${error.message}\n`);
    process.exitCode = 1;
  });
}
