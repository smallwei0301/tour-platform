/**
 * Issue #1072 — canonical status helper for /api/admin/qa filter.
 *
 * The DB CHECK constraint on activity_qa.status allows only:
 *   'pending_moderation' | 'approved' | 'rejected'
 * Old admin UI revisions sent ?status=pending, which never matched a row.
 * This helper aliases the legacy value to the canonical one and passes
 * everything else through unchanged so the caller can still treat an empty
 * input as "no filter".
 */
export function normalizeAdminQAStatusFilter(input) {
  if (input === 'pending') return 'pending_moderation';
  return input;
}
