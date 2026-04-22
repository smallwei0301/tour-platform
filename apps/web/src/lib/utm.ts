/**
 * utm.ts — UTM 參數擷取與持久化
 * 策略：首次帶 UTM 的 landing → 存到 sessionStorage → checkout 帶入訂單
 *
 * 使用方式：
 *   // 在任何 client page 的 useEffect 呼叫：
 *   import { captureUtm, getStoredUtm } from '@/lib/utm';
 *   captureUtm(); // 擷取並快取當前 URL 的 UTM
 *
 *   // checkout submit 時取出：
 *   const utm = getStoredUtm();
 */

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

const UTM_SESSION_KEY = 'tp_utm';
const UTM_MAX_LENGTH = 80;
const UTM_KEYS: (keyof UtmParams)[] = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
];

function sanitizeUtmValue(input: string): string | null {
  if (!input) return null;

  const normalized = input.normalize('NFKC').trim();
  if (!normalized) return null;

  // Reject protocol-like attack payloads.
  if (/^(javascript|vbscript|data):/i.test(normalized)) return null;
  // Reject obvious HTML/script payload patterns.
  if (/[<>]/.test(normalized)) return null;

  const cleaned = normalized
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}._\-:/@+\s]/gu, '')
    .replace(/\s+/g, '_')
    .toLowerCase();

  if (!cleaned) return null;
  if (cleaned.length > UTM_MAX_LENGTH) return cleaned.slice(0, UTM_MAX_LENGTH);
  return cleaned;
}

function sanitizeUtmObject(raw: unknown): UtmParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const out: UtmParams = {};

  for (const key of UTM_KEYS) {
    const value = source[key];
    if (typeof value !== 'string') continue;
    const sanitized = sanitizeUtmValue(value);
    if (sanitized) out[key] = sanitized;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** 從 URL 搜尋參數讀取 UTM，若有則存入 sessionStorage（首次優先原則） */
export function captureUtm(search?: string): UtmParams | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(search ?? window.location.search);
  const utm: UtmParams = {};

  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (!val) continue;
    const sanitized = sanitizeUtmValue(val);
    if (sanitized) utm[key] = sanitized;
  }

  if (Object.keys(utm).length === 0) return null;

  // 首次優先：若已有快取，不覆蓋（保留歸因來源）
  try {
    const existing = sessionStorage.getItem(UTM_SESSION_KEY);
    if (!existing) {
      sessionStorage.setItem(UTM_SESSION_KEY, JSON.stringify(utm));
    }
  } catch {
    // sessionStorage unavailable (SSR / private mode) — ignore
  }

  return utm;
}

/** 取出已快取的 UTM 參數（供 checkout / event tracking 使用） */
export function getStoredUtm(): UtmParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(UTM_SESSION_KEY);
    if (!raw) return null;
    const sanitized = sanitizeUtmObject(JSON.parse(raw));
    if (!sanitized) {
      sessionStorage.removeItem(UTM_SESSION_KEY);
      return null;
    }
    return sanitized;
  } catch {
    return null;
  }
}

/** 清除 UTM（付款完成後呼叫，避免重複歸因） */
export function clearUtm(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(UTM_SESSION_KEY); } catch { /* ignore */ }
}
