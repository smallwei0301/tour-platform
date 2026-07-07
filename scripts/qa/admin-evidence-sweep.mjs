#!/usr/bin/env node
/**
 * Tour Platform admin QA deterministic evidence scanner.
 *
 * This script intentionally does not certify product behavior. It gathers current
 * repo and GitHub facts into a manifest so Rita/reviewers can judge evidence
 * quality without redoing mechanical searches.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SKIP_DIRS = new Set([
  '.git', '.next', '.turbo', '.vercel', '.worktrees', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'dist', 'build',
]);
const TEXT_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.sql', '.yml', '.yaml']);

const SURFACES = {
  'admin-booking-v2': {
    label: 'Admin booking / v2 POS',
    description: 'v2 admin/POS booking, order, payment, and refund evidence sweep.',
    keywords: ['booking', 'bookings', 'order', 'orders', 'pos', 'refund', 'payment'],
    apiRoots: ['apps/web/app/api/v2/admin', 'apps/web/app/api/v2/bookings'],
    legacyRoots: ['apps/web/app/api/admin/orders', 'apps/web/app/api/admin/refund-requests'],
    uiRoots: ['apps/web/app', 'apps/web/src'],
    testRoots: ['apps/web/tests', 'apps/web/e2e', 'tests'],
    githubQueries: ['admin booking', 'booking v2', 'v2 POS', 'admin POS', 'refund request', 'partial refund'],
  },
  'admin-availability-v2': {
    label: 'Admin availability / guide schedule v2',
    description: 'v2 admin guide availability, rules, previews, openings, blackout, and conflict override evidence sweep.',
    keywords: ['availability', 'available-slots', 'availability-rules', 'conflict', 'override', 'opening', 'blackout', 'schedule', 'season'],
    apiRoots: ['apps/web/app/api/v2/admin/guides', 'apps/web/app/api/v2/activities'],
    legacyRoots: ['apps/web/app/api/guide/availability-rules', 'apps/web/app/api/guide/availability-preview'],
    uiRoots: ['apps/web/app', 'apps/web/src'],
    testRoots: ['apps/web/tests', 'apps/web/e2e', 'tests'],
    githubQueries: ['admin availability', 'availability rules', 'conflict override', 'single-day opening', 'blackout'],
  },
};

function usage() {
  console.log(`Usage:
  node scripts/qa/admin-evidence-sweep.mjs [options]

Options:
  --surface <name>       Surface to scan. Default: admin-booking-v2
                         Known: ${Object.keys(SURFACES).join(', ')}
  --keyword <word>       Extra keyword. Can repeat.
  --repo <path>          Repo root. Default: current working directory
  --output <path>        Manifest JSON path. Default: /tmp/wf_tp_admin_<surface>/<run-id>/manifest.json
  --report <path>        Markdown report path. Default: alongside manifest as report.md
  --no-github            Skip gh issue/PR lookup
  --github-limit <n>     Max issue/PR records per query. Default: 8
  --max-file-bytes <n>   Max text bytes read per file. Default: 250000
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = {
    surface: 'admin-booking-v2',
    keywords: [],
    repo: process.cwd(),
    output: '',
    report: '',
    github: true,
    githubLimit: 8,
    maxFileBytes: 250_000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--no-github') {
      args.github = false;
      continue;
    }
    const needsValue = ['--surface', '--keyword', '--repo', '--output', '--report', '--github-limit', '--max-file-bytes'];
    if (needsValue.includes(arg)) {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === '--surface') args.surface = value;
      if (arg === '--keyword') args.keywords.push(value);
      if (arg === '--repo') args.repo = value;
      if (arg === '--output') args.output = value;
      if (arg === '--report') args.report = value;
      if (arg === '--github-limit') args.githubLimit = Number(value);
      if (arg === '--max-file-bytes') args.maxFileBytes = Number(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function run(cmd, args, options = {}) {
  const record = { cmd: [cmd, ...args], ok: false, stdout: '', stderr: '', error: null };
  try {
    record.stdout = execFileSync(cmd, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout ?? 30_000,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
      env: process.env,
    });
    record.ok = true;
  } catch (error) {
    record.stdout = error.stdout?.toString?.() ?? '';
    record.stderr = error.stderr?.toString?.() ?? '';
    record.error = `${error.name || 'Error'}: ${error.message || error}`;
  }
  return record;
}

function redactRemote(url) {
  return String(url || '').replace(/https:\/\/[^/@]+@github\.com\//, 'https://[REDACTED]@github.com/');
}

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function getRepoState(repo) {
  const commands = {
    branch: run('git', ['branch', '--show-current'], { cwd: repo }),
    head: run('git', ['rev-parse', 'HEAD'], { cwd: repo }),
    headShort: run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo }),
    statusShort: run('git', ['status', '--short'], { cwd: repo }),
    remote: run('git', ['remote', 'get-url', 'origin'], { cwd: repo }),
  };
  const ownerRepo = parseOwnerRepo(commands.remote.stdout.trim());
  return {
    branch: commands.branch.stdout.trim(),
    head: commands.head.stdout.trim(),
    head_short: commands.headShort.stdout.trim(),
    dirty_summary: commands.statusShort.stdout.trim().split('\n').filter(Boolean),
    remote: redactRemote(commands.remote.stdout.trim()),
    owner_repo: ownerRepo,
    commands: Object.fromEntries(Object.entries(commands).map(([k, v]) => [k, summarizeCommand(v)])),
  };
}

function parseOwnerRepo(remote) {
  const sanitized = remote.replace(/https:\/\/[^/@]+@github\.com\//, 'https://github.com/');
  let match = sanitized.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : null;
}

function summarizeCommand(record) {
  return {
    cmd: record.cmd.join(' '),
    ok: record.ok,
    stdout: record.stdout.trim().slice(0, 1000),
    stderr: record.stderr.trim().slice(0, 1000),
    error: record.error,
  };
}

function fileExt(path) {
  const m = path.match(/(\.[^.\/]+)$/);
  return m ? m[1] : '';
}

function walkFiles(root, options, subdir = '.') {
  const abs = join(root, subdir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = subdir === '.' ? entry.name : join(subdir, entry.name);
    const full = join(root, rel);
    if (entry.isDirectory()) {
      out.push(...walkFiles(root, options, rel));
    } else if (entry.isFile()) {
      const ext = fileExt(entry.name);
      if (!TEXT_EXTS.has(ext)) continue;
      const size = statSync(full).size;
      if (size > options.maxFileBytes) continue;
      out.push(rel.replace(/\\/g, '/'));
    }
  }
  return out;
}

function pathMatchesRoots(path, roots) {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

function keywordRegex(keywords) {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  return new RegExp(escaped.join('|'), 'i');
}

function readText(repo, rel) {
  return readFileSync(join(repo, rel), 'utf8');
}

function lineMatches(text, re, limit = 8) {
  const result = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && result.length < limit; i += 1) {
    if (re.test(lines[i])) {
      result.push({ line: i + 1, text: lines[i].trim().slice(0, 240) });
    }
  }
  return result;
}

function classifyTest(rel, text) {
  const lower = `${rel}\n${text}`.toLowerCase();
  if (rel.includes('/e2e/') || lower.includes('@playwright/test') || lower.includes('page.')) return 'browser/e2e';
  if (lower.includes('readfilesync') || lower.includes('regex') || lower.includes('source')) return 'source-contract';
  if (lower.includes('node:test') || lower.includes('describe(') || lower.includes('test(')) return 'unit/integration';
  return 'unknown';
}

function scanRepo(repo, surface, options) {
  const allFiles = walkFiles(repo, options);
  const re = keywordRegex(surface.keywords);
  const sourceFiles = allFiles.filter((rel) => rel.startsWith('apps/web/') || rel.startsWith('packages/') || rel.startsWith('scripts/'));

  const apiRoutes = [];
  const legacyRoutes = [];
  const uiCallers = [];
  const tests = [];
  const scriptArtifacts = [];

  for (const rel of sourceFiles) {
    let text = '';
    try { text = readText(repo, rel); } catch { continue; }
    const matches = lineMatches(text, re);
    if (pathMatchesRoots(rel, surface.apiRoots) && (re.test(rel) || matches.length)) {
      apiRoutes.push({ path: rel, matches });
    }
    if (pathMatchesRoots(rel, surface.legacyRoots) && (re.test(rel) || matches.length)) {
      legacyRoutes.push({ path: rel, matches });
    }
    if (pathMatchesRoots(rel, surface.uiRoots) && matches.length && !rel.includes('/api/')) {
      const apiStringMatches = lineMatches(text, /\/api\/(v2\/admin|v2\/bookings|admin\/orders|admin\/refund-requests)/i, 12);
      if (apiStringMatches.length || re.test(rel)) uiCallers.push({ path: rel, matches: apiStringMatches.length ? apiStringMatches : matches });
    }
    if (pathMatchesRoots(rel, surface.testRoots) && (re.test(rel) || matches.length)) {
      tests.push({ path: rel, kind: classifyTest(rel, text), matches });
    }
    if (rel.startsWith('scripts/') && matches.length) {
      scriptArtifacts.push({ path: rel, matches });
    }
  }

  return {
    totals: { all_text_files_scanned: allFiles.length, source_files_scanned: sourceFiles.length },
    api_routes: dedupeByPath(apiRoutes),
    legacy_reference_routes: dedupeByPath(legacyRoutes),
    ui_callers: dedupeByPath(uiCallers),
    tests: dedupeByPath(tests),
    script_artifacts: dedupeByPath(scriptArtifacts),
  };
}

function dedupeByPath(items) {
  const seen = new Set();
  const out = [];
  for (const item of items.sort((a, b) => a.path.localeCompare(b.path))) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    out.push(item);
  }
  return out;
}

function ghJson(args, cwd, timeout = 30_000) {
  const result = run('gh', args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 });
  return { command: summarizeCommand(result), data: result.ok ? safeJson(result.stdout, []) : [] };
}

function collectGithub(repo, ownerRepo, surface, limit) {
  if (!ownerRepo) {
    return { available: false, reason: 'Cannot parse GitHub owner/repo from origin remote.', issues: [], prs: [], commands: [] };
  }
  const commands = [];
  const issueMap = new Map();
  const prMap = new Map();
  for (const query of surface.githubQueries) {
    const issueArgs = ['issue', 'list', '--repo', ownerRepo, '--state', 'all', '--limit', String(limit), '--search', query, '--json', 'number,title,state,labels,url,updatedAt'];
    const issue = ghJson(issueArgs, repo);
    commands.push(issue.command);
    for (const item of issue.data || []) issueMap.set(item.number, { ...item, query });

    const prArgs = ['pr', 'list', '--repo', ownerRepo, '--state', 'all', '--limit', String(limit), '--search', query, '--json', 'number,title,state,url,updatedAt,mergeCommit,reviewDecision,statusCheckRollup'];
    const pr = ghJson(prArgs, repo);
    commands.push(pr.command);
    for (const item of pr.data || []) prMap.set(item.number, { ...item, query });
  }

  const prs = [];
  for (const pr of [...prMap.values()].slice(0, Math.max(limit, 12))) {
    const detailArgs = ['pr', 'view', String(pr.number), '--repo', ownerRepo, '--json', 'number,title,state,url,mergeCommit,reviewDecision,statusCheckRollup,files'];
    const detail = ghJson(detailArgs, repo);
    commands.push(detail.command);
    const data = detail.data && !Array.isArray(detail.data) ? detail.data : pr;
    prs.push({
      ...pr,
      mergeCommit: data.mergeCommit || pr.mergeCommit || null,
      reviewDecision: data.reviewDecision ?? pr.reviewDecision ?? null,
      statusCheckRollup: data.statusCheckRollup ?? pr.statusCheckRollup ?? [],
      files: (data.files || []).map((f) => f.path || f.filename || String(f)).slice(0, 200),
    });
  }

  return {
    available: true,
    owner_repo: ownerRepo,
    issues: [...issueMap.values()].sort((a, b) => b.number - a.number),
    prs: prs.sort((a, b) => b.number - a.number),
    commands,
  };
}

function buildEvidenceRows(scan, github, surface) {
  const rows = [];
  const add = (kind, item) => {
    const relatedTests = scan.tests.filter((t) => sharesKeyword(t.path, item.path, surface.keywords)).slice(0, 8);
    const relatedPrs = (github.prs || []).filter((pr) => (pr.files || []).some((file) => file === item.path || sharesKeyword(file, item.path, surface.keywords))).slice(0, 8);
    const relatedIssues = (github.issues || []).filter((issue) => sharesKeyword(`${issue.title || ''} ${issue.number}`, item.path, surface.keywords)).slice(0, 8);
    const gaps = [];
    if (kind !== 'legacy-reference' && relatedTests.length === 0) gaps.push('missing-test-path');
    if (relatedPrs.length === 0 && relatedIssues.length === 0) gaps.push('missing-github-pr-evidence');
    if (kind === 'legacy-reference') gaps.push('legacy-reference-only');
    if (kind === 'api-route' && scan.ui_callers.length === 0) gaps.push('browser-unverified');
    const status = kind === 'legacy-reference' ? 'HOLD' : gaps.length ? 'HOLD' : 'UNKNOWN';
    rows.push({
      result: `${kind}: ${item.path}`,
      status,
      code_path: item.path,
      test_paths: relatedTests.map((t) => ({ path: t.path, kind: t.kind })),
      github_pr_evidence: {
        issues: relatedIssues.map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.url })),
        prs: relatedPrs.map((p) => ({ number: p.number, title: p.title, state: p.state, reviewDecision: p.reviewDecision, url: p.url, touched: (p.files || []).filter((f) => f === item.path || sharesKeyword(f, item.path, surface.keywords)).slice(0, 20) })),
      },
      observed_evidence: item.matches || [],
      gap: gaps,
      next_step: nextStepForGaps(gaps, kind),
    });
  };
  for (const item of scan.api_routes) add('api-route', item);
  for (const item of scan.legacy_reference_routes) add('legacy-reference', item);
  if (scan.api_routes.length === 0) {
    rows.push({
      result: `${surface.label} API route mapping`,
      status: 'UNKNOWN',
      code_path: 'UNKNOWN — no matching API route under configured roots',
      test_paths: [],
      github_pr_evidence: { issues: [], prs: [] },
      observed_evidence: [],
      gap: ['missing-code-path'],
      next_step: { owner: 'Pandora', action: 'Narrow the surface keywords or inspect routing/docs manually.' },
    });
  }
  return rows;
}

function sharesKeyword(a, b, keywords) {
  const aa = String(a).toLowerCase();
  const bb = String(b).toLowerCase();
  return keywords.some((k) => aa.includes(k.toLowerCase()) && bb.includes(k.toLowerCase()));
}

function nextStepForGaps(gaps, kind) {
  if (gaps.includes('missing-test-path')) return { owner: 'Pandora', action: 'Confirm whether a behavior test exists; route to Anna/Una only after exact missing gate is clear.' };
  if (gaps.includes('missing-github-pr-evidence')) return { owner: 'Pandora', action: 'Map current code path to issue/PR evidence or mark as repo-only current proof.' };
  if (gaps.includes('browser-unverified')) return { owner: 'Rita', action: 'Review whether API-only evidence is enough or request browser/API runtime proof.' };
  if (kind === 'legacy-reference') return { owner: 'Ava', action: 'Keep as migration reference; do not use as v2 product certification proof.' };
  return { owner: 'Rita', action: 'Review evidence quality; product certification remains separate.' };
}

function makeMarkdown(manifest) {
  const rows = manifest.evidence_records;
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const lines = [];
  lines.push(`# TP 後台 QA 證據盤點`);
  lines.push('');
  lines.push(`Surface: ${manifest.surface.label} (${manifest.surface.name})`);
  lines.push(`Run ID: ${manifest.run_id}`);
  lines.push(`Generated: ${manifest.generated_at}`);
  lines.push(`Repo: ${manifest.repo.branch} @ ${manifest.repo.head_short}`);
  lines.push('');
  lines.push('## 摘要');
  lines.push('');
  lines.push(`- API routes: ${manifest.scan.api_routes.length}`);
  lines.push(`- Legacy reference routes: ${manifest.scan.legacy_reference_routes.length}`);
  lines.push(`- UI callers: ${manifest.scan.ui_callers.length}`);
  lines.push(`- Tests: ${manifest.scan.tests.length}`);
  lines.push(`- GitHub issues: ${manifest.github.issues?.length ?? 0}`);
  lines.push(`- GitHub PRs: ${manifest.github.prs?.length ?? 0}`);
  lines.push(`- Status counts: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  if (manifest.repo.dirty_summary.length) {
    lines.push(`- Repo dirty: YES (${manifest.repo.dirty_summary.length} entries)`);
  } else {
    lines.push('- Repo dirty: no');
  }
  lines.push('');
  lines.push('> 注意：這份報告只做確定性掃描（用 repo / GitHub 事實產生證據清單），不是產品功能通過證明。Rita 後續只需要審查證據品質。');
  lines.push('');
  lines.push('## 證據清單');
  lines.push('');
  lines.push('| Result | Status | Code path | Test path | GitHub/PR evidence | Gap | Next step |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const tests = row.test_paths.length ? row.test_paths.map((t) => `\`${t.path}\` (${t.kind})`).join('<br>') : 'MISSING';
    const ghItems = [
      ...(row.github_pr_evidence.issues || []).map((i) => `Issue #${i.number} ${i.state}`),
      ...(row.github_pr_evidence.prs || []).map((p) => `PR #${p.number} ${p.state}${p.reviewDecision ? `/${p.reviewDecision}` : ''}`),
    ].join('<br>') || 'NONE FOUND';
    lines.push(`| ${escapeCell(row.result)} | ${row.status} | \`${escapeCell(row.code_path)}\` | ${escapeCell(tests)} | ${escapeCell(ghItems)} | ${escapeCell(row.gap.join(', ') || 'none')} | ${escapeCell(`${row.next_step.owner}: ${row.next_step.action}`)} |`);
  }
  lines.push('');
  lines.push('## 掃描設定');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({ keywords: manifest.surface.keywords, apiRoots: manifest.surface.apiRoots, legacyRoots: manifest.surface.legacyRoots }, null, 2));
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function main() {
  const args = parseArgs(process.argv);
  const surfaceBase = SURFACES[args.surface];
  if (!surfaceBase) throw new Error(`Unknown surface: ${args.surface}. Known: ${Object.keys(SURFACES).join(', ')}`);
  const repo = resolve(args.repo);
  if (!existsSync(join(repo, 'package.json'))) throw new Error(`Repo root does not look valid: ${repo}`);
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const surface = {
    name: args.surface,
    ...surfaceBase,
    keywords: [...new Set([...surfaceBase.keywords, ...args.keywords])],
  };
  const output = args.output ? resolve(args.output) : `/tmp/wf_tp_admin_${args.surface}/${runId}/manifest.json`;
  const report = args.report ? resolve(args.report) : join(dirname(output), 'report.md');

  const repoState = getRepoState(repo);
  const scan = scanRepo(repo, surface, args);
  const github = args.github ? collectGithub(repo, repoState.owner_repo, surface, args.githubLimit) : { available: false, skipped: true, issues: [], prs: [], commands: [] };
  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    run_id: runId,
    purpose: 'TP admin QA deterministic evidence scan. This is report evidence, not product certification.',
    surface,
    repo: repoState,
    scan,
    github,
    evidence_records: [],
    output: { manifest: output, report },
  };
  manifest.evidence_records = buildEvidenceRows(scan, github, surface);

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(report, makeMarkdown(manifest));
  console.log(JSON.stringify({ ok: true, manifest: output, report, evidence_records: manifest.evidence_records.length }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
