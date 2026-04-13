/**
 * Booking State Service (TP-BP-006)
 *
 * Manages booking status transitions with guards and audit logging.
 *
 * Booking Status Flow:
 *   draft → pending_confirmation → confirmed → completed
 *                               ↘            ↘ no_show
 *                         reschedule_requested ↗
 *                                              → cancelled
 *
 * Terminal States: completed, cancelled, no_show
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Valid booking statuses
export const BOOKING_STATUSES = [
  'draft',
  'pending_confirmation',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_requested',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

// Terminal states that cannot transition to any other state
export const TERMINAL_STATUSES: BookingStatus[] = ['completed', 'cancelled', 'no_show'];

// Valid state transitions
// Key: current status, Value: array of valid next statuses
export const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft: ['pending_confirmation', 'cancelled'],
  pending_confirmation: ['confirmed', 'cancelled', 'reschedule_requested'],
  confirmed: ['completed', 'cancelled', 'no_show', 'reschedule_requested'],
  reschedule_requested: ['confirmed', 'cancelled'],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
  no_show: [], // Terminal state
};

// Transition actions (human-readable names for common transitions)
export type TransitionAction =
  | 'confirm'
  | 'complete'
  | 'cancel'
  | 'reschedule_request'
  | 'reschedule_accept'
  | 'mark_no_show'
  | 'payment_received';

// Map actions to their target statuses
export const ACTION_TO_STATUS: Record<TransitionAction, BookingStatus> = {
  confirm: 'confirmed',
  complete: 'completed',
  cancel: 'cancelled',
  reschedule_request: 'reschedule_requested',
  reschedule_accept: 'confirmed',
  mark_no_show: 'no_show',
  payment_received: 'pending_confirmation',
};

// Actor roles
export type ActorRole = 'traveler' | 'guide' | 'admin' | 'system';

// Transition context
export interface TransitionContext {
  actorUserId?: string | null;
  actorRole: ActorRole;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Transition result
export interface TransitionResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
  };
  booking?: {
    id: string;
    booking_no: string;
    status: BookingStatus;
    previousStatus: BookingStatus;
  };
}

/**
 * Check if a status transition is valid
 */
export function isValidTransition(
  fromStatus: BookingStatus,
  toStatus: BookingStatus
): boolean {
  if (fromStatus === toStatus) return false;
  return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

/**
 * Check if a status is terminal (cannot transition)
 */
export function isTerminalStatus(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Get allowed next statuses for a given status
 */
export function getAllowedTransitions(status: BookingStatus): BookingStatus[] {
  return VALID_TRANSITIONS[status] ?? [];
}

/**
 * Check if a booking can be cancelled from its current status
 */
export function canCancel(status: BookingStatus): boolean {
  return VALID_TRANSITIONS[status]?.includes('cancelled') ?? false;
}

/**
 * Check if a booking can be completed from its current status
 */
export function canComplete(status: BookingStatus): boolean {
  return VALID_TRANSITIONS[status]?.includes('completed') ?? false;
}

/**
 * Validate transition and return error if invalid
 */
export function validateTransition(
  fromStatus: BookingStatus,
  toStatus: BookingStatus
): { valid: true } | { valid: false; code: string; message: string } {
  // Cannot transition to the same status
  if (fromStatus === toStatus) {
    return {
      valid: false,
      code: 'SAME_STATUS',
      message: `Booking is already in '${fromStatus}' status`,
    };
  }

  // Check if from status is terminal
  if (isTerminalStatus(fromStatus)) {
    return {
      valid: false,
      code: 'TERMINAL_STATUS',
      message: `Cannot transition from terminal status '${fromStatus}'`,
    };
  }

  // Check if transition is valid
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

/**
 * Booking State Service
 *
 * Handles booking status transitions with validation and audit logging.
 */
export class BookingStateService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Transition a booking to a new status
   */
  async transition(
    bookingId: string,
    toStatus: BookingStatus,
    context: TransitionContext
  ): Promise<TransitionResult> {
    try {
      // 1. Fetch current booking
      const { data: booking, error: fetchError } = await this.supabase
        .from('bookings')
        .select('id, booking_no, status')
        .eq('id', bookingId)
        .single();

      if (fetchError || !booking) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Booking not found',
          },
        };
      }

      const fromStatus = booking.status as BookingStatus;

      // 2. Validate transition
      const validation = validateTransition(fromStatus, toStatus);
      if (!validation.valid) {
        return {
          success: false,
          error: {
            code: validation.code,
            message: validation.message,
          },
        };
      }

      // 3. Build update data
      const updateData: Record<string, unknown> = {
        status: toStatus,
      };

      // Set timestamp fields based on target status
      if (toStatus === 'confirmed') {
        updateData.confirmed_at = new Date().toISOString();
      } else if (toStatus === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (toStatus === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString();
      }

      // 4. Update booking status
      const { error: updateError } = await this.supabase
        .from('bookings')
        .update(updateData)
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking status:', updateError);
        return {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: 'Failed to update booking status',
          },
        };
      }

      // 5. Create audit log entry
      const { error: logError } = await this.supabase
        .from('booking_status_logs')
        .insert({
          booking_id: bookingId,
          from_status: fromStatus,
          to_status: toStatus,
          actor_user_id: context.actorUserId || null,
          actor_role: context.actorRole,
          reason: context.reason || null,
          metadata: context.metadata || null,
        });

      if (logError) {
        console.error('Error creating status log:', logError);
        // Non-fatal, continue
      }

      return {
        success: true,
        booking: {
          id: bookingId,
          booking_no: booking.booking_no,
          status: toStatus,
          previousStatus: fromStatus,
        },
      };
    } catch (err) {
      console.error('BookingStateService.transition error:', err);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Perform a named action on a booking
   */
  async performAction(
    bookingId: string,
    action: TransitionAction,
    context: TransitionContext
  ): Promise<TransitionResult> {
    const toStatus = ACTION_TO_STATUS[action];
    if (!toStatus) {
      return {
        success: false,
        error: {
          code: 'INVALID_ACTION',
          message: `Unknown action: ${action}`,
        },
      };
    }
    return this.transition(bookingId, toStatus, context);
  }

  /**
   * Confirm a booking (pending_confirmation → confirmed)
   */
  async confirm(bookingId: string, context: TransitionContext): Promise<TransitionResult> {
    return this.performAction(bookingId, 'confirm', context);
  }

  /**
   * Complete a booking (confirmed → completed)
   */
  async complete(bookingId: string, context: TransitionContext): Promise<TransitionResult> {
    return this.performAction(bookingId, 'complete', context);
  }

  /**
   * Cancel a booking
   */
  async cancel(bookingId: string, context: TransitionContext): Promise<TransitionResult> {
    return this.performAction(bookingId, 'cancel', context);
  }

  /**
   * Request a reschedule (confirmed → reschedule_requested)
   */
  async requestReschedule(
    bookingId: string,
    context: TransitionContext
  ): Promise<TransitionResult> {
    return this.performAction(bookingId, 'reschedule_request', context);
  }

  /**
   * Accept a reschedule request (reschedule_requested → confirmed)
   */
  async acceptReschedule(
    bookingId: string,
    context: TransitionContext
  ): Promise<TransitionResult> {
    return this.performAction(bookingId, 'reschedule_accept', context);
  }

  /**
   * Mark booking as no-show (confirmed → no_show)
   */
  async markNoShow(bookingId: string, context: TransitionContext): Promise<TransitionResult> {
    return this.performAction(bookingId, 'mark_no_show', context);
  }

  /**
   * Handle payment received (draft → pending_confirmation)
   */
  async paymentReceived(
    bookingId: string,
    context: TransitionContext
  ): Promise<TransitionResult> {
    return this.performAction(bookingId, 'payment_received', context);
  }

  /**
   * Get booking with its status history
   */
  async getBookingWithHistory(bookingId: string): Promise<{
    booking: {
      id: string;
      booking_no: string;
      status: BookingStatus;
    } | null;
    history: Array<{
      from_status: string | null;
      to_status: string;
      actor_role: string;
      reason: string | null;
      created_at: string;
    }>;
  }> {
    const [bookingResult, historyResult] = await Promise.all([
      this.supabase
        .from('bookings')
        .select('id, booking_no, status')
        .eq('id', bookingId)
        .single(),
      this.supabase
        .from('booking_status_logs')
        .select('from_status, to_status, actor_role, reason, created_at')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true }),
    ]);

    return {
      booking: bookingResult.data as {
        id: string;
        booking_no: string;
        status: BookingStatus;
      } | null,
      history: historyResult.data || [],
    };
  }
}
