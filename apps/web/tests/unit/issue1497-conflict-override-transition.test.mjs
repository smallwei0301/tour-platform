// #1497 — 導遊幫手確認狀態機（純函式）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConflictOverrideHelperTransition,
  GUIDE_ACTIONABLE_HELPER_STATUSES,
} from '../../src/lib/conflict-override-transition.mjs';

test('required → confirm/decline 合法', () => {
  const a = resolveConflictOverrideHelperTransition('required', 'confirm');
  assert.deepEqual(a, { allowed: true, nextStatus: 'assigned' });
  const b = resolveConflictOverrideHelperTransition('required', 'decline');
  assert.deepEqual(b, { allowed: true, nextStatus: 'declined' });
});

test('pending_assignment → confirm/decline 合法', () => {
  assert.equal(resolveConflictOverrideHelperTransition('pending_assignment', 'confirm').nextStatus, 'assigned');
  assert.equal(resolveConflictOverrideHelperTransition('pending_assignment', 'decline').nextStatus, 'declined');
});

test('not_needed 不可由導遊變更', () => {
  const r = resolveConflictOverrideHelperTransition('not_needed', 'confirm');
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'HELPER_NOT_REQUIRED');
});

test('assigned / declined 為終態，不可再變', () => {
  for (const s of ['assigned', 'declined']) {
    const r = resolveConflictOverrideHelperTransition(s, 'confirm');
    assert.equal(r.allowed, false);
    assert.equal(r.code, 'HELPER_ALREADY_DECIDED');
  }
});

test('未知 action 回 INVALID_ACTION', () => {
  const r = resolveConflictOverrideHelperTransition('required', 'maybe');
  assert.equal(r.allowed, false);
  assert.equal(r.code, 'INVALID_ACTION');
});

test('導遊可表態來源狀態僅 required / pending_assignment', () => {
  assert.deepEqual([...GUIDE_ACTIONABLE_HELPER_STATUSES].sort(), ['pending_assignment', 'required']);
});
