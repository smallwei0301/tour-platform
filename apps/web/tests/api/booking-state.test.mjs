/**
 * Booking State Service Tests (TP-BP-006)
 *
 * Tests for:
 *   - Valid state transitions
 *   - Invalid state transitions (guard logic)
 *   - Terminal state handling
 *
 * Note: These tests focus on the state machine logic.
 * Integration tests require Supabase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// State Machine Constants (mirrors implementation)
// ============================================================================

const BOOKING_STATUSES = [
  'draft',
  'pending_confirmation',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_requested',
];

const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_show'];

const VALID_TRANSITIONS = {
  draft: ['pending_confirmation', 'cancelled'],
  pending_confirmation: ['confirmed', 'cancelled', 'reschedule_requested'],
  confirmed: ['completed', 'cancelled', 'no_show', 'reschedule_requested'],
  reschedule_requested: ['confirmed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

const ACTION_TO_STATUS = {
  confirm: 'confirmed',
  complete: 'completed',
  cancel: 'cancelled',
  reschedule_request: 'reschedule_requested',
  reschedule_accept: 'confirmed',
  mark_no_show: 'no_show',
  payment_received: 'pending_confirmation',
};

// ============================================================================
// State Machine Helper Functions (mirrors implementation)
// ============================================================================

function isValidTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

function getAllowedTransitions(status) {
  return VALID_TRANSITIONS[status] ?? [];
}

function canCancel(status) {
  return VALID_TRANSITIONS[status]?.includes('cancelled') ?? false;
}

function canComplete(status) {
  return VALID_TRANSITIONS[status]?.includes('completed') ?? false;
}

function validateTransition(fromStatus, toStatus) {
  if (fromStatus === toStatus) {
    return {
      valid: false,
      code: 'SAME_STATUS',
      message: `Booking is already in '${fromStatus}' status`,
    };
  }

  if (isTerminalStatus(fromStatus)) {
    return {
      valid: false,
      code: 'TERMINAL_STATUS',
      message: `Cannot transition from terminal status '${fromStatus}'`,
    };
  }

  if (!isValidTransition(fromStatus, toStatus)) {
    const allowed = getAllowedTransitions(fromStatus);
    return {
      valid: false,
      code: 'INVALID_TRANSITION',
      message: `Invalid transition from '${fromStatus}' to '${toStatus}'. Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none'}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Booking Status Constants Tests
// ============================================================================

test('BOOKING_STATUSES contains all expected statuses', () => {
  assert.equal(BOOKING_STATUSES.length, 7);
  assert.ok(BOOKING_STATUSES.includes('draft'));
  assert.ok(BOOKING_STATUSES.includes('pending_confirmation'));
  assert.ok(BOOKING_STATUSES.includes('confirmed'));
  assert.ok(BOOKING_STATUSES.includes('completed'));
  assert.ok(BOOKING_STATUSES.includes('cancelled'));
  assert.ok(BOOKING_STATUSES.includes('no_show'));
  assert.ok(BOOKING_STATUSES.includes('reschedule_requested'));
});

test('TERMINAL_STATUSES contains correct statuses', () => {
  assert.equal(TERMINAL_STATUSES.length, 3);
  assert.ok(TERMINAL_STATUSES.includes('completed'));
  assert.ok(TERMINAL_STATUSES.includes('cancelled'));
  assert.ok(TERMINAL_STATUSES.includes('no_show'));
});

// ============================================================================
// Valid Transition Tests (Happy Paths)
// ============================================================================

test('draft → pending_confirmation is valid (payment received)', () => {
  assert.equal(isValidTransition('draft', 'pending_confirmation'), true);
});

test('draft → cancelled is valid', () => {
  assert.equal(isValidTransition('draft', 'cancelled'), true);
});

test('pending_confirmation → confirmed is valid (guide accepts)', () => {
  assert.equal(isValidTransition('pending_confirmation', 'confirmed'), true);
});

test('pending_confirmation → cancelled is valid', () => {
  assert.equal(isValidTransition('pending_confirmation', 'cancelled'), true);
});

test('pending_confirmation → reschedule_requested is valid', () => {
  assert.equal(isValidTransition('pending_confirmation', 'reschedule_requested'), true);
});

test('confirmed → completed is valid (after activity)', () => {
  assert.equal(isValidTransition('confirmed', 'completed'), true);
});

test('confirmed → cancelled is valid', () => {
  assert.equal(isValidTransition('confirmed', 'cancelled'), true);
});

test('confirmed → no_show is valid', () => {
  assert.equal(isValidTransition('confirmed', 'no_show'), true);
});

test('confirmed → reschedule_requested is valid', () => {
  assert.equal(isValidTransition('confirmed', 'reschedule_requested'), true);
});

test('reschedule_requested → confirmed is valid (reschedule accepted)', () => {
  assert.equal(isValidTransition('reschedule_requested', 'confirmed'), true);
});

test('reschedule_requested → cancelled is valid', () => {
  assert.equal(isValidTransition('reschedule_requested', 'cancelled'), true);
});

// ============================================================================
// Invalid Transition Tests (Guard Logic)
// ============================================================================

test('same status transition is invalid', () => {
  BOOKING_STATUSES.forEach((status) => {
    assert.equal(isValidTransition(status, status), false, `${status} → ${status} should be invalid`);
  });
});

test('completed → any status is invalid (terminal)', () => {
  BOOKING_STATUSES.forEach((status) => {
    if (status !== 'completed') {
      assert.equal(isValidTransition('completed', status), false, `completed → ${status} should be invalid`);
    }
  });
});

test('cancelled → any status is invalid (terminal)', () => {
  BOOKING_STATUSES.forEach((status) => {
    if (status !== 'cancelled') {
      assert.equal(isValidTransition('cancelled', status), false, `cancelled → ${status} should be invalid`);
    }
  });
});

test('no_show → any status is invalid (terminal)', () => {
  BOOKING_STATUSES.forEach((status) => {
    if (status !== 'no_show') {
      assert.equal(isValidTransition('no_show', status), false, `no_show → ${status} should be invalid`);
    }
  });
});

test('draft → confirmed is invalid (must go through pending_confirmation)', () => {
  assert.equal(isValidTransition('draft', 'confirmed'), false);
});

test('draft → completed is invalid', () => {
  assert.equal(isValidTransition('draft', 'completed'), false);
});

test('draft → no_show is invalid', () => {
  assert.equal(isValidTransition('draft', 'no_show'), false);
});

test('draft → reschedule_requested is invalid', () => {
  assert.equal(isValidTransition('draft', 'reschedule_requested'), false);
});

test('pending_confirmation → completed is invalid', () => {
  assert.equal(isValidTransition('pending_confirmation', 'completed'), false);
});

test('pending_confirmation → no_show is invalid', () => {
  assert.equal(isValidTransition('pending_confirmation', 'no_show'), false);
});

test('reschedule_requested → completed is invalid', () => {
  assert.equal(isValidTransition('reschedule_requested', 'completed'), false);
});

test('reschedule_requested → no_show is invalid', () => {
  assert.equal(isValidTransition('reschedule_requested', 'no_show'), false);
});

test('reschedule_requested → pending_confirmation is invalid', () => {
  assert.equal(isValidTransition('reschedule_requested', 'pending_confirmation'), false);
});

test('confirmed → draft is invalid (backward transition)', () => {
  assert.equal(isValidTransition('confirmed', 'draft'), false);
});

test('confirmed → pending_confirmation is invalid (backward transition)', () => {
  assert.equal(isValidTransition('confirmed', 'pending_confirmation'), false);
});

// ============================================================================
// Terminal Status Tests
// ============================================================================

test('isTerminalStatus correctly identifies terminal statuses', () => {
  assert.equal(isTerminalStatus('completed'), true);
  assert.equal(isTerminalStatus('cancelled'), true);
  assert.equal(isTerminalStatus('no_show'), true);
});

test('isTerminalStatus correctly identifies non-terminal statuses', () => {
  assert.equal(isTerminalStatus('draft'), false);
  assert.equal(isTerminalStatus('pending_confirmation'), false);
  assert.equal(isTerminalStatus('confirmed'), false);
  assert.equal(isTerminalStatus('reschedule_requested'), false);
});

// ============================================================================
// getAllowedTransitions Tests
// ============================================================================

test('getAllowedTransitions returns correct transitions for draft', () => {
  const allowed = getAllowedTransitions('draft');
  assert.deepEqual(allowed, ['pending_confirmation', 'cancelled']);
});

test('getAllowedTransitions returns correct transitions for pending_confirmation', () => {
  const allowed = getAllowedTransitions('pending_confirmation');
  assert.deepEqual(allowed, ['confirmed', 'cancelled', 'reschedule_requested']);
});

test('getAllowedTransitions returns correct transitions for confirmed', () => {
  const allowed = getAllowedTransitions('confirmed');
  assert.deepEqual(allowed, ['completed', 'cancelled', 'no_show', 'reschedule_requested']);
});

test('getAllowedTransitions returns correct transitions for reschedule_requested', () => {
  const allowed = getAllowedTransitions('reschedule_requested');
  assert.deepEqual(allowed, ['confirmed', 'cancelled']);
});

test('getAllowedTransitions returns empty array for terminal statuses', () => {
  assert.deepEqual(getAllowedTransitions('completed'), []);
  assert.deepEqual(getAllowedTransitions('cancelled'), []);
  assert.deepEqual(getAllowedTransitions('no_show'), []);
});

// ============================================================================
// canCancel Tests
// ============================================================================

test('canCancel returns true for cancellable statuses', () => {
  assert.equal(canCancel('draft'), true);
  assert.equal(canCancel('pending_confirmation'), true);
  assert.equal(canCancel('confirmed'), true);
  assert.equal(canCancel('reschedule_requested'), true);
});

test('canCancel returns false for terminal statuses', () => {
  assert.equal(canCancel('completed'), false);
  assert.equal(canCancel('cancelled'), false);
  assert.equal(canCancel('no_show'), false);
});

// ============================================================================
// canComplete Tests
// ============================================================================

test('canComplete returns true only for confirmed status', () => {
  assert.equal(canComplete('confirmed'), true);
});

test('canComplete returns false for non-confirmed statuses', () => {
  assert.equal(canComplete('draft'), false);
  assert.equal(canComplete('pending_confirmation'), false);
  assert.equal(canComplete('reschedule_requested'), false);
  assert.equal(canComplete('completed'), false);
  assert.equal(canComplete('cancelled'), false);
  assert.equal(canComplete('no_show'), false);
});

// ============================================================================
// validateTransition Tests
// ============================================================================

test('validateTransition returns valid for allowed transitions', () => {
  const result = validateTransition('draft', 'pending_confirmation');
  assert.deepEqual(result, { valid: true });
});

test('validateTransition returns SAME_STATUS error for same status', () => {
  const result = validateTransition('confirmed', 'confirmed');
  assert.equal(result.valid, false);
  assert.equal(result.code, 'SAME_STATUS');
  assert.ok(result.message.includes('already in'));
});

test('validateTransition returns TERMINAL_STATUS error for terminal source', () => {
  const result = validateTransition('completed', 'confirmed');
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TERMINAL_STATUS');
  assert.ok(result.message.includes('terminal status'));
});

test('validateTransition returns INVALID_TRANSITION error for invalid transitions', () => {
  const result = validateTransition('draft', 'confirmed');
  assert.equal(result.valid, false);
  assert.equal(result.code, 'INVALID_TRANSITION');
  assert.ok(result.message.includes('Invalid transition'));
  assert.ok(result.message.includes('Allowed:'));
});

// ============================================================================
// Action Mapping Tests
// ============================================================================

test('ACTION_TO_STATUS maps confirm to confirmed', () => {
  assert.equal(ACTION_TO_STATUS['confirm'], 'confirmed');
});

test('ACTION_TO_STATUS maps complete to completed', () => {
  assert.equal(ACTION_TO_STATUS['complete'], 'completed');
});

test('ACTION_TO_STATUS maps cancel to cancelled', () => {
  assert.equal(ACTION_TO_STATUS['cancel'], 'cancelled');
});

test('ACTION_TO_STATUS maps reschedule_request to reschedule_requested', () => {
  assert.equal(ACTION_TO_STATUS['reschedule_request'], 'reschedule_requested');
});

test('ACTION_TO_STATUS maps reschedule_accept to confirmed', () => {
  assert.equal(ACTION_TO_STATUS['reschedule_accept'], 'confirmed');
});

test('ACTION_TO_STATUS maps mark_no_show to no_show', () => {
  assert.equal(ACTION_TO_STATUS['mark_no_show'], 'no_show');
});

test('ACTION_TO_STATUS maps payment_received to pending_confirmation', () => {
  assert.equal(ACTION_TO_STATUS['payment_received'], 'pending_confirmation');
});

// ============================================================================
// Full Workflow Tests
// ============================================================================

test('happy path: draft → pending_confirmation → confirmed → completed', () => {
  // Step 1: draft → pending_confirmation (payment received)
  assert.equal(isValidTransition('draft', 'pending_confirmation'), true);

  // Step 2: pending_confirmation → confirmed (guide accepts)
  assert.equal(isValidTransition('pending_confirmation', 'confirmed'), true);

  // Step 3: confirmed → completed (activity done)
  assert.equal(isValidTransition('confirmed', 'completed'), true);

  // Cannot go further
  assert.equal(isTerminalStatus('completed'), true);
});

test('cancellation path: any non-terminal → cancelled', () => {
  const nonTerminalStatuses = ['draft', 'pending_confirmation', 'confirmed', 'reschedule_requested'];

  nonTerminalStatuses.forEach((status) => {
    assert.equal(
      isValidTransition(status, 'cancelled'),
      true,
      `${status} → cancelled should be valid`
    );
  });
});

test('reschedule flow: confirmed → reschedule_requested → confirmed', () => {
  // Request reschedule
  assert.equal(isValidTransition('confirmed', 'reschedule_requested'), true);

  // Accept reschedule (back to confirmed)
  assert.equal(isValidTransition('reschedule_requested', 'confirmed'), true);
});

test('no-show path: confirmed → no_show', () => {
  assert.equal(isValidTransition('confirmed', 'no_show'), true);
  assert.equal(isTerminalStatus('no_show'), true);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('unknown status returns empty allowed transitions', () => {
  const allowed = getAllowedTransitions('unknown_status');
  assert.deepEqual(allowed, []);
});

test('transition from unknown status is invalid', () => {
  assert.equal(isValidTransition('unknown_status', 'confirmed'), false);
});

test('transition to unknown status is invalid', () => {
  assert.equal(isValidTransition('draft', 'unknown_status'), false);
});

// ============================================================================
// State Coverage Tests
// ============================================================================

test('all non-terminal statuses have at least one outgoing transition', () => {
  const nonTerminalStatuses = BOOKING_STATUSES.filter(
    (status) => !TERMINAL_STATUSES.includes(status)
  );

  nonTerminalStatuses.forEach((status) => {
    const allowed = getAllowedTransitions(status);
    assert.ok(
      allowed.length > 0,
      `Non-terminal status '${status}' should have at least one transition`
    );
  });
});

test('all terminal statuses have zero outgoing transitions', () => {
  TERMINAL_STATUSES.forEach((status) => {
    const allowed = getAllowedTransitions(status);
    assert.equal(
      allowed.length,
      0,
      `Terminal status '${status}' should have zero transitions`
    );
  });
});

test('all non-terminal statuses can be cancelled', () => {
  const nonTerminalStatuses = BOOKING_STATUSES.filter(
    (status) => !TERMINAL_STATUSES.includes(status)
  );

  nonTerminalStatuses.forEach((status) => {
    assert.equal(canCancel(status), true, `Non-terminal status '${status}' should be cancellable`);
  });
});

console.log('All Booking State Service tests completed!');
