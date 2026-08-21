/**
 * Issue #1760 Stage 2 — /midao2 行事曆 canonical 可用性純函式層。
 *
 * Owner 不可變決議 U-1：morning=09:00–12:00、afternoon=13:00–17:00、evening=18:00–21:00。
 * canonical 區間形狀固定為 `[{ startTimeLocal:'HH:MM', endTimeLocal:'HH:MM' }]`；
 * 空陣列代表當日關閉（is_closed=true），區間之間不得重疊。
 *
 * 本檔只做純映射/投影，不碰資料庫、不做第二套可用性真相。
 */

export type MidaoSegment = 'morning' | 'afternoon' | 'evening';

export interface CanonicalRange {
  startTimeLocal: string;
  endTimeLocal: string;
}

export interface MidaoSegmentSelection {
  morning?: boolean;
  afternoon?: boolean;
  evening?: boolean;
}

export interface MidaoSegmentProjection {
  morning: boolean;
  afternoon: boolean;
  evening: boolean;
  custom: CanonicalRange[];
}

export const MIDAO_SEGMENTS: MidaoSegment[] = ['morning', 'afternoon', 'evening'];

export const MIDAO_SEGMENT_RANGES: Record<MidaoSegment, CanonicalRange> = {
  morning: { startTimeLocal: '09:00', endTimeLocal: '12:00' },
  afternoon: { startTimeLocal: '13:00', endTimeLocal: '17:00' },
  evening: { startTimeLocal: '18:00', endTimeLocal: '21:00' },
};

export const MIDAO_DEFAULT_TIMEZONE = 'Asia/Taipei';

const HHMM_RE = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

/** 'HH:MM' → 當日分鐘數；格式非法回傳 null。 */
export function hhmmToMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !HHMM_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** canonical 區間驗證：格式、起<訖、互不重疊。違反時丟出含 INVALID_RANGES 的錯誤。 */
export function assertNoOverlap(ranges: unknown): CanonicalRange[] {
  if (!Array.isArray(ranges)) {
    throw new Error('INVALID_RANGES: ranges 需為陣列');
  }
  const parsed = ranges.map((range) => {
    const start = hhmmToMinutes((range as CanonicalRange)?.startTimeLocal);
    const end = hhmmToMinutes((range as CanonicalRange)?.endTimeLocal);
    if (start === null || end === null) {
      throw new Error('INVALID_RANGES: 時間格式需為 HH:MM（00:00–23:59）');
    }
    if (start >= end) {
      throw new Error('INVALID_RANGES: 開始時間需早於結束時間');
    }
    return {
      start,
      end,
      range: {
        startTimeLocal: (range as CanonicalRange).startTimeLocal,
        endTimeLocal: (range as CanonicalRange).endTimeLocal,
      },
    };
  });
  const sorted = [...parsed].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error('INVALID_RANGES: 區間不得重疊');
    }
  }
  return sorted.map((entry) => entry.range);
}

/** 驗證＋排序＋相鄰合併（09:00-12:00 與 12:00-13:00 併為 09:00-13:00）。 */
export function normalizeCanonicalRanges(ranges: unknown): CanonicalRange[] {
  const sorted = assertNoOverlap(ranges);
  const merged: CanonicalRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.endTimeLocal === range.startTimeLocal) {
      merged[merged.length - 1] = {
        startTimeLocal: last.startTimeLocal,
        endTimeLocal: range.endTimeLocal,
      };
      continue;
    }
    merged.push(range);
  }
  return merged;
}

/**
 * U-1 段別勾選（＋自訂時段）→ canonical 區間。全關且無自訂 → `[]`（closed）。
 * 只排序去重與驗證，不做相鄰合併，避免三格語意在往返時被吃掉。
 */
export function segmentsToCanonicalRanges(
  selection: MidaoSegmentSelection | null | undefined,
  customRanges: CanonicalRange[] = [],
): CanonicalRange[] {
  const picked: CanonicalRange[] = [];
  for (const segment of MIDAO_SEGMENTS) {
    if (selection?.[segment] === true) picked.push({ ...MIDAO_SEGMENT_RANGES[segment] });
  }
  for (const custom of Array.isArray(customRanges) ? customRanges : []) {
    picked.push({
      startTimeLocal: custom?.startTimeLocal,
      endTimeLocal: custom?.endTimeLocal,
    } as CanonicalRange);
  }
  return assertNoOverlap(picked);
}

/** canonical 區間 → U-1 段別開關；不吻合固定段別者落入 custom。 */
export function canonicalRangesToSegments(ranges: unknown): MidaoSegmentProjection {
  const normalized = assertNoOverlap(ranges);
  const projection: MidaoSegmentProjection = {
    morning: false,
    afternoon: false,
    evening: false,
    custom: [],
  };
  for (const range of normalized) {
    const segment = MIDAO_SEGMENTS.find(
      (candidate) =>
        MIDAO_SEGMENT_RANGES[candidate].startTimeLocal === range.startTimeLocal &&
        MIDAO_SEGMENT_RANGES[candidate].endTimeLocal === range.endTimeLocal,
    );
    if (segment) projection[segment] = true;
    else projection.custom.push(range);
  }
  return projection;
}

/** U-1 段別開關 → 旅客端 openPeriods（保留既有公開契約字串）。 */
export function canonicalRangesToOpenPeriods(ranges: unknown): MidaoSegment[] {
  const projection = canonicalRangesToSegments(ranges);
  return MIDAO_SEGMENTS.filter((segment) => projection[segment]);
}

export interface CanonicalDayProjection {
  date: string;
  ranges: CanonicalRange[];
  revision: number;
  isClosed: boolean;
  timezone: string;
  availability: MidaoSegmentProjection;
}

/** 單日 canonical 投影：帶出 ranges/segments/revision/isClosed/timezone。
 * fail-closed：`isClosed=true` 一律清空 ranges，避免「已關閉卻仍帶開放區間」的自相矛盾 payload。
 */
export function buildDayAvailabilityProjection(input: {
  date: string;
  ranges?: CanonicalRange[];
  revision?: number;
  isClosed?: boolean;
  timezone?: string;
}): CanonicalDayProjection {
  const isClosed = input?.isClosed === true;
  const ranges = isClosed ? [] : normalizeCanonicalRanges(input?.ranges ?? []);
  return {
    date: input.date,
    ranges,
    revision: Number.isSafeInteger(input?.revision) ? Number(input.revision) : 0,
    isClosed,
    timezone: input?.timezone || MIDAO_DEFAULT_TIMEZONE,
    availability: canonicalRangesToSegments(ranges),
  };
}

/**
 * W-2 批次只能寫未來日期：以指定時區的「今天」為界，當日與過去日皆非未來。
 * @param date 'YYYY-MM-DD'
 */
export function isFutureLocalDate(
  date: string,
  timezone: string = MIDAO_DEFAULT_TIMEZONE,
  now: Date = new Date(),
): boolean {
  const today = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(now);
  return String(date) > today;
}

/** 過濾出未來日期（保持輸入順序）。 */
export function selectFutureDates(
  dates: string[],
  timezone: string = MIDAO_DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string[] {
  return (Array.isArray(dates) ? dates : []).filter((date) =>
    isFutureLocalDate(date, timezone, now),
  );
}

/** 'YYYY-MM' → 該月天數。 */
export function daysInMonth(month: string): number {
  const [y, m] = String(month).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM' → ['YYYY-MM-01', …]。 */
export function listMonthDates(month: string): string[] {
  const total = daysInMonth(month);
  return Array.from(
    { length: total },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
  );
}

/** 'YYYY-MM-DD' → JS getUTCDay()（0=Sun…6=Sat），與 slot-generator 慣例一致。 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export interface CanonicalRuleRow {
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active?: boolean;
  activity_plan_id?: string | null;
}

/** 'HH:MM:SS' / 'HH:MM' → 'HH:MM'。 */
export function toHhmm(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}

/**
 * canonical selector 交回的全域規則 → 當日 canonical 區間。
 * 只保留「weekday 命中且生效區間涵蓋該日」的規則；單日覆寫規則本身即 from=to=date。
 */
export function rulesToDayRanges(rules: CanonicalRuleRow[], date: string): CanonicalRange[] {
  const weekday = weekdayOf(date);
  const picked = (Array.isArray(rules) ? rules : [])
    .filter((rule) => rule.weekday === weekday)
    .filter((rule) => !rule.effective_from || rule.effective_from <= date)
    .filter((rule) => !rule.effective_to || rule.effective_to >= date)
    .map((rule) => ({
      startTimeLocal: toHhmm(rule.start_time_local),
      endTimeLocal: toHhmm(rule.end_time_local),
    }));
  // 週期規則與單日覆寫可能重覆同一區間；先去重再驗證，避免誤判重疊。
  const seen = new Set<string>();
  const deduped = picked.filter((range) => {
    const key = `${range.startTimeLocal}-${range.endTimeLocal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return assertNoOverlap(deduped);
}
