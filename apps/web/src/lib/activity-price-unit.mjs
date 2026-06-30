/**
 * 依「行程的方案集合」推導活動層級價格單位（每人 / 每團）。
 *
 * 行程公開頁的活動層級「起價」顯示（hero／側欄／底部 CTA 預設狀態）原本寫死
 * 「/ 人」，當管理者把方案計價方式設為「每團報價」(price_type='per_group') 時，
 * 仍錯誤顯示每人單位。此 helper 由方案的 price_type 推導活動層級應顯示的單位：
 * 只有「所有方案皆為每團」時才回 'per_group'；混合或無方案時保守回 'per_person'
 * （「起價」是最低價語意，每人為慣用預設）。
 *
 * 同時相容兩種 plan 形狀：normalize 後的 `priceType`（camelCase，
 * 見 db.mjs normalizeActivityDetailFormalPlan）與資料庫原始的 `price_type`。
 *
 * @param {Array<{ priceType?: string, price_type?: string } | null | undefined>} plans
 * @returns {'per_group' | 'per_person'}
 */
export function resolveActivityPriceUnit(plans) {
  const list = Array.isArray(plans) ? plans.filter(Boolean) : [];
  if (list.length === 0) return 'per_person';

  const allPerGroup = list.every((plan) => {
    const type = plan?.priceType ?? plan?.price_type;
    return type === 'per_group';
  });

  return allPerGroup ? 'per_group' : 'per_person';
}
