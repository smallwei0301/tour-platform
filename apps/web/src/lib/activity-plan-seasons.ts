const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_ACTIVITY_PLAN_SEASON_TIMEZONE = 'Asia/Taipei';
export const ACTIVITY_PLAN_SEASON_SELECT_COLUMNS = [
  'id',
  'name',
  'start_month',
  'start_day',
  'end_month',
  'end_day',
  'timezone',
  'is_active',
  'created_at',
  'updated_at',
].join(', ');

export interface ActivityPlanSeasonPayload {
  name?: string;
  start_month?: number;
  start_day?: number;
  end_month?: number;
  end_day?: number;
  timezone?: string;
  is_active?: boolean;
}

export function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

function daysInMonth(month: number) {
  return new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

function normalizeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

function isValidMonthDay(month: number, day: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  return day <= daysInMonth(month);
}

function normalizeTimezone(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_ACTIVITY_PLAN_SEASON_TIMEZONE;
  }
  return value.trim();
}

export function shapeActivityPlanSeason(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    start_month: row.start_month,
    start_day: row.start_day,
    end_month: row.end_month,
    end_day: row.end_day,
    timezone: row.timezone,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function sortActivityPlanSeasons<T extends Record<string, unknown>>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const comparisons: Array<[number, number]> = [
      [Number(a.start_month), Number(b.start_month)],
      [Number(a.start_day), Number(b.start_day)],
      [Number(a.end_month), Number(b.end_month)],
      [Number(a.end_day), Number(b.end_day)],
    ];

    for (const [left, right] of comparisons) {
      if (left !== right) return left - right;
    }

    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function validateCreateActivityPlanSeasonPayload(input: ActivityPlanSeasonPayload) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    return { ok: false as const, message: 'name is required' };
  }

  const startMonth = normalizeInteger(input.start_month);
  const startDay = normalizeInteger(input.start_day);
  const endMonth = normalizeInteger(input.end_month);
  const endDay = normalizeInteger(input.end_day);

  if (
    !isValidMonthDay(Number(startMonth), Number(startDay)) ||
    !isValidMonthDay(Number(endMonth), Number(endDay))
  ) {
    return { ok: false as const, message: 'Invalid month/day bounds' };
  }

  if (input.is_active !== undefined && typeof input.is_active !== 'boolean') {
    return { ok: false as const, message: 'is_active must be a boolean' };
  }

  return {
    ok: true as const,
    value: {
      name,
      start_month: startMonth,
      start_day: startDay,
      end_month: endMonth,
      end_day: endDay,
      timezone: normalizeTimezone(input.timezone),
      is_active: input.is_active ?? true,
    },
  };
}

type ActivityPlanSeasonDateBounds = Pick<
  Required<ActivityPlanSeasonPayload>,
  'start_month' | 'start_day' | 'end_month' | 'end_day'
>;

export function validateUpdateActivityPlanSeasonPayload(
  input: ActivityPlanSeasonPayload,
  existing?: Partial<ActivityPlanSeasonDateBounds>
) {
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      return { ok: false as const, message: 'name cannot be empty' };
    }
    update.name = input.name.trim();
  }

  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || input.timezone.trim().length === 0) {
      return { ok: false as const, message: 'timezone cannot be empty' };
    }
    update.timezone = input.timezone.trim();
  }

  if (input.is_active !== undefined) {
    if (typeof input.is_active !== 'boolean') {
      return { ok: false as const, message: 'is_active must be a boolean' };
    }
    update.is_active = input.is_active;
  }

  const normalized = {
    start_month: normalizeInteger(input.start_month),
    start_day: normalizeInteger(input.start_day),
    end_month: normalizeInteger(input.end_month),
    end_day: normalizeInteger(input.end_day),
  };

  for (const [key, value] of Object.entries(normalized)) {
    if (value !== undefined) {
      if (!Number.isInteger(value)) {
        return { ok: false as const, message: `${key} must be an integer` };
      }
      update[key] = value;
    }
  }

  const resolvedStartMonth = Number(update.start_month ?? existing?.start_month ?? 1);
  const resolvedStartDay = Number(update.start_day ?? existing?.start_day ?? 1);
  const resolvedEndMonth = Number(update.end_month ?? existing?.end_month ?? 1);
  const resolvedEndDay = Number(update.end_day ?? existing?.end_day ?? 1);

  if (
    (update.start_month !== undefined || update.start_day !== undefined) &&
    !isValidMonthDay(resolvedStartMonth, resolvedStartDay)
  ) {
    return { ok: false as const, message: 'Invalid start month/day bounds' };
  }

  if (
    (update.end_month !== undefined || update.end_day !== undefined) &&
    !isValidMonthDay(resolvedEndMonth, resolvedEndDay)
  ) {
    return { ok: false as const, message: 'Invalid end month/day bounds' };
  }

  return { ok: true as const, value: update };
}
