import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(here, '../../../../supabase/migrations/20260723002000_midao_idempotency_records.sql');

function migrationSql() {
  assert.equal(fs.existsSync(migrationPath), true, 'durable idempotency migration file must exist');
  return fs.readFileSync(migrationPath, 'utf8');
}

function lexSql(sql) {
  const statements = [];
  let executable = '';
  let current = '';
  let state = 'normal';
  let dollarTag = '';
  let blockDepth = 0;

  const append = (text) => {
    executable += text;
    current += text;
  };
  const finishStatement = () => {
    const normalized = current.replace(/\s+/gu, ' ').trim().toUpperCase();
    if (normalized) statements.push(normalized);
    current = '';
    executable += ';';
  };

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') {
        append(char);
        state = 'normal';
      }
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 1;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = 'normal';
      } else if (char === '\n' || char === '\r') {
        append(char);
      }
      continue;
    }
    if (state === 'single-quote') {
      append(char);
      if (char === "'" && next === "'") {
        append(next);
        index += 1;
      } else if (char === "'") {
        state = 'normal';
      }
      continue;
    }
    if (state === 'double-quote') {
      append(char);
      if (char === '"' && next === '"') {
        append(next);
        index += 1;
      } else if (char === '"') {
        state = 'normal';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'normal';
      } else {
        append(char);
      }
      continue;
    }

    if (char === '-' && next === '-') {
      append(' ');
      state = 'line-comment';
      index += 1;
    } else if (char === '/' && next === '*') {
      append(' ');
      state = 'block-comment';
      blockDepth = 1;
      index += 1;
    } else if (char === "'") {
      append(char);
      state = 'single-quote';
    } else if (char === '"') {
      append(char);
      state = 'double-quote';
    } else if (char === '$') {
      const match = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u);
      if (match) {
        dollarTag = match[0];
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'dollar-quote';
      } else {
        append(char);
      }
    } else if (char === ';') {
      finishStatement();
    } else {
      append(char);
    }
  }

  assert.ok(state === 'normal' || state === 'line-comment', `unterminated SQL ${state}`);
  const normalized = current.replace(/\s+/gu, ' ').trim().toUpperCase();
  if (normalized) statements.push(normalized);
  return { executable, statements };
}

function assertColumns(sql) {
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.midao_idempotency_records/iu);
  const exactLines = [
    /^\s*id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)\s*,\s*$/imu,
    /^\s*actor_type\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*actor_id\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*command_name\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*scope_type\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*scope_id\s+UUID\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*idempotency_key\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*request_hash\s+TEXT\s+NOT\s+NULL\s*,\s*$/imu,
    /^\s*state\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'processing'\s*,\s*$/imu,
    /^\s*response_status\s+INTEGER\s*,\s*$/imu,
    /^\s*response_body\s+JSONB\s*,\s*$/imu,
    /^\s*resource_type\s+TEXT\s*,\s*$/imu,
    /^\s*resource_id\s+TEXT\s*,\s*$/imu,
    /^\s*created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)\s*,\s*$/imu,
    /^\s*locked_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)\s*,\s*$/imu,
    /^\s*completed_at\s+TIMESTAMPTZ\s*,\s*$/imu,
    /^\s*expires_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s*,?\s*$/imu,
  ];
  for (const pattern of exactLines) assert.match(sql, pattern);
}

function assertConstraints(sql) {
  assert.match(sql, /CONSTRAINT\s+midao_idempotency_records_state_check\s+CHECK\s*\(\s*state\s+IN\s*\(\s*'processing'\s*,\s*'completed'\s*\)\s*\)/iu);
  assert.match(sql, /CONSTRAINT\s+midao_idempotency_records_key_length_check\s+CHECK\s*\(\s*octet_length\(idempotency_key\)\s+BETWEEN\s+1\s+AND\s+128\s*\)/iu);
  assert.match(sql, /CONSTRAINT\s+midao_idempotency_records_hash_check\s+CHECK\s*\(\s*request_hash\s*~\s*'\^\[0-9a-f\]\{64\}\$'\s*\)/iu);
  assert.match(sql, /CONSTRAINT\s+midao_idempotency_records_response_check\s+CHECK\s*\([\s\S]*?state\s*=\s*'processing'[\s\S]*?response_status\s+IS\s+NULL[\s\S]*?response_body\s+IS\s+NULL[\s\S]*?completed_at\s+IS\s+NULL[\s\S]*?state\s*=\s*'completed'[\s\S]*?response_status\s+IS\s+NOT\s+NULL[\s\S]*?response_body\s+IS\s+NOT\s+NULL[\s\S]*?response_body\s*<>\s*'null'::jsonb[\s\S]*?completed_at\s+IS\s+NOT\s+NULL[\s\S]*?\)/iu);
  assert.match(sql, /CONSTRAINT\s+midao_idempotency_records_scope_key_unique\s+UNIQUE\s*\(\s*scope_type\s*,\s*scope_id\s*,\s*command_name\s*,\s*idempotency_key\s*\)/iu);
}

function assertIndexes(sql) {
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_idempotency_records_expiry_idx\s+ON\s+public\.midao_idempotency_records\s*\(\s*expires_at\s*,\s*id\s*\)/iu);
  assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+midao_idempotency_records_stale_processing_idx\s+ON\s+public\.midao_idempotency_records\s*\(\s*locked_at\s*,\s*id\s*\)\s+WHERE\s+state\s*=\s*'processing'/iu);
}

function assertSecurity(statements) {
  const rls = statements.filter((statement) => /^ALTER TABLE PUBLIC\.MIDAO_IDEMPOTENCY_RECORDS (?:ENABLE|DISABLE|FORCE|NO FORCE) ROW LEVEL SECURITY$/u.test(statement));
  assert.deepEqual(rls, [
    'ALTER TABLE PUBLIC.MIDAO_IDEMPOTENCY_RECORDS ENABLE ROW LEVEL SECURITY',
    'ALTER TABLE PUBLIC.MIDAO_IDEMPOTENCY_RECORDS FORCE ROW LEVEL SECURITY',
  ]);
  const acl = statements.filter((statement) => /^(?:GRANT|REVOKE)\s/u.test(statement));
  assert.deepEqual(acl, [
    'REVOKE ALL ON TABLE PUBLIC.MIDAO_IDEMPOTENCY_RECORDS FROM PUBLIC, ANON, AUTHENTICATED',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE PUBLIC.MIDAO_IDEMPOTENCY_RECORDS TO SERVICE_ROLE',
  ]);
  assert.doesNotMatch(statements.join('; '), /CREATE\s+POLICY/iu);
}

function assertComments(sql) {
  const response = sql.match(/COMMENT\s+ON\s+COLUMN\s+public\.midao_idempotency_records\.response_body\s+IS\s+'([^']*)'/iu);
  assert.ok(response, 'response_body comment must exist');
  assert.match(response[1], /must\s+not\s+contain\s+raw\s+confirmation\s+tokens?\s*,\s*cookies?\s*,\s*secrets?\s*,\s*or\s+unnecessary\s+PII/iu);
  const state = sql.match(/COMMENT\s+ON\s+COLUMN\s+public\.midao_idempotency_records\.state\s+IS\s+'([^']*)'/iu);
  assert.ok(state, 'state comment must exist');
  assert.match(state[1], /processing[\s\S]*replays?\s+must\s+wait[\s\S]*never\s+return[\s\S]*placeholder/iu);
}

function assertFullContract(sql) {
  const { executable, statements } = lexSql(sql);
  assertColumns(executable);
  assertConstraints(executable);
  assertIndexes(executable);
  assertSecurity(statements);
  assertComments(executable);
}

test('durable idempotency migration satisfies the exact schema and security contract', () => {
  assertFullContract(migrationSql());
});

test('durable idempotency source contract rejects critical mutations', () => {
  const sql = migrationSql();
  const mutations = [
    ['scope excluded from uniqueness', sql.replace('scope_type, scope_id, command_name, idempotency_key', 'command_name, idempotency_key')],
    ['same-key scope reuse removed', sql.replace('scope_type, scope_id, command_name, idempotency_key', 'idempotency_key')],
    ['completed body nullable', sql.replace("response_body IS NOT NULL", "response_body IS NULL")],
    ['placeholder json accepted', sql.replace("AND response_body <> 'null'::jsonb", '')],
    ['processing placeholder accepted', sql.replace('AND response_body IS NULL', '')],
    ['stale index predicate removed', sql.replace("WHERE state = 'processing'", '')],
    ['expiry tie breaker removed', sql.replace('(expires_at, id)', '(expires_at)')],
    ['disable RLS appended', `${sql}\nALTER TABLE public.midao_idempotency_records DISABLE ROW LEVEL SECURITY;`],
    ['extra grant hidden by comment', `${sql}\n-- hidden privilege\nGRANT TRUNCATE ON TABLE public.midao_idempotency_records TO service_role;`],
    ['quoted dash comment before active grant', `${sql}\nCOMMENT ON TABLE public.midao_idempotency_records IS 'safe -- text'; GRANT TRUNCATE ON TABLE public.midao_idempotency_records TO service_role;`],
    ['required field hidden in block comment', sql.replace('actor_type TEXT NOT NULL,', 'actor_type TEXT,\n/*\nactor_type TEXT NOT NULL,\n*/')],
    ['response snapshot becomes sensitive', sql.replace('must not contain raw confirmation tokens, cookies, secrets, or unnecessary PII', 'may contain raw confirmation tokens, cookies, secrets, or unnecessary PII')],
    ['replay reads placeholder', sql.replace('replays must wait', 'replays may read immediately')],
  ];
  for (const [name, mutant] of mutations) {
    assert.notEqual(mutant, sql, `${name} mutation must alter SQL`);
    assert.throws(() => assertFullContract(mutant), `${name} mutation must fail`);
  }
});

test('SQL lexer rejects active statements after quoted markers and preserves benign controls', () => {
  const sql = migrationSql();
  const hostile = `${sql}\nCOMMENT ON TABLE public.midao_idempotency_records IS 'safe -- text'; GRANT TRUNCATE ON TABLE public.midao_idempotency_records TO service_role;`;
  assert.throws(() => assertFullContract(hostile));

  const benign = `${sql}
-- ALTER TABLE public.midao_idempotency_records DISABLE ROW LEVEL SECURITY;
/* GRANT TRUNCATE ON TABLE public.midao_idempotency_records TO service_role; */
COMMENT ON TABLE public.midao_idempotency_records IS 'quoted ''value'' -- and /* markers; are inert */';
COMMENT ON TABLE public."quoted--identifier" IS 'double quote marker is inert';
COMMENT ON TABLE public.midao_idempotency_records IS $safe$dollar -- and /* markers; are inert */$safe$;`;
  assert.doesNotThrow(() => assertFullContract(benign));
});
