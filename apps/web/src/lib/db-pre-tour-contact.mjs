// @ts-check
/**
 * Issue #1596 — 行前導遊聯絡的資料存取（strangler：獨立領域檔，不進 db.mjs）。
 *
 * getEligibleGuideContactDb：解析 order → bookings(start_at/end_at/guide_id) → guides
 * (display_name/contact_phone/contact_phone_visible)，套 canShowGuideContact 資格＋導遊同意
 * (contact_phone_visible) 雙閘，僅在皆通過時回 { name, phone }，否則回 null。
 *
 * PII 原則：資格外一律回 null——route 據此**不把 guideContact 欄位帶入回應的敏感值**。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';
import { canShowGuideContact } from './pre-tour-contact-eligibility.mjs';

/**
 * @param {{ orderId?: string, contactEmail?: string, now?: string }} input
 * @returns {Promise<{ name: string, phone: string } | null>}
 */
export async function getEligibleGuideContactDb({ orderId, contactEmail, now } = {}) {
  const id = String(orderId || '').trim();
  const email = String(contactEmail || '').trim().toLowerCase();
  const nowIso = now || new Date().toISOString();
  if (!id || !email) return null;

  if (!hasSupabaseEnv()) {
    return getEligibleGuideContactInMemory({ orderId: id, contactEmail: email, now: nowIso });
  }

  const supabase = await getSupabase();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, contact_email, bookings!fk_bookings_order_id(start_at, end_at, guide_id, guide_profiles(display_name, contact_phone, contact_phone_visible))')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return null;

  // ownership：只有訂單聯絡信箱本人可取（route 已驗登入/guest email，這裡再防跨單）
  if (String(order.contact_email || '').trim().toLowerCase() !== email) return null;

  const booking = Array.isArray(order.bookings) ? order.bookings[0] : order.bookings;
  if (!booking) return null;
  const guide = Array.isArray(booking.guide_profiles) ? booking.guide_profiles[0] : booking.guide_profiles;
  if (!guide) return null;

  return composeDisclosure({
    status: order.status,
    scheduleStartAt: booking.start_at,
    scheduleEndAt: booking.end_at,
    now: nowIso,
    guideName: guide.display_name,
    contactPhone: guide.contact_phone,
    contactPhoneVisible: guide.contact_phone_visible,
  });
}

/**
 * 純組裝：資格＋同意雙閘後回聯絡資訊或 null。抽出以便單測（不碰 DB/時鐘）。
 * @param {{ status?: string, scheduleStartAt?: string|null, scheduleEndAt?: string|null, now?: string, guideName?: string|null, contactPhone?: string|null, contactPhoneVisible?: boolean|null }} input
 * @returns {{ name: string, phone: string } | null}
 */
export function composeDisclosure({ status, scheduleStartAt, scheduleEndAt, now, guideName, contactPhone, contactPhoneVisible }) {
  if (!contactPhoneVisible) return null; // 導遊未同意揭露
  const phone = String(contactPhone || '').trim();
  if (!phone) return null;
  if (!canShowGuideContact({ status, scheduleStartAt, scheduleEndAt, now })) return null;
  return { name: String(guideName || '').trim() || '導遊', phone };
}

/**
 * in-memory fallback：store 的 order 目前不建模導遊聯絡；測試可於 store order 上掛
 * guide* 欄位驗正向路徑，否則回 null（安全，不外洩）。
 * @param {{ orderId: string, contactEmail: string, now: string }} input
 * @returns {Promise<{ name: string, phone: string } | null>}
 */
async function getEligibleGuideContactInMemory({ orderId, contactEmail, now }) {
  const { orders } = await import('./store.mjs');
  const found = orders.find((/** @type {any} */ o) => o.id === orderId);
  if (!found) return null;
  // store 的 order 型別由 seed 推得較窄；#1596 導遊聯絡欄位為選填（測試可注入），寬鬆讀取。
  const order = /** @type {any} */ (found);
  if (String(order.contactEmail || '').trim().toLowerCase() !== contactEmail) return null;
  return composeDisclosure({
    status: order.status,
    scheduleStartAt: order.scheduleStartAt,
    scheduleEndAt: order.scheduleEndAt,
    now,
    guideName: order.guideDisplayName,
    contactPhone: order.guideContactPhone,
    contactPhoneVisible: order.guideContactPhoneVisible,
  });
}
