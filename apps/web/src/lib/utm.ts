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

/** 從 URL 搜尋參數讀取 UTM，若有則存入 sessionStorage（首次優先原則） */
export function captureUtm(search?: string): UtmParams | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(search ?? window.location.search);
  const utm: UtmParams = {};

  const keys: (keyof UtmParams)[] = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  ];

  let hasUtm = false;
  for (const key of keys) {
    const val = params.get(key);
    if (val) { utm[key] = val; hasUtm = true; }
  }

  if (!hasUtm) return null;

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
    return raw ? (JSON.parse(raw) as UtmParams) : null;
  } catch {
    return null;
  }
}

/** 清除 UTM（付款完成後呼叫，避免重複歸因） */
export function clearUtm(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(UTM_SESSION_KEY); } catch { /* ignore */ }
}
