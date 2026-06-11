/**
 * Issue #1381 — 公開促銷碼的旅客端過濾與輸出 shape。
 *
 * 只輸出旅客需要的欄位（code/折扣/文案），內部統計（used_count、max_uses、
 * per_user_limit）一律不外洩；過期與用罄的碼自動排除。
 */

function defaultLabel(row) {
  if (row.discount_type === 'percentage') {
    const value = Number(row.discount_value);
    // 9 折 / 85 折 的台灣慣用講法
    const zhe = value % 10 === 0 ? String((100 - value) / 10) : String(100 - value);
    return `輸入 ${row.code} 享 ${zhe} 折`;
  }
  return `輸入 ${row.code} 折抵 NT$${Number(row.discount_value).toLocaleString()}`;
}

/**
 * @param {Array<{
 *   code: string, discount_type: string, discount_value: number,
 *   max_uses?: number, used_count?: number, expires_at?: string|null,
 *   active?: boolean, is_public?: boolean, public_label?: string|null,
 * }>} rows
 * @param {string|Date} now
 * @returns {Array<{ code: string, discountType: string, discountValue: number, label: string, expiresAt: string|null }>}
 */
export function selectPublicPromoCodes(rows, now = new Date()) {
  const nowMs = new Date(now).getTime();
  return (rows || [])
    .filter((row) => {
      if (!row || !row.is_public || !row.active) return false;
      if (row.expires_at && new Date(row.expires_at).getTime() <= nowMs) return false;
      const maxUses = Number(row.max_uses ?? 0);
      if (maxUses > 0 && Number(row.used_count ?? 0) >= maxUses) return false;
      return true;
    })
    .map((row) => ({
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      label: row.public_label || defaultLabel(row),
      expiresAt: row.expires_at ?? null,
    }));
}
