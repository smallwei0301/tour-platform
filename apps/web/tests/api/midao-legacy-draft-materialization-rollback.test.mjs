import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lexPostgresSql } from '../helpers/sql-source-lexer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const forwardPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.sql',
);
const rollbackPath = resolve(
  here,
  '../../../../supabase/migrations/20260813085910_issue1825_legacy_midao_draft_materialization.rollback.sql',
);
const preIssue1825PublishPath = resolve(
  here,
  '../../../../supabase/migrations/20260723022000_midao_atomic_service_publication.sql',
);
const forwardHash = '4ea5094f497e953076d41b3e8f878b331398f66f6694f5e2145dc1a845612ff9';
const forwardMaterializerFingerprint = '861e18c6ad0b6f788fee828423b078ea';
const forwardPublishFingerprint = '1daed5af8e2c6e0860663420b40ed459';
const preIssue1825PublishFingerprint = '4ab71e58e1438395d6e79c0c669cc90d';
const materializerIdentity = 'public.midao_materialize_legacy_service_draft(uuid, uuid)';
const publishIdentity = 'public.midao_publish_service_draft(uuid, integer, uuid)';

function source(path) {
  return readFileSync(path, 'utf8');
}

function normalized(statement) {
  let canonical = '';
  let state = 'normal';
  let dollarTag = '';
  let escapeString = false;
  let pendingWhitespace = false;

  const append = (text) => {
    if (pendingWhitespace && canonical) canonical += ' ';
    pendingWhitespace = false;
    canonical += text;
  };

  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];
    const next = statement[index + 1];
    if (state === 'single-quote' || state === 'dollar-single-quote') {
      append(char);
      if (escapeString && char === '\\' && next !== undefined) {
        append(next);
        index += 1;
      } else if (char === "'" && next === "'") {
        append(next);
        index += 1;
      } else if (char === "'") {
        state = state === 'dollar-single-quote' ? 'dollar-quote' : 'normal';
        escapeString = false;
      }
      continue;
    }
    if (state === 'double-quote' || state === 'dollar-double-quote') {
      append(char);
      if (char === '"' && next === '"') {
        append(next);
        index += 1;
      } else if (char === '"') {
        state = state === 'dollar-double-quote' ? 'dollar-quote' : 'normal';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (statement.startsWith(dollarTag, index)) {
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'normal';
      } else if (/\s/u.test(char)) {
        pendingWhitespace = true;
      } else if (char === "'") {
        const prefix = statement[index - 1];
        const beforePrefix = statement[index - 2];
        escapeString = (prefix === 'E' || prefix === 'e') && (beforePrefix === undefined || !/[A-Za-z0-9_$]/u.test(beforePrefix));
        append(char);
        state = 'dollar-single-quote';
      } else if (char === '"') {
        append(char);
        state = 'dollar-double-quote';
      } else {
        append(char);
      }
      continue;
    }

    if (/\s/u.test(char)) {
      pendingWhitespace = true;
    } else if (char === "'") {
      const prefix = statement[index - 1];
      const beforePrefix = statement[index - 2];
      escapeString = (prefix === 'E' || prefix === 'e') && (beforePrefix === undefined || !/[A-Za-z0-9_$]/u.test(beforePrefix));
      append(char);
      state = 'single-quote';
    } else if (char === '"') {
      append(char);
      state = 'double-quote';
    } else if (char === '$') {
      const match = statement.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u);
      if (match) {
        dollarTag = match[0];
        append(dollarTag);
        index += dollarTag.length - 1;
        state = 'dollar-quote';
      } else {
        append(char);
      }
    } else {
      append(char);
    }
  }

  return canonical.trim().replace(/\s*;$/u, '');
}

function functionStatement(sql, identity) {
  const executable = lexPostgresSql(sql).executable;
  const functionName = identity.slice(0, identity.indexOf('('));
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const functionStart = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escapedName}\\s*\\(`, 'iu').exec(executable);
  assert.ok(functionStart, `missing function ${identity}`);

  const bodyStart = /\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)/giu;
  bodyStart.lastIndex = functionStart.index + functionStart[0].length;
  const bodyDelimiter = bodyStart.exec(executable);
  assert.ok(bodyDelimiter, `missing dollar-quoted body for function ${identity}`);

  const dollarTag = bodyDelimiter[1];
  const openingTagIndex = executable.indexOf(dollarTag, bodyDelimiter.index);
  const closingTagIndex = executable.indexOf(dollarTag, openingTagIndex + dollarTag.length);
  assert.ok(closingTagIndex >= 0, `unterminated dollar-quoted body for function ${identity}`);
  const terminalSemicolon = executable.indexOf(';', closingTagIndex + dollarTag.length);
  assert.ok(terminalSemicolon >= 0, `missing terminal semicolon for function ${identity}`);
  return executable.slice(functionStart.index, terminalSemicolon + 1);
}

test('same-name operator-only companion is absent before rollback SQL implementation', () => {
  assert.equal(existsSync(rollbackPath), true, 'same-name rollback companion must exist');
});

test('rollback companion binds the immutable forward migration and exact pre-#1825 publish source', () => {
  assert.equal(createHash('sha256').update(source(forwardPath)).digest('hex'), forwardHash);
  const rollback = source(rollbackPath);
  const forward = source(forwardPath);
  const preIssue1825 = source(preIssue1825PublishPath);

  assert.match(rollback, /operator-only[\s\S]*never auto-run/iu);
  assert.match(rollback, /BEGIN;[\s\S]*SET LOCAL lock_timeout = '5s';[\s\S]*SET LOCAL statement_timeout = '30s';[\s\S]*COMMIT;/u);
  assert.match(rollback, /current_setting\('midao\.rollback_owner_authorized', true\)\s*=\s*'issue-1825'/u);
  assert.match(rollback, /ERRCODE\s*=\s*'P0001'[\s\S]*MIDAO_ROLLBACK_OWNER_AUTHORIZATION_REQUIRED/u);
  assert.match(rollback, /LOCK TABLE public\.guide_service_drafts IN ACCESS EXCLUSIVE MODE;/u);

  assert.ok(rollback.includes(`pg_catalog.md5(procedure.prosrc) = '${forwardMaterializerFingerprint}'`));
  assert.ok(rollback.includes(`pg_catalog.md5(procedure.prosrc) = '${forwardPublishFingerprint}'`));
  assert.ok(rollback.includes(`pg_catalog.md5(procedure.prosrc) = '${preIssue1825PublishFingerprint}'`));
  assert.match(rollback, /MIDAO_ROLLBACK_PRECONDITION_FAILED/u);
  assert.match(rollback, /MIDAO_ROLLBACK_POSTCONDITION_FAILED/u);
  assert.match(rollback, /MIDAO_ROLLBACK_DATA_DEPENDENCY_PRESENT/u);

  const restored = functionStatement(rollback, publishIdentity);
  const expected = functionStatement(preIssue1825, publishIdentity);
  assert.equal(normalized(restored), normalized(expected), 'rollback must restore the exact pre-#1825 publish RPC source');
  const whitespaceOnlyFormatting = expected.replace('DECLARE\n  v_now', 'DECLARE\n\n  v_now');
  assert.notEqual(whitespaceOnlyFormatting, expected, 'test fixture must change only irrelevant SQL formatting');
  assert.equal(
    normalized(expected),
    normalized(whitespaceOnlyFormatting),
    'rollback source comparison must ignore whitespace-only SQL formatting',
  );
  const caseOnlyLiteralDrift = expected.replace("'PUBLISHED'", "'published'");
  assert.notEqual(caseOnlyLiteralDrift, expected, 'test fixture must change only the known quoted literal case');
  assert.notEqual(
    normalized(restored),
    normalized(caseOnlyLiteralDrift),
    'rollback source comparison must reject case-only drift inside quoted literals',
  );
  assert.notEqual(normalized(restored), normalized(functionStatement(forward, publishIdentity)));
});

test('rollback rejects partial state, preserves rows on legacy provenance, restores the publish ACL, then removes only forward artifacts', () => {
  const rollback = source(rollbackPath).toLowerCase();
  const lock = rollback.indexOf('lock table public.guide_service_drafts in access exclusive mode');
  const dataGuard = rollback.indexOf("materialization_origin <> 'native'");
  const restore = rollback.indexOf('create or replace function public.midao_publish_service_draft(');
  const dropMaterializer = rollback.indexOf(`drop function ${materializerIdentity}`);
  const dropRevisionConstraint = rollback.indexOf('drop constraint midao_guide_service_drafts_materialized_revision_check');
  const dropRevisionColumn = rollback.indexOf('drop column materialized_revision');
  const postcondition = rollback.lastIndexOf('midao_rollback_postcondition_failed');

  assert.ok(lock >= 0 && dataGuard > lock, 'data dependency guard must run after the exclusive draft lock');
  assert.match(rollback.slice(dataGuard, restore), /materialization_review_state\s+is\s+not\s+null/u);
  assert.match(rollback.slice(dataGuard, restore), /materialized_at\s+is\s+not\s+null/u);
  assert.match(rollback.slice(dataGuard, restore), /materialized_revision\s+is\s+not\s+null/u);
  assert.ok(restore > dataGuard && dropMaterializer > restore, 'publish must restore before materializer removal');
  assert.ok(dropRevisionConstraint > dropMaterializer && dropRevisionColumn > dropRevisionConstraint, 'constraints and columns must drop in reverse dependency order');
  assert.ok(postcondition > dropRevisionColumn, 'postconditions must run after artifact removal');

  const compact = rollback.replace(/\s+/gu, ' ');
  assert.ok(compact.includes(`revoke all on function ${publishIdentity} from public, anon, authenticated`));
  assert.ok(compact.includes(`grant execute on function ${publishIdentity} to service_role`));
  assert.ok(compact.includes(`revoke all on function ${materializerIdentity} from public, anon, authenticated, service_role`));
  assert.ok(compact.includes(`drop function ${materializerIdentity}`));
  assert.equal(compact.includes(`drop function ${publishIdentity}`), false);
  assert.doesNotMatch(rollback, /\b(?:insert|update|delete|truncate)\s+(?:into\s+)?public\.guide_service_drafts\b/u);
  assert.doesNotMatch(rollback, /\bcascade\b/u);
  assert.doesNotMatch(rollback, /\bdrop\s+(?:function|constraint|column)\s+if\s+exists\b/u);
});
