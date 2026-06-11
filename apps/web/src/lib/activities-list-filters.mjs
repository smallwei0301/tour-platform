/**
 * Issue #1380 — 活動列表「日期可訂」與「價格區間」篩選的純 helpers。
 *
 * 過濾一律在 route 層套用於統一回傳 shape，Supabase 與 in-memory fallback
 * 走同一條 code path（行為一致）。日期可訂的最終真相仍在詳情頁／訂位引擎，
 * 列表層為發現用途的近似（Supabase 模式以 v2 引擎逐日判定、fallback 用
 * legacy schedules）。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * @param {URLSearchParams} searchParams
 * @returns {{ date: string|null, priceMin: number|null, priceMax: number|null, error?: { code: string, message: string } }}
 */
export function parseActivitiesFilterParams(searchParams) {
  const rawDate = searchParams.get('date') || '';
  const rawMin = searchParams.get('priceMin') || '';
  const rawMax = searchParams.get('priceMax') || '';

  let date = null;
  if (rawDate) {
    if (!isValidCalendarDate(rawDate)) {
      return {
        date: null, priceMin: null, priceMax: null,
        error: { code: 'INVALID_DATE', message: 'date must be a valid YYYY-MM-DD' },
      };
    }
    date = rawDate;
  }

  let priceMin = null;
  let priceMax = null;
  for (const [raw, key] of [[rawMin, 'priceMin'], [rawMax, 'priceMax']]) {
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return {
        date: null, priceMin: null, priceMax: null,
        error: { code: 'INVALID_PRICE_RANGE', message: `${key} must be a non-negative number` },
      };
    }
    if (key === 'priceMin') priceMin = n;
    else priceMax = n;
  }

  if (priceMin != null && priceMax != null && priceMin > priceMax) {
    return {
      date: null, priceMin: null, priceMax: null,
      error: { code: 'INVALID_PRICE_RANGE', message: 'priceMin must not exceed priceMax' },
    };
  }

  return { date, priceMin, priceMax };
}

/**
 * 價格區間過濾（邊界含等於）。null 視為無界。
 * @param {Array<{ priceTwd: number }>} activities
 */
export function applyPriceRange(activities, priceMin, priceMax) {
  return (activities || []).filter((a) => {
    const price = Number(a?.priceTwd);
    if (!Number.isFinite(price)) return false;
    if (priceMin != null && price < priceMin) return false;
    if (priceMax != null && price > priceMax) return false;
    return true;
  });
}

/**
 * legacy/in-memory schedules 的「該日可訂」判定：
 * 同日（schedules.startAt 為 +08:00 ISO，日期部分即 Asia/Taipei 當地日）、
 * status === 'open' 且仍有餘額（capacity 0 視為不限量）。
 * @param {Array<{ startAt: string, capacity?: number, bookedCount?: number, status?: string }>|undefined} schedules
 * @param {string} date YYYY-MM-DD
 */
export function hasOpenScheduleOn(schedules, date) {
  if (!Array.isArray(schedules) || !date) return false;
  return schedules.some((s) => {
    if (String(s?.startAt || '').slice(0, 10) !== date) return false;
    if (String(s?.status || '').toLowerCase() !== 'open') return false;
    const capacity = Number(s?.capacity ?? 0);
    const booked = Number(s?.bookedCount ?? 0);
    return capacity <= 0 || booked < capacity;
  });
}
