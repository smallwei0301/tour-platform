import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const web = fileURLToPath(new URL('../..', import.meta.url));
const domain = resolve(web, 'src/lib/midao');
const gateways = ['db-midao-booking-confirmations.mjs', 'db-midao-traveler-confirmation.mjs'];
const owner = resolve(domain, 'confirmation-runtime.mjs');
const entries = [...gateways.map(p => resolve(domain, p)), owner,
  resolve(domain, 'confirmation-conversion-policy.mjs'), resolve(domain, 'confirmation-runtime-errors.mjs')];
const configFile = ts.readConfigFile(resolve(web, 'tsconfig.json'), ts.sys.readFile);
assert.equal(configFile.error, undefined);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, web);
const graph = new Map();

function walk(file) {
  if (graph.has(file)) return;
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const dependencies = [];
  const add = (specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return; // package/builtin leaf
    const direct = resolve(dirname(file), specifier);
    const dependency = specifier.startsWith('.') && existsSync(direct) && /\.(mjs|ts|tsx)$/.test(direct)
      ? direct : ts.resolveModuleName(specifier, file, config.options, ts.sys).resolvedModule?.resolvedFileName;
    assert.ok(dependency, `Unresolved local import: ${relative(web, file)} -> ${specifier}`);
    assert.match(dependency, /\.(mjs|ts|tsx)$/);
    dependencies.push(resolve(dependency));
  };
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!node.importClause?.isTypeOnly && !node.isTypeOnly) add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.equal(node.arguments.length, 1, `Unexpected dynamic import in ${file}`);
      assert.ok(ts.isStringLiteralLike(node.arguments[0]), `Nonliteral dynamic import in ${file}`);
      add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source); graph.set(file, dependencies);
  dependencies.forEach(walk);
}

test('confirmation import closure has no ESM cycle and owner never points back to a gateway', t => {
  entries.forEach(walk);
  const completed = new Set(), path = [];
  function check(file) {
    assert.ok(!path.includes(file), `ESM cycle: ${[...path, file].map(p => relative(web, p)).join(' -> ')}`);
    if (completed.has(file)) return;
    path.push(file); graph.get(file).forEach(check); path.pop(); completed.add(file);
  }
  entries.forEach(check);
  const ownerClosure = new Set();
  function collect(file) { if (ownerClosure.has(file)) return; ownerClosure.add(file); graph.get(file).forEach(collect); }
  collect(owner);
  for (const gateway of gateways) assert.equal(ownerClosure.has(resolve(domain, gateway)), false);
  t.diagnostic(`parsed ${graph.size} local modules; owner closure ${ownerClosure.size}`);
});

test('fresh canonical Node process imports both gateways and owner', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'DATABASE_URL', 'DIRECT_URL']) delete env[key];
  const imports = entries.map(file => `await import(${JSON.stringify(new URL(`file://${file}`).href)});`).join('\n');
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e',
    `globalThis.fetch = async () => { throw new Error('Unexpected network'); };\n${imports}`], { env, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stdout + child.stderr);
});
