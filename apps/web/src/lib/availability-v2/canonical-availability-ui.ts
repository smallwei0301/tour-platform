export interface UiActiveSeasonSummary {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  label: string;
}

import { getCanonicalReasonCopy } from './canonical-reason-copy.ts';

export type CanonicalPreviewTone = 'info' | 'success' | 'warning';

function monthDayToNumber(month: number, day: number): number {
  return month * 100 + day;
}

function isWithinSeason(dateMonth: number, dateDay: number, season: UiActiveSeasonSummary): boolean {
  const dateValue = monthDayToNumber(dateMonth, dateDay);
  const start = monthDayToNumber(season.startMonth, season.startDay);
  const end = monthDayToNumber(season.endMonth, season.endDay);

  if (start <= end) {
    return dateValue >= start && dateValue <= end;
  }

  return dateValue >= start || dateValue <= end;
}

function parseDateParts(date: string): [number, number, number] | null {
  const parts = date.split('-').map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return null;
  const [year, month, day] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [year, month, day];
}

function isDateInsideAnySeason(date: string, seasons: UiActiveSeasonSummary[]): boolean {
  const parts = parseDateParts(date);
  if (!parts) return false;
  const [, month, day] = parts;
  return seasons.some((season) => isWithinSeason(month, day, season));
}

function addDaysToDateString(date: string, days: number): string | null {
  const parts = parseDateParts(date);
  if (!parts) return null;
  const [year, month, day] = parts;
  const utcDate = new Date(Date.UTC(year, month - 1, day + days));
  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
}

function hasOutsideSeasonDateInRange(start: string, end: string, seasons: UiActiveSeasonSummary[]): boolean {
  if (!parseDateParts(start) || !parseDateParts(end) || start > end) {
    return false;
  }

  const limit = 370;
  let steps = 0;
  let cursor = start;

  while (cursor <= end && steps < limit) {
    if (!isDateInsideAnySeason(cursor, seasons)) {
      return true;
    }
    const next = addDaysToDateString(cursor, 1);
    if (!next) return false;
    cursor = next;
    steps += 1;
  }

  return false;
}

export function describePlanSeasonStatus(params: {
  isYearRound?: boolean | null;
  activeSeasonSummaries?: UiActiveSeasonSummary[] | null;
}): {
  badge: string;
  title: string;
  description: string;
  tone: CanonicalPreviewTone;
} {
  const seasons = params.activeSeasonSummaries || [];

  if (params.isYearRound) {
    return {
      badge: '全年開放',
      title: '方案開放季節：全年開放',
      description: '此方案已明確設定全年開放，可用來安排所有季節的開放日。',
      tone: 'success',
    };
  }

  if (seasons.length > 0) {
    return {
      badge: '指定季節',
      title: '方案開放季節：指定季節',
      description: `此方案僅在以下季節開放：${seasons.map((season) => season.label).join('、')}`,
      tone: 'info',
    };
  }

  return {
    badge: '尚未設定季節',
    title: '方案開放季節：尚未設定',
    description: '此方案尚未設定開放季節。請選擇「全年開放」或新增指定季節，避免旅客可預約日期不明確。',
    tone: 'warning',
  };
}

// Operator-facing label per state. The body text comes from
// `getCanonicalReasonCopy(...)` so Admin / Guide / Traveler all read the
// same canonical reason text for the same state — that's #1212's
// acceptance criterion 1. The label is admin/guide-specific (it's
// shown as a UI chip / heading) so it keeps the existing operator
// language; only the description below converges on the canonical copy.
const LABEL_BY_STATE: Record<string, string> = {
  available: '可預約',
  full: '已額滿',
  closed: '已關閉',
  blackout: '導遊不可服務',
  inactive_plan: '方案未啟用',
  outside_rule: '不在可預約時段',
  outside_season: '不在方案開放季節內',
  blocked_by_conflict: '既有衝突，暫不可開放',
  allowed_with_admin_override: '管理員覆寫後可開放',
};

const TONE_BY_STATE: Record<string, CanonicalPreviewTone> = {
  available: 'success',
  full: 'warning',
  closed: 'warning',
  blackout: 'warning',
  inactive_plan: 'warning',
  outside_rule: 'warning',
  outside_season: 'warning',
  blocked_by_conflict: 'warning',
  allowed_with_admin_override: 'warning',
};

export function describePreviewReason(params: {
  previewCanonicalState?: string | null;
  previewSeasonGate?: string | null;
}): {
  tone: CanonicalPreviewTone;
  label: string;
  description: string;
} {
  const canonicalState = params.previewCanonicalState || null;
  const seasonGate = params.previewSeasonGate || null;

  // seasonGate metadata wins first: it carries admin-configuration hints
  // (e.g. `no_active_season` = "you haven't set any seasons yet"; that
  // matters even when the canonical state happens to be `outside_season`
  // because the actionable advice is "configure seasons", not "pick
  // another date"). These are admin/guide-flavoured config warnings, not
  // booking-time reject reasons — so they keep their own description
  // text and do NOT route through `getCanonicalReasonCopy`.
  if (seasonGate === 'no_active_season') {
    return {
      tone: 'warning',
      label: '方案尚未設定開放季節',
      description: '目前沒有任何啟用中的季節設定，預設為全部開放；請設定季節以限制可預約日期。',
    };
  }

  if (seasonGate === 'explicit_year_round') {
    return {
      tone: 'success',
      label: '方案已設定全年開放',
      description: '此方案已明確設定全年開放，不受季節限制。',
    };
  }

  if (seasonGate === 'inside_season') {
    return {
      tone: 'success',
      label: '位於方案開放季節內',
      description: '預覽日期位於方案的有效開放季節中。',
    };
  }

  // For the remaining cases the canonical state is the contract per #1212:
  // we read the cross-surface bodyZh from `getCanonicalReasonCopy()` so
  // Admin / Guide / Traveler can all render the same description for
  // the same state. Label stays admin-flavoured (it's a UI chip).
  if (canonicalState && LABEL_BY_STATE[canonicalState]) {
    return {
      tone: TONE_BY_STATE[canonicalState] ?? 'info',
      label: LABEL_BY_STATE[canonicalState],
      description: getCanonicalReasonCopy(canonicalState).bodyZh,
    };
  }

  return {
    tone: 'info',
    label: '尚無 canonical 狀態',
    description: getCanonicalReasonCopy('').bodyZh,
  };
}

export function describeRuleSeasonConflict(params: {
  ruleMode: 'weekly' | 'single-day';
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  singleDate?: string | null;
  activeSeasonSummaries?: UiActiveSeasonSummary[] | null;
  isYearRound?: boolean | null;
}): {
  tone: CanonicalPreviewTone;
  message: string;
} | null {
  if (params.isYearRound) return null;

  const seasons = params.activeSeasonSummaries || [];
  if (seasons.length === 0) return null;

  if (params.ruleMode === 'single-day') {
    if (params.singleDate && !isDateInsideAnySeason(params.singleDate, seasons)) {
      return {
        tone: 'warning',
        message: '這一天不在方案開放季節內，因此不會開放給旅客預約。',
      };
    }
    return null;
  }

  if (params.effectiveFrom && params.effectiveTo && hasOutsideSeasonDateInRange(params.effectiveFrom, params.effectiveTo, seasons)) {
    return {
      tone: 'warning',
      message: '你設定的日期包含方案非開放季節；非季節日期不會產生可預約場次。',
    };
  }

  return null;
}
