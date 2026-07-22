// @ts-check
/**
 * midao2 旅客需求單資料存取（strangler 領域檔，不進 db.mjs）。
 * spec: docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md §4.2/§4.3
 * 狀態機：new → pending_reply → replied → closed_won → closed_done；允許回退、不可回到 new。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_REQUEST_STATUSES = ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done'];
const PERIODS = ['morning', 'afternoon', 'evening'];
const SELECT_COLS = 'id, request_no, guide_id, activity_id, activity_title_snapshot, traveler_name, traveler_line_id, traveler_email, preferred_date, backup_date, preferred_period, start_time, end_time, participants_count, participants_note, language, need_pickup, special_note, answers, status, source, created_at, status_changed_at';

/** in-memory fallback（測試 seam） */
/** @type {any[]} */
const _mem = [];
let _memSeq = 0;
export function __resetMemMidaoRequests() { _mem.length = 0; _memSeq = 0; }
/** @param {any[]} rows */
export function __seedMemMidaoRequests(rows) { _mem.push(...rows); }

/** @param {string} from @param {string} to */
export function isValidRequestTransition(from, to) {
  if (!MIDAO_REQUEST_STATUSES.includes(from) || !MIDAO_REQUEST_STATUSES.includes(to)) return false;
  if (to === 'new') return false; // new 只在建立時出現
  return from !== to;
}

/** row(snake) → API 形（camel） @param {any} r */
function shape(r) {
  return {
    id: r.id, requestNo: r.request_no,
    travelerName: r.traveler_name, travelerLineId: r.traveler_line_id ?? null, travelerEmail: r.traveler_email ?? null,
    activityId: r.activity_id ?? null, activityTitle: r.activity_title_snapshot ?? null,
    preferredDate: r.preferred_date, backupDate: r.backup_date ?? null,
    preferredPeriod: r.preferred_period ?? null, startTime: r.start_time ?? null, endTime: r.end_time ?? null,
    participantsCount: r.participants_count, participantsNote: r.participants_note ?? null,
    language: r.language ?? null, needPickup: !!r.need_pickup, specialNote: r.special_note ?? null,
    answers: Array.isArray(r.answers) ? r.answers : [],
    status: r.status, source: r.source, createdAt: r.created_at, statusChangedAt: r.status_changed_at,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 正規化並驗證需求單輸入（公開送單/手動建單共用）。
 * @param {any} input
 * @returns {{ok:true, value:any}|{ok:false, code:string, message:string}}
 */
export function normalizeRequestInput(input) {
  const name = String(input?.travelerName ?? '').trim();
  if (!name || name.length > 60) return { ok: false, code: 'INVALID_NAME', message: '請填寫稱呼（60 字內）' };
  const lineId = String(input?.travelerLineId ?? '').trim();
  const email = String(input?.travelerEmail ?? '').trim();
  if (!lineId && !email) return { ok: false, code: 'CONTACT_REQUIRED', message: '請至少留下 LINE ID 或 Email 其中一種聯絡方式' };
  if (lineId.length > 120) return { ok: false, code: 'INVALID_CONTACT', message: 'LINE ID 過長' };
  if (email && (email.length > 254 || !email.includes('@'))) return { ok: false, code: 'INVALID_CONTACT', message: 'Email 格式不正確' };
  const preferredDate = String(input?.preferredDate ?? '').trim();
  if (!DATE_RE.test(preferredDate)) return { ok: false, code: 'INVALID_DATE', message: '請選擇希望日期' };
  const backupDate = String(input?.backupDate ?? '').trim();
  if (backupDate && !DATE_RE.test(backupDate)) return { ok: false, code: 'INVALID_DATE', message: '備用日期格式不正確' };
  const period = String(input?.preferredPeriod ?? '').trim();
  if (period && !PERIODS.includes(period)) return { ok: false, code: 'INVALID_PERIOD', message: '時段不正確' };
  const participants = Math.trunc(Number(input?.participantsCount));
  if (!Number.isFinite(participants) || participants < 1 || participants > 99) {
    return { ok: false, code: 'INVALID_PARTICIPANTS', message: '人數需為 1–99' };
  }
  const specialNote = String(input?.specialNote ?? '').trim();
  if (specialNote.length > 500) return { ok: false, code: 'NOTE_TOO_LONG', message: '特殊需求最多 500 字' };
  const participantsNote = String(input?.participantsNote ?? '').trim().slice(0, 200);
  const answers = Array.isArray(input?.answers) ? input.answers.slice(0, 20).map((/** @type {any} */ a) => ({
    questionId: String(a?.questionId ?? ''), label: String(a?.label ?? '').slice(0, 120),
    answer: String(a?.answer ?? '').slice(0, 300),
  })) : [];
  if (JSON.stringify(answers).length > 10240) return { ok: false, code: 'ANSWERS_TOO_LONG', message: '回答內容過長' };
  return {
    ok: true,
    value: {
      traveler_name: name, traveler_line_id: lineId || null, traveler_email: email || null,
      preferred_date: preferredDate, backup_date: backupDate || null,
      preferred_period: period || null,
      start_time: input?.startTime || null, end_time: input?.endTime || null,
      participants_count: participants, participants_note: participantsNote || null,
      language: String(input?.language ?? '').trim().slice(0, 40) || null,
      need_pickup: input?.needPickup === true, special_note: specialNote || null,
      answers,
    },
  };
}

/** 產當日流水 request_no（衝突重試 3 次後改隨機尾碼） @param {string} preferredDate */
async function nextRequestNo(preferredDate, attempt = 0) {
  const ymd = preferredDate.replaceAll('-', '');
  if (!hasSupabaseEnv()) {
    const prefix = `R${ymd}`;
    const seq = _mem.filter((r) => String(r.request_no).startsWith(prefix)).length + 1 + attempt;
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }
  const supabase = await getSupabase();
  const { count } = await supabase.from('midao_requests')
    .select('id', { count: 'exact', head: true }).like('request_no', `R${ymd}%`);
  if (attempt >= 3) return `R${ymd}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  return `R${ymd}${String((count ?? 0) + 1 + attempt).padStart(3, '0')}`;
}

/**
 * 建立需求單。value 需先過 normalizeRequestInput。
 * @param {{guideId:string, activityId?:string|null, activityTitle?:string|null, value:any, source?:'public_page'|'manual'}} input
 */
export async function createMidaoRequestDb({ guideId, activityId = null, activityTitle = null, value, source = 'public_page' }) {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt <= 3; attempt++) {
    const requestNo = await nextRequestNo(value.preferred_date, attempt);
    const row = {
      request_no: requestNo, guide_id: guideId, activity_id: activityId,
      activity_title_snapshot: activityTitle, ...value,
      status: 'new', source, created_at: now, updated_at: now, status_changed_at: now,
    };
    if (!hasSupabaseEnv()) {
      if (_mem.some((r) => r.request_no === requestNo)) continue;
      const created = { id: `mreq_${String(++_memSeq).padStart(6, '0')}`, ...row };
      _mem.push(created);
      return shape(created);
    }
    const supabase = await getSupabase();
    const { data, error } = await supabase.from('midao_requests').insert(row).select(SELECT_COLS).single();
    if (!error) return shape(data);
    if (error.code === '23505') continue; // request_no 撞號 → 重試
    throw new Error(error.message);
  }
  throw new Error('REQUEST_NO_EXHAUSTED');
}

/** @param {string} guideId */
async function fetchGuideRows(guideId) {
  if (!hasSupabaseEnv()) return _mem.filter((r) => r.guide_id === guideId);
  const supabase = await getSupabase();
  const { data } = await supabase.from('midao_requests').select(SELECT_COLS)
    .eq('guide_id', guideId).order('created_at', { ascending: false }).limit(200);
  return Array.isArray(data) ? data : [];
}

const UNREPLIED = ['new', 'pending_reply'];
/** @type {Record<string, (r: any) => boolean>} */
const TAB_FILTERS = {
  all: () => true,
  new: (r) => r.status === 'new',
  pending_reply: (r) => r.status === 'pending_reply',
  replied: (r) => r.status === 'replied',
  closed: (r) => r.status === 'closed_won' || r.status === 'closed_done',
};

/**
 * 需求列表＋分頁計數。冷啟動量級（≤200 筆/導遊）在 JS 端排序。
 * @param {string} guideId
 * @param {{status?:string, sort?:'unreplied_first'|'newest'}} [opts]
 */
export async function listMidaoRequestsDb(guideId, opts = {}) {
  const rows = await fetchGuideRows(guideId);
  const tabCounts = {
    new: rows.filter(TAB_FILTERS.new).length,
    pendingReply: rows.filter(TAB_FILTERS.pending_reply).length,
    replied: rows.filter(TAB_FILTERS.replied).length,
    closed: rows.filter(TAB_FILTERS.closed).length,
  };
  const filter = TAB_FILTERS[opts.status ?? 'all'] ?? TAB_FILTERS.all;
  let items = rows.filter(filter);
  items = items.sort((a, b) => {
    if ((opts.sort ?? 'unreplied_first') === 'unreplied_first') {
      const ua = UNREPLIED.includes(a.status) ? 0 : 1;
      const ub = UNREPLIED.includes(b.status) ? 0 : 1;
      if (ua !== ub) return ua - ub;
    }
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return { items: items.map(shape), tabCounts };
}

/** @param {string} guideId @param {string} id */
export async function getMidaoRequestDb(guideId, id) {
  if (!hasSupabaseEnv()) {
    const row = _mem.find((r) => r.id === id && r.guide_id === guideId);
    return row ? shape(row) : null;
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('midao_requests').select(SELECT_COLS)
    .eq('id', id).eq('guide_id', guideId).maybeSingle();
  return data ? shape(data) : null;
}

/**
 * 狀態更新（含合法轉換驗證與 ownership）。
 * @param {string} guideId @param {string} id @param {string} status
 * @returns {Promise<{ok:true, request:any}|{ok:false, code:string, message:string}>}
 */
export async function updateMidaoRequestStatusDb(guideId, id, status) {
  const current = await getMidaoRequestDb(guideId, id);
  if (!current) return { ok: false, code: 'NOT_FOUND', message: '需求單不存在' };
  if (!isValidRequestTransition(current.status, status)) {
    return { ok: false, code: 'INVALID_TRANSITION', message: `無法從 ${current.status} 轉為 ${status}` };
  }
  const now = new Date().toISOString();
  if (!hasSupabaseEnv()) {
    const row = _mem.find((r) => r.id === id && r.guide_id === guideId);
    Object.assign(row, { status, updated_at: now, status_changed_at: now });
    return { ok: true, request: shape(row) };
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('midao_requests')
    .update({ status, updated_at: now, status_changed_at: now })
    .eq('id', id).eq('guide_id', guideId).select(SELECT_COLS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ok: true, request: shape(data) } : { ok: false, code: 'NOT_FOUND', message: '需求單不存在' };
}

/** 首頁摘要。 @param {string} guideId */
export async function getMidaoSummaryDb(guideId) {
  const rows = await fetchGuideRows(guideId);
  const news = rows.filter((r) => r.status === 'new')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const pendings = rows.filter((r) => r.status === 'pending_reply')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const top = news[0] ?? pendings[0] ?? null;
  const recent = rows.filter((r) => !top || r.id !== top.id)
    .sort((a, b) => String(b.status_changed_at).localeCompare(String(a.status_changed_at)))
    .slice(0, 3);
  return {
    counts: { newRequests: news.length, pendingReply: pendings.length },
    topRequest: top ? shape(top) : null,
    recentRequests: recent.map(shape),
  };
}
