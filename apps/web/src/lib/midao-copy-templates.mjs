// @ts-check
/** midao2 剪貼簿文案組字（純函式；文案遵守 BRAND_BOOK：具體、克制、驚嘆號≤1）。 */

const PERIODS = { morning: '上午', afternoon: '下午', evening: '晚上' };
/** @param {string|null|undefined} p */
export function periodLabel(p) { return PERIODS[/** @type {'morning'} */ (p)] ?? ''; }

/** @param {any} r */
export function buildRequestSummaryText(r) {
  const lines = [`【需求摘要】#${r.requestNo}`, `稱呼：${r.travelerName}`];
  if (r.activityTitle) lines.push(`服務：${r.activityTitle}`);
  let dateLine = `日期：${r.preferredDate}`;
  if (r.backupDate) dateLine += `（備用 ${r.backupDate}）`;
  if (r.preferredPeriod) dateLine += `・${periodLabel(r.preferredPeriod)}`;
  lines.push(dateLine);
  let pax = `人數：${r.participantsCount} 位`;
  if (r.participantsNote) pax += `・${r.participantsNote}`;
  lines.push(pax);
  if (r.language) lines.push(`語言：${r.language}`);
  lines.push(`接送：${r.needPickup ? '需要' : '不需要接送'}`);
  if (r.specialNote) lines.push(`特殊需求：${r.specialNote}`);
  for (const a of r.answers ?? []) {
    if (a?.label) lines.push(`${a.label}：${a.answer ?? ''}`);
  }
  if (r.travelerLineId) lines.push(`LINE ID：${r.travelerLineId}`);
  if (r.travelerEmail) lines.push(`Email：${r.travelerEmail}`);
  return lines.join('\n');
}

/** @param {any} r @param {string} guideName */
export function buildLineReplyText(r, guideName) {
  const date = r.preferredPeriod ? `${r.preferredDate} ${periodLabel(r.preferredPeriod)}` : r.preferredDate;
  const service = r.activityTitle ? `「${r.activityTitle}」` : '行程';
  return [
    `${r.travelerName} 您好，我是導遊 ${guideName}。`,
    `已收到您的需求（#${r.requestNo}）：${service}，${date}，${r.participantsCount} 位。`,
    r.specialNote ? `您提到「${r.specialNote}」，我會先確認路線安排再回覆您。` : null,
    `我確認檔期後儘快回覆，有任何問題直接在這裡說。`,
  ].filter(Boolean).join('\n');
}
