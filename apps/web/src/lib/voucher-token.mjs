/**
 * Issue #1565 — 電子憑證 QR token（HMAC 簽章，純函式）。
 *
 * token 由 server 簽發（旅客訂單頁把它渲染成 QR），由導遊核銷 API 驗證後
 * 把訂單 confirmed → completed。secret 複用 GUIDE_SESSION_SECRET（production 已
 * 強制強值，免新增 env）。純函式收 secret 為參數，方便單測。
 *
 * 格式：`v1.<orderId>.<hmacHex>`，hmac = HMAC-SHA256(`v1:<orderId>`, secret)。
 * 短碼（人類可讀 fallback）：MID-XXXX，來自 orderId 的非機密雜湊，去除易混字元。
 */
import { createHmac, createHash, timingSafeEqual } from 'crypto';

const VERSION = 'v1';

export function signVoucherToken(orderId, secret) {
  const id = String(orderId || '');
  const sig = createHmac('sha256', String(secret || '')).update(`${VERSION}:${id}`).digest('hex');
  return `${VERSION}.${id}.${sig}`;
}

/** 驗證 token；成功回 orderId，失敗回 null（不丟錯）。簽章比對為常數時間。 */
export function verifyVoucherToken(token, secret) {
  const raw = typeof token === 'string' ? token : '';
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [ver, orderId, sig] = parts;
  if (ver !== VERSION || !orderId || !sig) return null;
  const expected = createHmac('sha256', String(secret || '')).update(`${VERSION}:${orderId}`).digest('hex');
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch {
    return null;
  }
  return orderId;
}

// 去除易混字元（0/O/1/I）的 base32-ish 字母表
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 人類可讀短碼（非機密，供無法掃碼時對名冊核對）。對同 orderId 穩定。 */
export function shortCodeForOrder(orderId) {
  const hash = createHash('sha256').update(String(orderId || '')).digest();
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[hash[i] % ALPHABET.length];
  }
  return `MID-${out}`;
}

/** 路由端解析 voucher 簽章 secret（複用 guide session secret；非 production 允許 fallback）。 */
export function resolveVoucherSecret() {
  const s = String(process.env.VOUCHER_SIGNING_SECRET || process.env.GUIDE_SESSION_SECRET || '').trim();
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[SECURITY_ENV] voucher secret missing in production (set GUIDE_SESSION_SECRET)');
  }
  return 'dev-voucher-secret-fallback-not-for-production';
}
