/**
 * #1761 slice 1：舊後台封鎖日（guide_blackout_dates，timestamptz 時段）→ 月曆逐日投影（純函式，無 I/O）。
 * 旅客端 available-slots 會讀這張表；Midao2 月曆若不顯示，導遊會看到「可用」但旅客訂不到。
 * 只輸出 Asia/Taipei 的 HH:MM，不帶 reason／備註（資料最小化）。
 */

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {string} date YYYY-MM-DD（Asia/Taipei 在地日期）→ 該日 00:00 的 epoch ms */
function taipeiDayStartMs(date) {
  return Date.parse(`${date}T00:00:00+08:00`);
}

/** @param {number} ms epoch ms → Asia/Taipei HH:MM（跨到次日 00:00 者以 24:00 表示日終） */
function taipeiHm(ms, dayStartMs) {
  if (ms - dayStartMs >= DAY_MS) return '24:00';
  return new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(11, 16);
}

/** 當月範圍（ISO，供查詢條件）：starts_at < nextMonthStart 且 ends_at > monthStart。
 * @param {string} month YYYY-MM
 */
export function blackoutMonthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    monthStartIso: new Date(`${month}-01T00:00:00+08:00`).toISOString(),
    nextMonthStartIso: new Date(`${ny}-${String(nm).padStart(2, '0')}-01T00:00:00+08:00`).toISOString(),
  };
}

/**
 * 依日期分配 blackout：回傳 Map<date, Array<{startTime,endTime,allDay?}>>，只含有被涵蓋的日期。
 * @param {Array<{starts_at:string, ends_at:string}>} rows
 * @param {string[]} dates 該月所有 YYYY-MM-DD
 */
export function projectBlackoutsByDate(rows, dates) {
  /** @type {Map<string, Array<{startTime:string,endTime:string,allDay?:true}>>} */
  const byDate = new Map();
  const windows = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ s: Date.parse(String(r?.starts_at)), e: Date.parse(String(r?.ends_at)) }))
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e > w.s)
    .sort((a, b) => a.s - b.s);
  for (const date of dates) {
    const dayStart = taipeiDayStartMs(date);
    const dayEnd = dayStart + DAY_MS;
    const list = [];
    for (const w of windows) {
      if (!(w.s < dayEnd && w.e > dayStart)) continue;
      const s = Math.max(w.s, dayStart);
      const e = Math.min(w.e, dayEnd);
      const entry = { startTime: taipeiHm(s, dayStart), endTime: taipeiHm(e, dayStart) };
      if (s <= dayStart && e >= dayEnd) entry.allDay = true;
      list.push(entry);
    }
    if (list.length > 0) byDate.set(date, list);
  }
  return byDate;
}
