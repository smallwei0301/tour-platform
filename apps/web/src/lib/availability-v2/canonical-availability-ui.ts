export interface UiActiveSeasonSummary {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  label: string;
}

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

  if (canonicalState === 'allowed_with_admin_override') {
    return {
      tone: 'warning',
      label: '管理員覆寫後可開放',
      description: '此結果仰賴管理員覆寫，請勿視為一般可預約狀態。',
    };
  }

  if (canonicalState === 'blocked_by_conflict') {
    return {
      tone: 'warning',
      label: '既有衝突，暫不可開放',
      description: '此時段與既有預約、黑名單或其他衝突條件重疊。',
    };
  }

  if (seasonGate === 'no_active_season') {
    return {
      tone: 'warning',
      label: '方案尚未設定開放季節',
      description: '目前沒有任何啟用中的季節設定，因此不會產生可預約場次。',
    };
  }

  if (seasonGate === 'outside_season' || canonicalState === 'outside_season') {
    return {
      tone: 'warning',
      label: '不在方案開放季節內',
      description: '預覽日期落在非開放季節，因此不會產生可預約場次。',
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

  return {
    tone: canonicalState === 'available' ? 'success' : 'info',
    label: canonicalState ? `狀態：${canonicalState}` : '尚無 canonical 狀態',
    description: seasonGate ? `seasonGate：${seasonGate}` : '目前 API 未提供額外可讀原因。',
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
