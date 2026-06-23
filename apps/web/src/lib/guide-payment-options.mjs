// 導遊收款方式的單一資料來源（申請表單、導遊後台、公開頁共用）。
// id 存進 DB（guide_applications.payment_methods / guide_profiles.payment_methods），
// label 用於前端顯示。新增方式只需在此擴充。

export const GUIDE_PAYMENT_OPTIONS = Object.freeze([
  { id: 'bank', label: '銀行轉帳' },
  { id: 'linepay', label: 'LINE Pay' },
  { id: 'transfer', label: '第三方金流' },
]);

const LABEL_BY_ID = Object.freeze(
  GUIDE_PAYMENT_OPTIONS.reduce((map, opt) => {
    map[opt.id] = opt.label;
    return map;
  }, Object.create(null)),
);

/** 把收款方式 id 轉成顯示文字；未知 id 原樣回傳（不丟棄外部值）。 */
export function paymentMethodLabel(id) {
  if (typeof id !== 'string') return '';
  return LABEL_BY_ID[id] ?? id;
}

/** 把 id 陣列轉成 label 陣列（過濾空值）。 */
export function paymentMethodLabels(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => paymentMethodLabel(id)).filter(Boolean);
}
