// Public activity-detail copy follows docs/05-business/06-payment-plan/04-refund-policy-v2.md.
// Display only: merchant configuration and refund calculations remain separate.
export function publicRefundRules(locale) {
  return locale === 'en' ? [
    'At least 168 hours before departure: 100% refund.',
    'More than 72 hours and less than 168 hours before departure: 70% refund.',
    '72 hours or less before departure: 0% refund.',
  ] : [
    '出團前 168 小時（含）以上：100% 退款。',
    '出團前大於 72 小時且少於 168 小時：70% 退款。',
    '出團前 72 小時（含）內：0% 退款。',
  ];
}

export function formatPlanConfirmation(locale, days) {
  if (days == null) return null;
  return locale === 'en'
    ? `Confirmed no later than ${days} days before departure`
    : `最晚出發前 ${days} 天確認`;
}
