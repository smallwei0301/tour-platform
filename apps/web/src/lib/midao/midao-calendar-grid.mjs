// @ts-check
/**
 * 把 calendar API 的當月 days（date 升冪）折成週一為首欄的週列。
 * 資料層 weekday 慣例＝JS getUTCDay()（0=Sun…6=Sat）；UI 欄序＝一…日 → col=(jsDay+6)%7。
 * @param {Array<{date:string}>} days
 * @returns {Array<Array<any|null>>}
 */
export function buildMonthGrid(days) {
  if (!days?.length) return [];
  const firstCol = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells = [...Array(firstCol).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
