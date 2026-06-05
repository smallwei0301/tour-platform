import { getDateStringInTimezone } from '../slot-generator.ts';

export interface PreviewActivityPlanSeason {
  id: string;
  activity_plan_id: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  timezone?: string | null;
  is_active: boolean;
}

export interface ActiveSeasonSummary {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  label: string;
}

export interface PreviewCanonicalReason {
  canonicalState: 'available' | 'outside_season';
  seasonGate: 'explicit_year_round' | 'no_active_season' | 'inside_season' | 'outside_season';
}

function monthDayToNumber(month: number, day: number): number {
  return month * 100 + day;
}

function isWithinSeason(dateMonth: number, dateDay: number, season: PreviewActivityPlanSeason): boolean {
  const dateValue = monthDayToNumber(dateMonth, dateDay);
  const start = monthDayToNumber(season.start_month, season.start_day);
  const end = monthDayToNumber(season.end_month, season.end_day);

  if (start <= end) {
    return dateValue >= start && dateValue <= end;
  }

  return dateValue >= start || dateValue <= end;
}

export function summarizeActivePlanSeasons(seasons: PreviewActivityPlanSeason[]): ActiveSeasonSummary[] {
  return seasons
    .filter((season) => season.is_active)
    .map((season) => ({
      startMonth: season.start_month,
      startDay: season.start_day,
      endMonth: season.end_month,
      endDay: season.end_day,
      label: `每年 ${season.start_month}/${season.start_day} - ${season.end_month}/${season.end_day}`,
    }));
}

export function resolvePreviewCanonicalReason(params: {
  requestedDate: string;
  timezone: string;
  isYearRound?: boolean | null;
  seasons: PreviewActivityPlanSeason[];
}): PreviewCanonicalReason {
  const activeSeasons = params.seasons.filter((season) => season.is_active);

  if (activeSeasons.length === 0) {
    if (params.isYearRound) {
      return {
        canonicalState: 'available',
        seasonGate: 'explicit_year_round',
      };
    }

    return {
      canonicalState: 'outside_season',
      seasonGate: 'no_active_season',
    };
  }

  const normalizedDate = params.requestedDate.includes('T')
    ? getDateStringInTimezone(new Date(params.requestedDate), params.timezone)
    : params.requestedDate;
  const [, month, day] = normalizedDate.split('-').map(Number);

  const inSeason = activeSeasons.some((season) => isWithinSeason(month, day, season));

  return {
    canonicalState: inSeason ? 'available' : 'outside_season',
    seasonGate: inSeason ? 'inside_season' : 'outside_season',
  };
}
