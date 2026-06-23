/**
 * 統一金額／日期 formatter（#multilingual Phase 0）。
 *
 * 站台原本把 `toLocaleString()` / `Intl.*` / `'NT$'` 散寫在 30+ 處；這裡收斂成單一
 * 真相，純函式、不依賴 React，server component / client / `.mjs` lib（email、telegram、
 * line 通知）皆可 import。漸進遷移：碰到哪個檔案再把它的格式化換成這裡的函式。
 *
 * 設計約束：
 * - 幣別固定 TWD、顯示為 `NT$`，**不做多幣別**（需求確認）。
 * - 日期固定 `Asia/Taipei` 時區，與 next-intl request config 一致。
 */
import type { AppLocale } from '../i18n/routing';

const TAIPEI_TZ = 'Asia/Taipei';

// 金額不分語言一律 NT$ + 千分位、無小數。
const TWD_NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function intlLocale(locale: AppLocale): string {
  switch (locale) {
    case 'en':
      return 'en-US';
    case 'ja':
      return 'ja-JP';
    case 'ko':
      return 'ko-KR';
    default:
      return 'zh-Hant';
  }
}

/** `1234.6` → `"NT$1,235"`。四捨五入到整數，永不出現小數。 */
export function formatPriceTwd(amount: number): string {
  const n = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `NT$${TWD_NUMBER.format(n)}`;
}

/** Asia/Taipei 的日期（年月日）。預設繁中，可指定 locale。 */
export function formatDateTaipei(value: Date | string | number, locale: AppLocale = 'zh-Hant'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TAIPEI_TZ,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

/** Asia/Taipei 的時間（24 小時制 時:分）。 */
export function formatTimeTaipei(value: Date | string | number, locale: AppLocale = 'zh-Hant'): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TAIPEI_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

/** Asia/Taipei 的日期＋時間，組合上面兩者。 */
export function formatDateTimeTaipei(value: Date | string | number, locale: AppLocale = 'zh-Hant'): string {
  return `${formatDateTaipei(value, locale)} ${formatTimeTaipei(value, locale)}`;
}
