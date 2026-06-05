/**
 * Issue #1212 — Booking V2 canonical zh-TW reason copy.
 *
 * Single source of truth for the zh-TW strings that Admin preview,
 * Guide availability page, and Traveler activity / booking page show
 * when a slot is in a given `CanonicalAvailabilityState`. Today each
 * surface builds its own copy from local data; that drift is what
 * issue #1212 acceptance criterion 4 ("cross-surface semantics
 * consistent") is meant to fix.
 *
 * This file is the shared helper — wiring the three surfaces to use
 * it is intentionally left to a follow-up cross-surface PR (which
 * also requires the visual QA pass described in issue #1212), same
 * pattern as #1174/#1171/#1175/#1106 → endpoint slices.
 *
 * Copy guidelines (per BRAND_BOOK.md / CLAUDE.md):
 *   - Traditional Chinese (zh-Hant), operator-readable, never raw
 *     English codes.
 *   - `titleZh` is one short phrase suitable for badges / chips.
 *   - `bodyZh` is one full sentence suitable for tooltip / detail row.
 *   - No PII in the copy itself; `metadata` can carry numeric / id
 *     context the caller chooses to interpolate (e.g. capacityLeft),
 *     but this helper does NOT pull any traveler email / phone /
 *     payment payload into the string.
 */

import type { CanonicalAvailabilityState } from './effective-availability-resolver';

export interface CanonicalReasonCopy {
  titleZh: string;
  bodyZh: string;
}

/**
 * Source-of-truth list of every state this helper covers. Tests
 * iterate this constant so adding a new state to the resolver
 * without updating this helper fails the test, not production.
 */
export const CANONICAL_AVAILABILITY_STATES = [
  'available',
  'full',
  'closed',
  'blackout',
  'inactive_plan',
  'outside_rule',
  'outside_season',
  'blocked_by_conflict',
  'allowed_with_admin_override',
] as const;

export function getCanonicalReasonCopy(
  state: CanonicalAvailabilityState | string,
  _metadata?: Record<string, string | number> | null,
): CanonicalReasonCopy {
  switch (state) {
    case 'available':
      return {
        titleZh: '可預約',
        bodyZh: '此時段目前可預約。',
      };
    case 'full':
      return {
        titleZh: '已額滿',
        bodyZh: '此時段名額已滿，請選擇其他時段或日期。',
      };
    case 'closed':
      return {
        titleZh: '已關閉',
        bodyZh: '此時段已被導遊或管理者關閉，請選擇其他時段。',
      };
    case 'blackout':
      return {
        titleZh: '導遊不可服務',
        bodyZh: '導遊在此時段標記為不可服務，請選擇其他時段或日期。',
      };
    case 'inactive_plan':
      return {
        titleZh: '方案未啟用',
        bodyZh: '此方案目前未啟用，無法預約。請從活動頁重新選擇方案。',
      };
    case 'outside_rule':
      return {
        titleZh: '不在可預約時段',
        bodyZh: '導遊未在此時段開放可預約時間，請選擇其他時段。',
      };
    case 'outside_season':
      return {
        titleZh: '不在開放季節',
        bodyZh: '此方案目前不在開放季節範圍內，請選擇其他日期。',
      };
    case 'blocked_by_conflict':
      return {
        titleZh: '時段衝突',
        bodyZh: '此時段與既有預約衝突，預設不可預約。',
      };
    case 'allowed_with_admin_override':
      return {
        titleZh: '管理者例外開放',
        bodyZh: '此時段與既有預約衝突，但已被管理者例外開放，請確認助手安排。',
      };
    default:
      return {
        titleZh: '無法預約',
        bodyZh: '此時段目前無法預約，請稍後再試或聯絡客服。',
      };
  }
}
