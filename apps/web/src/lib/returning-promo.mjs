/**
 * Issue #1408 — 會員回購起步版：review invitation 信的老客專屬碼區塊。
 *
 * 啟用方式：env `RETURNING_CUSTOMER_PROMO_CODE` 指定當期生效碼（admin 先在
 * promo-codes 建立，is_public=false）。空值＝功能關閉（fail-safe）。
 * 回購碼區塊屬行銷性質 — 尊重 traveler_profiles.marketing_email_opt_in；
 * 關閉者信照寄、不含本區塊（交易內容不受影響）。
 */

function isRowAvailable(row, nowMs) {
  if (!row || !row.active) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return false;
  const maxUses = Number(row.max_uses ?? 0);
  if (maxUses > 0 && Number(row.used_count ?? 0) >= maxUses) return false;
  return true;
}

function defaultLabel(row) {
  if (row.discount_type === 'percentage') {
    const value = Number(row.discount_value);
    const zhe = value % 10 === 0 ? String((100 - value) / 10) : String(100 - value);
    return `老客限定 ${zhe} 折`;
  }
  return `老客限定折抵 NT$${Number(row.discount_value).toLocaleString()}`;
}

/**
 * 純函式：組信件區塊。無效碼 / opt-out → null。
 * @param {{ promoRow: object|null, marketingEmailOptIn: boolean|null|undefined, now: string|Date }} input
 * @returns {{ code: string, label: string, html: string } | null}
 */
export function buildReturningPromoEmailBlock({ promoRow, marketingEmailOptIn, now = new Date() }) {
  if (marketingEmailOptIn === false) return null;
  if (!isRowAvailable(promoRow, new Date(now).getTime())) return null;

  const label = promoRow.public_label || defaultLabel(promoRow);
  const expiry = promoRow.expires_at
    ? `，${String(promoRow.expires_at).slice(0, 10)} 前有效`
    : '';
  const html = `
    <div style="background:#fdf2f8;border:1px dashed #f9a8d4;border-radius:10px;padding:14px 16px;margin:0 0 20px;">
      <p style="font-size:13px;font-weight:700;color:#be185d;margin:0 0 4px;">🎁 ${label}</p>
      <p style="font-size:13px;color:#9d174d;margin:0;">
        下次預訂結帳時輸入 <strong>${promoRow.code}</strong> 即可折抵${expiry}。
      </p>
    </div>`;

  return { code: promoRow.code, label, html };
}

/**
 * 注入 supabase client 的 resolver（兩個寄送點共用）。
 * 任一步失敗回 null — 回購碼是加分項，絕不阻斷邀請信本體。
 * @param {{ from: Function }} supabase
 * @param {{ userId?: string|null, configuredCode?: string, now?: string|Date }} opts
 */
export async function fetchReturningPromoEmailBlock(supabase, { userId, configuredCode, now = new Date() } = {}) {
  const code = String(configuredCode ?? process.env.RETURNING_CUSTOMER_PROMO_CODE ?? '').trim();
  if (!code) return null;

  try {
    const { data: promoRow } = await supabase
      .from('promo_codes')
      .select('code, discount_type, discount_value, active, expires_at, max_uses, used_count, public_label')
      .eq('code', code.toUpperCase())
      .maybeSingle();

    let marketingEmailOptIn = null;
    if (userId) {
      const { data: profile } = await supabase
        .from('traveler_profiles')
        .select('marketing_email_opt_in')
        .eq('user_id', userId)
        .maybeSingle();
      if (profile) marketingEmailOptIn = profile.marketing_email_opt_in;
    }

    return buildReturningPromoEmailBlock({ promoRow, marketingEmailOptIn, now });
  } catch {
    return null;
  }
}
