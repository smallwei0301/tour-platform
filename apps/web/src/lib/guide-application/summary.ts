/**
 * 嚮導申請內容的單一呈現來源。
 *
 * 管理者 email、Telegram 通知、後台申請詳情頁三個介面共用這份欄位清單，
 * 避免各自列欄位而漂移（漏欄位／標籤不一致／某介面看得到某介面看不到）。
 *
 * 「未填寫」是第一級資訊：招募表單除四項必填（姓名／電話／Email／居住縣市）
 * 外全部選填，審核者必須一眼看出申請者「沒填什麼」，因此本模組一律回傳
 * **完整欄位清單**並以 `filled` 標記，不做「空的就不回傳」的過濾。
 */
import { paymentMethodLabels } from '../guide-payment-options.mjs';

/** 表單補充說明留空時寫進 bio 的佔位文案（申請頁與本模組共用，勿各自硬編）。 */
export const BIO_UNFILLED_PLACEHOLDER = '（申請者未填寫補充說明，請於聯繫時確認）';

/** 各介面顯示「沒填」時的統一用字。 */
export const UNFILLED_LABEL = '未填寫';

export interface GuideApplicationLike {
  id?: string | null;
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  bio?: string | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  regions?: string[] | null;
  certifications?: string[] | null;
  paymentMethods?: string[] | null;
  profilePhotoUrl?: string | null;
  heroImageUrl?: string | null;
  galleryUrls?: string[] | null;
  status?: string | null;
  createdAt?: string | null;
  adminNote?: string | null;
}

export interface GuideApplicationField {
  label: string;
  /** 已填＝實際內容；未填＝UNFILLED_LABEL。呼叫端可直接顯示。 */
  value: string;
  filled: boolean;
  /** true 代表這是表單上的必填欄位（理論上不該出現未填）。 */
  required?: boolean;
  /** 多行內容（如補充說明）需要 pre-wrap 呈現。 */
  multiline?: boolean;
}

function textField(
  label: string,
  raw: unknown,
  opts: { required?: boolean; multiline?: boolean } = {},
): GuideApplicationField {
  const value = typeof raw === 'string' ? raw.trim() : '';
  // bio 的佔位文案等同「沒填」——不要讓審核者以為申請者真的寫了什麼。
  const filled = value !== '' && value !== BIO_UNFILLED_PLACEHOLDER;
  return { label, value: filled ? value : UNFILLED_LABEL, filled, ...opts };
}

function listField(label: string, items: unknown): GuideApplicationField {
  const list = Array.isArray(items)
    ? items.map((v) => String(v ?? '').trim()).filter(Boolean)
    : [];
  return {
    label,
    value: list.length ? list.join('、') : UNFILLED_LABEL,
    filled: list.length > 0,
  };
}

function photoField(label: string, url: unknown): GuideApplicationField {
  const has = typeof url === 'string' && url.trim() !== '';
  return { label, value: has ? '已上傳' : '未上傳', filled: has };
}

/**
 * 攤平成「標籤 → 值（含未填標記）」的完整清單，順序與申請表單一致。
 *
 * 注意欄位對應：海報新增的推薦祕境／帶團經驗／其他旅程類型／LINE ID／
 * 方便聯絡時間都組在 `bio` 裡（不另開 DB 欄位），故「補充說明」一欄會是多行內容。
 */
export function buildGuideApplicationFields(
  app: GuideApplicationLike,
): GuideApplicationField[] {
  const gallery = Array.isArray(app?.galleryUrls)
    ? app.galleryUrls.filter((u) => typeof u === 'string' && u.trim() !== '')
    : [];
  return [
    textField('姓名', app?.fullName, { required: true }),
    textField('聯絡電話', app?.phone, { required: true }),
    textField('電子信箱', app?.email, { required: true }),
    textField('居住縣市', app?.city, { required: true }),
    listField('熟悉的地區／區域', app?.regions),
    listField('想帶的旅程類型（專長）', app?.specialties),
    listField('可帶語言', app?.languages),
    listField('希望的收款方式', paymentMethodLabels(app?.paymentMethods ?? [])),
    listField('自述證照', app?.certifications),
    textField('補充說明（含推薦祕境／帶團經驗／LINE ID／方便聯絡時間）', app?.bio, {
      multiline: true,
    }),
    photoField('個人照', app?.profilePhotoUrl),
    photoField('個人封面', app?.heroImageUrl),
    {
      label: '活動照',
      value: gallery.length ? `已上傳 ${gallery.length} 張` : '未上傳',
      filled: gallery.length > 0,
    },
  ];
}

/** 未填欄位的標籤清單（給通知訊息「還缺什麼」用）。 */
export function listUnfilledLabels(app: GuideApplicationLike): string[] {
  return buildGuideApplicationFields(app)
    .filter((f) => !f.filled)
    .map((f) => f.label);
}

/** 純文字版（Telegram／log 用）：一行一個欄位。 */
export function formatGuideApplicationPlainText(app: GuideApplicationLike): string {
  return buildGuideApplicationFields(app)
    .map((f) => `${f.label}：${f.value}`)
    .join('\n');
}
