/**
 * Failure-Rate Threshold Detectors
 * Phase 13 — Tour Platform (Issue #327)
 *
 * Pure functions — no side-effects, no network calls.
 * All comparisons use strict greater-than (>) so the boundary value itself does NOT trigger an alert.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single ECPay payment callback event with its outcome. */
export interface FailureEvent {
  /** Unix timestamp in milliseconds (Date.now() style). */
  timestamp: number;
  /** Outcome of the callback. */
  status: 'failed' | 'success';
}

/** A single query duration sample. */
export interface QuerySample {
  /** Unix timestamp in milliseconds (Date.now() style). */
  timestamp: number;
  /** Query execution time in milliseconds. */
  durationMs: number;
}

// ── Detectors ─────────────────────────────────────────────────────────────────

/**
 * Returns true when the number of **failed** ECPay callback events within the
 * sliding window **strictly exceeds** the given threshold.
 *
 * Boundary rule: `failures.length > threshold`
 * — i.e. at threshold=3, exactly 3 failures → false; 4 failures → true.
 *
 * @param events    Array of ECPay callback events (any time range).
 * @param windowMs  Rolling window size in milliseconds (measured from Date.now()).
 * @param threshold Alert fires when failure count is **strictly greater than** this value.
 *
 * @example
 * // 4 failures in 60-min window, threshold=3 → true
 * shouldAlertEcpayFailures(events, 60 * 60 * 1000, 3); // true
 *
 * // 3 failures in 60-min window, threshold=3 → false (boundary)
 * shouldAlertEcpayFailures(events, 60 * 60 * 1000, 3); // false
 */
export function shouldAlertEcpayFailures(
  events: FailureEvent[],
  windowMs: number,
  threshold: number
): boolean {
  const cutoff = Date.now() - windowMs;
  const failures = events.filter(
    (e) => e.status === 'failed' && e.timestamp >= cutoff
  );
  return failures.length > threshold;
}

/**
 * Returns true when the number of **slow** query samples (durationMs **strictly
 * greater than** 1000 ms) within the sliding window **strictly exceeds** the
 * given threshold.
 *
 * Boundary rule: `slow.length > threshold`
 * — i.e. at threshold=5, exactly 5 slow samples → false; 6 → true.
 *
 * @param samples   Array of query samples (any time range).
 * @param windowMs  Rolling window size in milliseconds (measured from Date.now()).
 * @param threshold Alert fires when slow-query count is **strictly greater than** this value.
 *
 * @example
 * // 6 samples all >1000ms in 60-sec window, threshold=5 → true
 * shouldAlertSlowQueries(samples, 60_000, 5); // true
 *
 * // 5 samples all >1000ms in 60-sec window, threshold=5 → false (boundary)
 * shouldAlertSlowQueries(samples, 60_000, 5); // false
 */
export function shouldAlertSlowQueries(
  samples: QuerySample[],
  windowMs: number,
  threshold: number
): boolean {
  const cutoff = Date.now() - windowMs;
  const slow = samples.filter(
    (s) => s.timestamp >= cutoff && s.durationMs > 1000
  );
  return slow.length > threshold;
}
