// @ts-check
/**
 * midao2 可用時間（週預設＋單日覆寫；spec §4.4）。獨立輕量，不碰 availability-v2。
 * 生效邏輯：單日覆寫 > 週預設 > 預設關閉。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_PERIODS = ['morning', 'afternoon', 'evening'];

const _memDefaults = [];  // {guide_id, weekday, period, is_open}
const _memOverrides = []; // {guide_id, date, period, is_open, custom_start, custom_end}
export function __resetMemMidaoAvailability() { _memDefaults.length = 0; _memOverrides.length = 0; }

/**
 * 純函式：套用覆寫到預設。
 * @param {{morning:boolean,afternoon:boolean,evening:boolean}|null} defaults
 * @param {Array<{period:string,is_open:boolean,custom_start?:string|null,custom_end?:string|null}>} overrides
 */
export function resolveEffectiveDay(defaults, overrides) {
  const eff = {
    morning: defaults?.morning ?? false,
    afternoon: defaults?.afternoon ?? false,
    evening: defaults?.evening ?? false,
    custom: /** @type {Array<{start:string,end:string,isOpen:boolean}>} */ ([]),
  };
  for (const o of overrides ?? []) {
    if (o.period === 'custom') {
      if (o.custom_start && o.custom_end) {
        eff.custom.push({ start: o.custom_start, end: o.custom_end, isOpen: !!o.is_open });
      }
    } else if (MIDAO_PERIODS.includes(o.period)) {
      eff[o.period] = !!o.is_open;
    }
  }
  return eff;
}

/**
 * @param {string} guideId
 * weekday 慣例：JS getUTCDay()（0=Sun…6=Sat），與 slot-generator.ts 一致。
 */
export async function getWeeklyDefaultsDb(guideId) {
  let rows;
  if (!hasSupabaseEnv()) {
    rows = _memDefaults.filter((r) => r.guide_id === guideId);
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('midao_availability_defaults')
      .select('weekday, period, is_open').eq('guide_id', guideId);
    rows = Array.isArray(data) ? data : [];
  }
  return Array.from({ length: 7 }, (_, weekday) => {
    const day = { weekday, morning: false, afternoon: false, evening: false };
    for (const r of rows.filter((x) => x.weekday === weekday)) {
      if (MIDAO_PERIODS.includes(r.period)) day[r.period] = !!r.is_open;
    }
    return day;
  });
}

/**
 * 整組 upsert 週預設（只寫有給的 weekday）。
 * @param {string} guideId
 * @param {Array<{weekday:number, morning?:boolean, afternoon?:boolean, evening?:boolean}>} weekdays
 * weekday 慣例：JS getUTCDay()（0=Sun…6=Sat），與 slot-generator.ts 一致。
 */
export async function setWeeklyDefaultsDb(guideId, weekdays) {
  const rows = [];
  for (const w of weekdays ?? []) {
    const weekday = Math.trunc(Number(w?.weekday));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    for (const period of MIDAO_PERIODS) {
      rows.push({ guide_id: guideId, weekday, period, is_open: w?.[period] === true });
    }
  }
  if (!rows.length) return;
  // 同 (weekday, period) 重複給值時後者為準（Postgres 同批 upsert 撞同鍵會 21000）
  const byKey = new Map();
  for (const row of rows) byKey.set(`${row.weekday}:${row.period}`, row);
  const deduped = [...byKey.values()];
  if (!hasSupabaseEnv()) {
    for (const row of deduped) {
      const i = _memDefaults.findIndex((r) =>
        r.guide_id === guideId && r.weekday === row.weekday && r.period === row.period);
      if (i >= 0) _memDefaults[i] = row; else _memDefaults.push(row);
    }
    return;
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('midao_availability_defaults')
    .upsert(deduped, { onConflict: 'guide_id,weekday,period' });
  if (error) throw new Error(error.message);
}

/**
 * 單日覆寫 upsert。custom 給整組（先清後寫）。
 * @param {string} guideId @param {string} date
 * @param {{morning?:boolean, afternoon?:boolean, evening?:boolean, custom?:Array<{start:string,end:string,isOpen?:boolean}>}} patch
 */
export async function setDayOverrideDb(guideId, date, patch) {
  const upserts = [];
  for (const period of MIDAO_PERIODS) {
    if (typeof patch?.[period] === 'boolean') {
      upserts.push({ guide_id: guideId, date, period, is_open: patch[period], custom_start: null, custom_end: null });
    }
  }
  const customRows = Array.isArray(patch?.custom)
    ? patch.custom.filter((c) => c?.start && c?.end).map((c) => ({
        guide_id: guideId, date, period: 'custom',
        is_open: c.isOpen !== false, custom_start: c.start, custom_end: c.end,
      }))
    : null;
  if (!hasSupabaseEnv()) {
    for (const row of upserts) {
      const i = _memOverrides.findIndex((r) =>
        r.guide_id === guideId && r.date === date && r.period === row.period);
      if (i >= 0) _memOverrides[i] = row; else _memOverrides.push(row);
    }
    if (customRows) {
      for (let i = _memOverrides.length - 1; i >= 0; i--) {
        const r = _memOverrides[i];
        if (r.guide_id === guideId && r.date === date && r.period === 'custom') _memOverrides.splice(i, 1);
      }
      _memOverrides.push(...customRows);
    }
    return;
  }
  const supabase = await getSupabase();
  if (upserts.length) {
    // 表上是 partial unique index（WHERE period <> 'custom'），onConflict 推導不到 → 改先刪後插
    const periods = upserts.map((r) => r.period);
    const { error: delErr } = await supabase.from('midao_day_overrides').delete()
      .eq('guide_id', guideId).eq('date', date).in('period', periods);
    if (delErr) throw new Error(delErr.message);
    const { error } = await supabase.from('midao_day_overrides').insert(upserts);
    if (error) throw new Error(error.message);
  }
  if (customRows) {
    await supabase.from('midao_day_overrides').delete()
      .eq('guide_id', guideId).eq('date', date).eq('period', 'custom');
    if (customRows.length) {
      const { error } = await supabase.from('midao_day_overrides').insert(customRows);
      if (error) throw new Error(error.message);
    }
  }
}

/**
 * 該月每天的生效可用時段。
 * @param {string} guideId @param {string} month 'YYYY-MM'
 * weekday 慣例：JS getUTCDay()（0=Sun…6=Sat），與 slot-generator.ts 一致。
 */
export async function getMonthEffectiveDb(guideId, month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const defaults = await getWeeklyDefaultsDb(guideId);
  let overrides;
  if (!hasSupabaseEnv()) {
    overrides = _memOverrides.filter((r) => r.guide_id === guideId && String(r.date).startsWith(month));
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('midao_day_overrides')
      .select('date, period, is_open, custom_start, custom_end')
      .eq('guide_id', guideId)
      .gte('date', `${month}-01`).lte('date', `${month}-${String(daysInMonth).padStart(2, '0')}`);
    overrides = Array.isArray(data) ? data : [];
  }
  const out = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    // getUTCDay(): 0=Sun…6=Sat，直接對映我們的 weekday（0=Sun…6=Sat）
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const dayOverrides = overrides.filter((o) => String(o.date) === date);
    out.push({ date, ...resolveEffectiveDay(defaults[weekday], dayOverrides) });
  }
  return out;
}
