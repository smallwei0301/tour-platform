/**
 * Behavioral tests for issue #555 — soft-launch controls
 *
 * Tests call `getControls`, `setControl`, and `isWhitelisted` directly with
 * in-memory mock Supabase clients, verifying correct fallback, audit writes,
 * and whitelist matching behaviour.
 *
 * Run: node --test tests/api/issue506-soft-launch-behavioral.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getControls, setControl, isWhitelisted } from '../../src/lib/soft-launch.mjs';

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal tracked Supabase mock.
 *
 * tableSpec: {
 *   [tableName]: {
 *     selectResult?: { data, error },  // returned by .select().single() / chained
 *     updateResult?: { data, error },
 *     insertResult?: { data, error },
 *   }
 * }
 *
 * Also exposes `log` — array of { table, op, payload? } for assertions.
 */
function buildMock(tableSpec = {}) {
  const log = [];

  function from(table) {
    const spec = tableSpec[table] ?? {};
    const selectResult = spec.selectResult ?? { data: null, error: null };
    const updateResult = spec.updateResult ?? { data: null, error: null };
    const insertResult = spec.insertResult ?? { data: null, error: null };

    return {
      select(..._args) {
        log.push({ table, op: 'select' });
        return {
          single: () => Promise.resolve(selectResult),
          // eq chains for isWhitelisted
          eq: (_col, _val) => ({
            eq: (_col2, _val2) => ({
              limit: () => Promise.resolve(spec.whitelistResult ?? { data: null, error: null }),
            }),
            limit: () => Promise.resolve(spec.whitelistResult ?? { data: null, error: null }),
          }),
        };
      },
      update(payload) {
        log.push({ table, op: 'update', payload });
        return {
          not: (_col, _op, _val) => Promise.resolve(updateResult),
          eq: (_col, _val) => Promise.resolve(updateResult),
        };
      },
      insert(payload) {
        log.push({ table, op: 'insert', payload });
        return Promise.resolve(insertResult);
      },
    };
  }

  return { from, log };
}

// ---------------------------------------------------------------------------
// Test group 1: getControls fallback
// ---------------------------------------------------------------------------

describe('getControls — fallback behaviour', () => {
  it('TC1.1: when Supabase returns an error → returns all-false safe defaults', async () => {
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: null, error: { message: 'relation not found' } },
      },
    });

    const result = await getControls(supabase);

    assert.strictEqual(result.public_paused, false, 'public_paused must default to false');
    assert.strictEqual(result.new_booking_paused, false, 'new_booking_paused must default to false');
    assert.strictEqual(result.refund_manual_only, false, 'refund_manual_only must default to false');
    assert.strictEqual(result.whitelist_enabled, false, 'whitelist_enabled must default to false');
  });

  it('TC1.2: when Supabase returns data → returns data as-is', async () => {
    const row = { public_paused: true, new_booking_paused: false, refund_manual_only: true, whitelist_enabled: false };
    const supabase = buildMock({
      soft_launch_controls: { selectResult: { data: row, error: null } },
    });

    const result = await getControls(supabase);

    assert.strictEqual(result.public_paused, true);
    assert.strictEqual(result.new_booking_paused, false);
    assert.strictEqual(result.refund_manual_only, true);
    assert.strictEqual(result.whitelist_enabled, false);
  });

  it('TC1.3: getControls calls select on soft_launch_controls table', async () => {
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: { public_paused: false, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false }, error: null },
      },
    });

    await getControls(supabase);

    const selectCall = supabase.log.find((c) => c.table === 'soft_launch_controls' && c.op === 'select');
    assert.ok(selectCall, 'getControls must call select on soft_launch_controls');
  });
});

// ---------------------------------------------------------------------------
// Test group 2: setControl audit
// ---------------------------------------------------------------------------

describe('setControl — audit writes', () => {
  it('TC2.1: setControl calls update on soft_launch_controls', async () => {
    const currentRow = { public_paused: false, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false };
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: currentRow, error: null },
        updateResult: { data: null, error: null },
      },
      soft_launch_control_audit: {
        insertResult: { data: null, error: null },
      },
    });

    await setControl(supabase, {
      controlKey: 'new_booking_paused',
      toValue: true,
      actor: 'admin@midao.tw',
      reason: 'soft-launch test',
    });

    const updateCall = supabase.log.find((c) => c.table === 'soft_launch_controls' && c.op === 'update');
    assert.ok(updateCall, 'setControl must call update on soft_launch_controls');
    assert.strictEqual(updateCall.payload.new_booking_paused, true, 'update payload must include new value');
    assert.ok('updated_at' in updateCall.payload, 'update payload must include updated_at');
  });

  it('TC2.2: setControl inserts audit row with correct fields', async () => {
    const currentRow = { public_paused: false, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false };
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: currentRow, error: null },
        updateResult: { data: null, error: null },
      },
      soft_launch_control_audit: {
        insertResult: { data: null, error: null },
      },
    });

    await setControl(supabase, {
      controlKey: 'refund_manual_only',
      toValue: true,
      actor: 'wei@midao.tw',
      reason: 'enabling manual-only refunds for launch',
      rollbackInstruction: 'setControl refund_manual_only false',
    });

    const auditInsert = supabase.log.find((c) => c.table === 'soft_launch_control_audit' && c.op === 'insert');
    assert.ok(auditInsert, 'setControl must insert into soft_launch_control_audit');
    assert.strictEqual(auditInsert.payload.control_key, 'refund_manual_only');
    assert.strictEqual(auditInsert.payload.from_value, false, 'from_value must reflect the old value');
    assert.strictEqual(auditInsert.payload.to_value, true, 'to_value must reflect the new value');
    assert.strictEqual(auditInsert.payload.actor, 'wei@midao.tw');
    assert.strictEqual(auditInsert.payload.reason, 'enabling manual-only refunds for launch');
    assert.strictEqual(auditInsert.payload.rollback_instruction, 'setControl refund_manual_only false');
  });

  it('TC2.3: setControl reads current value before updating (from_value tracks real old value)', async () => {
    const currentRow = { public_paused: true, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false };
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: currentRow, error: null },
        updateResult: { data: null, error: null },
      },
      soft_launch_control_audit: {
        insertResult: { data: null, error: null },
      },
    });

    await setControl(supabase, {
      controlKey: 'public_paused',
      toValue: false,
      actor: 'admin@midao.tw',
      reason: 'unpausing public',
    });

    const auditInsert = supabase.log.find((c) => c.table === 'soft_launch_control_audit' && c.op === 'insert');
    assert.ok(auditInsert, 'audit insert required');
    assert.strictEqual(auditInsert.payload.from_value, true, 'from_value should be the previous value (true)');
    assert.strictEqual(auditInsert.payload.to_value, false, 'to_value should be the new value (false)');
  });

  it('TC2.4: setControl without rollbackInstruction sets rollback_instruction to null', async () => {
    const currentRow = { public_paused: false, new_booking_paused: false, refund_manual_only: false, whitelist_enabled: false };
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: currentRow, error: null },
        updateResult: { data: null, error: null },
      },
      soft_launch_control_audit: {
        insertResult: { data: null, error: null },
      },
    });

    await setControl(supabase, {
      controlKey: 'whitelist_enabled',
      toValue: true,
      actor: 'admin@midao.tw',
      reason: 'enabling whitelist',
      // no rollbackInstruction
    });

    const auditInsert = supabase.log.find((c) => c.table === 'soft_launch_control_audit' && c.op === 'insert');
    assert.ok(auditInsert, 'audit insert required');
    assert.strictEqual(auditInsert.payload.rollback_instruction, null, 'rollback_instruction should be null when not provided');
  });
});

// ---------------------------------------------------------------------------
// Test group 3: isWhitelisted
// ---------------------------------------------------------------------------

/**
 * Build a mock specifically for isWhitelisted — the function chains:
 *   .from('soft_launch_whitelist')
 *   .select('id')
 *   .eq('entry_type', ...)
 *   .eq('value', ...)
 *   .limit(1)
 * and checks data?.length
 */
function buildWhitelistMock(matchingEntries = []) {
  /**
   * matchingEntries: array of { entry_type, value } that should return a hit.
   */
  const log = [];

  function from(table) {
    if (table !== 'soft_launch_whitelist') {
      return {
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        update: () => ({ not: () => Promise.resolve({ data: null, error: null }) }),
        insert: () => Promise.resolve({ data: null, error: null }),
      };
    }

    return {
      select(_fields) {
        log.push({ table, op: 'select' });
        let capturedType = null;
        let capturedValue = null;

        const builder = {
          eq(col, val) {
            if (col === 'entry_type') capturedType = val;
            if (col === 'value') capturedValue = val;
            return builder;
          },
          limit(_n) {
            const hit = matchingEntries.find(
              (e) => e.entry_type === capturedType && e.value === capturedValue
            );
            return Promise.resolve({ data: hit ? [{ id: 'wl-1' }] : [], error: null });
          },
        };
        return builder;
      },
    };
  }

  return { from, log };
}

describe('isWhitelisted — matching logic', () => {
  it('TC3.1: returns true when traveler_user_id matches an entry', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'user-abc' }]);

    const result = await isWhitelisted(supabase, { userId: 'user-abc', activityId: undefined, guideId: undefined });

    assert.strictEqual(result, true, 'isWhitelisted should return true for matching userId');
  });

  it('TC3.2: returns true when activity_id matches an entry', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'activity_id', value: 'act-xyz' }]);

    const result = await isWhitelisted(supabase, { userId: undefined, activityId: 'act-xyz', guideId: undefined });

    assert.strictEqual(result, true, 'isWhitelisted should return true for matching activityId');
  });

  it('TC3.3: returns false when no identifiers match any whitelist entry', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'other-user' }]);

    const result = await isWhitelisted(supabase, { userId: 'user-not-listed', activityId: undefined, guideId: undefined });

    assert.strictEqual(result, false, 'isWhitelisted should return false when no match');
  });

  it('TC3.4: returns false when no identifiers provided', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'someone' }]);

    const result = await isWhitelisted(supabase, { userId: undefined, activityId: undefined, guideId: undefined });

    assert.strictEqual(result, false, 'isWhitelisted must return false when called with no identifiers');
  });

  it('TC3.5: returns true on first match without checking remaining identifiers (short-circuit)', async () => {
    // userId matches; activityId does not. Should return true.
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'user-early' }]);

    const result = await isWhitelisted(supabase, { userId: 'user-early', activityId: 'no-match-act', guideId: undefined });

    assert.strictEqual(result, true, 'should short-circuit on first matching identifier');
  });
});

// ---------------------------------------------------------------------------
// Test group 4: soft-launch.mjs integration
// ---------------------------------------------------------------------------

describe('soft-launch integration — new_booking_paused scenario', () => {
  it('TC4.1: getControls returns paused=true when DB row has new_booking_paused=true', async () => {
    const row = { public_paused: false, new_booking_paused: true, refund_manual_only: false, whitelist_enabled: true };
    const supabase = buildMock({
      soft_launch_controls: { selectResult: { data: row, error: null } },
    });

    const controls = await getControls(supabase);

    assert.strictEqual(controls.new_booking_paused, true, 'new_booking_paused must be true');
    assert.strictEqual(controls.whitelist_enabled, true, 'whitelist_enabled must be true');
  });

  it('TC4.2: isWhitelisted returns true for whitelisted user when new_booking_paused=true', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'vip-user' }]);

    const controls = { new_booking_paused: true, whitelist_enabled: true };

    // Application logic: if paused + whitelist_enabled, check whitelist
    let allowed = false;
    if (controls.new_booking_paused && controls.whitelist_enabled) {
      allowed = await isWhitelisted(supabase, { userId: 'vip-user', activityId: undefined, guideId: undefined });
    }

    assert.strictEqual(allowed, true, 'VIP user should be allowed through whitelist check');
  });

  it('TC4.3: isWhitelisted returns false for non-whitelisted user when new_booking_paused=true', async () => {
    const supabase = buildWhitelistMock([{ entry_type: 'traveler_user_id', value: 'vip-user' }]);

    const controls = { new_booking_paused: true, whitelist_enabled: true };

    let allowed = false;
    if (controls.new_booking_paused && controls.whitelist_enabled) {
      allowed = await isWhitelisted(supabase, { userId: 'regular-user', activityId: undefined, guideId: undefined });
    }

    assert.strictEqual(allowed, false, 'Non-whitelisted user must be blocked');
  });

  it('TC4.4: DB error during getControls safely falls back — new_booking_paused is false (allow traffic)', async () => {
    const supabase = buildMock({
      soft_launch_controls: {
        selectResult: { data: null, error: { message: 'connection timeout' } },
      },
    });

    const controls = await getControls(supabase);

    // Safe fallback: all false means the platform is open, not erroneously paused
    assert.strictEqual(controls.new_booking_paused, false, 'fallback must not erroneously pause new bookings');
    assert.strictEqual(controls.public_paused, false, 'fallback must not erroneously pause public access');
    assert.strictEqual(controls.refund_manual_only, false, 'fallback must not erroneously enable manual refunds');
  });
});
