/**
 * 導遊新行程投稿（Guide activity intake）
 *
 * 導遊在 /guide/new-activity 填寫最小資訊 → 後端組裝一段「給 AI 的提示詞」寄給
 * 管理者；管理者把整段提示詞貼給 AI，AI 產出可直接匯入後台的行程 JSON。
 *
 * 本檔為純函式（無 I/O），方便單測：
 *  - normalizeIntake(body) — 驗證並正規化導遊填寫內容
 *  - buildActivityIntakePrompt(answers) — 組裝完整 AI 提示詞
 *
 * 目標匯入 schema 與後台「匯入 JSON」一致，見：
 *  apps/web/app/admin/activities/[id]/edit/page.tsx (validateImport)
 */

import { REGION_REGISTRY } from './region-slugs.mjs';
import { normalizeAdditionalRegions } from './activity-regions.mjs';

// 後台合法地區（對應後台 REGIONS，以 region-slugs.mjs 的 REGION_REGISTRY 為單一
// 真實來源，涵蓋全台 18 縣市；過去僅硬編 8 個，導遊只能投稿其中少數地區）。
export const INTAKE_REGION_OPTIONS = Object.values(REGION_REGISTRY).map((r) => r.dbValue);

// 後台合法類別代碼（對應 CATEGORIES）
export const INTAKE_CATEGORY_OPTIONS = [
  { value: 'mountain', label: '山徑' },
  { value: 'river', label: '野溪' },
  { value: 'culture', label: '文化' },
  { value: 'ecology', label: '生態' },
];

// 平台標準退款規則（提示詞內提供，AI 直接沿用，導遊不需填）
export const STANDARD_REFUND_RULES = [
  '出團 168 小時前（含）取消：100% 退款',
  '出團前 超過 72 小時且少於 168 小時取消：70% 退款',
  '出團前 72 小時內（含）取消：不退款',
  '不可抗力或主辦取消：100% 退款或 1 次免費改期',
];

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * 驗證並正規化導遊投稿內容。
 * @returns {{ ok: true, value: object } | { ok: false, message: string }}
 */
export function normalizeIntake(body) {
  const src = body && typeof body === 'object' ? body : {};

  const title = asTrimmedString(src.title);
  const region = asTrimmedString(src.region);
  const category = asTrimmedString(src.category);
  const durationText = asTrimmedString(src.durationText);
  const meetingPoint = asTrimmedString(src.meetingPoint);
  const description = asTrimmedString(src.description);

  // 數字售價（容許帶逗號或「元」字樣）
  const priceRaw = asTrimmedString(src.priceTwd).replace(/[,\s元]/g, '');
  const priceTwd = Number(priceRaw);

  const errors = [];
  if (!title) errors.push('行程名稱（title）為必填');
  if (!region) errors.push('地區（region）為必填');
  else if (!INTAKE_REGION_OPTIONS.includes(region)) {
    errors.push(`地區必須是下列之一：${INTAKE_REGION_OPTIONS.join('、')}`);
  }
  if (!category) errors.push('類別（category）為必填');
  else if (!INTAKE_CATEGORY_OPTIONS.some((c) => c.value === category)) {
    errors.push(`類別必須是下列代碼之一：${INTAKE_CATEGORY_OPTIONS.map((c) => c.value).join(' / ')}`);
  }
  if (!priceRaw || Number.isNaN(priceTwd) || priceTwd <= 0) {
    errors.push('每人售價（priceTwd）為必填，且必須是大於 0 的數字');
  }
  if (!durationText) errors.push('行程時長（durationText）為必填');
  if (!meetingPoint) errors.push('集合地點（meetingPoint）為必填');
  if (!description || description.length < 20) {
    errors.push('行程內容描述（description）為必填，且請至少 20 個字讓 AI 有足夠素材');
  }

  if (errors.length > 0) {
    return { ok: false, message: errors.join('；') };
  }

  // 附加地區（複選）：正規化、去重、排除主要地區，再只保留合法縣市（UI 僅提供
  // 合法選項，過濾是防呆）。主要地區仍存於 region；附加地區存進 regions。
  const regions = normalizeAdditionalRegions(src.regions, region).filter((r) =>
    INTAKE_REGION_OPTIONS.includes(r),
  );

  return {
    ok: true,
    value: {
      title,
      region,
      regions,
      category,
      priceTwd,
      durationText,
      meetingPoint,
      description,
      // 以下皆選填
      noticesRaw: asTrimmedString(src.noticesRaw),
      plansRaw: asTrimmedString(src.plansRaw),
      socialProofRaw: asTrimmedString(src.socialProofRaw),
      faqRaw: asTrimmedString(src.faqRaw),
      guideName: asTrimmedString(src.guideName),
      guideSlug: asTrimmedString(src.guideSlug),
      guideContactEmail: asTrimmedString(src.guideContactEmail),
    },
  };
}

function categoryLabel(value) {
  const found = INTAKE_CATEGORY_OPTIONS.find((c) => c.value === value);
  return found ? found.label : value;
}

function optionalBlock(label, value) {
  const v = asTrimmedString(value);
  if (!v) return `【${label}】（導遊未填，請依行程內容合理生成）`;
  return `【${label}】\n${v}`;
}

/**
 * 組裝完整 AI 提示詞。管理者直接整段複製貼給 AI 即可得到可匯入的 JSON。
 * @param {object} answers normalizeIntake().value
 * @returns {string}
 */
export function buildActivityIntakePrompt(answers) {
  const a = answers || {};
  const refundList = STANDARD_REFUND_RULES.map((r) => `  - ${r}`).join('\n');

  return `你是「Midao 祕島」（台灣在地導遊預約平台）的行程文案與資料編輯。請把下方「導遊填寫的原始內容」轉換並豐富成一份**可直接匯入後台的行程 JSON**。

## 你的任務
1. 將導遊的口語描述整理、擴寫成吸引旅客且真實可信的完整行程文案。
2. 依描述自動補完導遊沒填的欄位（包含項目、不包含項目、注意事項、安全說明、適合對象、FAQ、以及各方案的行程介紹 planItinerary 等）。
3. 嚴格輸出符合下方 schema 的單一 JSON 物件。

## 輸出格式要求（務必遵守）
- 只輸出**一個** JSON 物件，包在單一 \`\`\`json 程式碼區塊中，前後不要任何說明文字。
- 欄位名稱、型別必須完全比照下方 schema，不可增減或改名。
- 圖片欄位請至 **Unsplash**（https://unsplash.com）搜尋與行程主題、地點、氣氛相符的高品質照片，填入完整圖片直連 URL（格式：https://images.unsplash.com/photo-XXXX?auto=format&fit=crop&w=1200&q=80 ）。
  - coverImageUrl：1 張封面圖
  - imageUrls：5 張不同角度的 Gallery 圖（封面圖可列入第一張）
  - 每個 planItinerary 步驟的 imageUrl：與該步驟場景相符的圖片
  - 若某圖片找不到完全相符的可留 ""，不要捏造不存在的 URL。
- \`durationMinutes\` 請把導遊填的時長文字換算成整數分鐘（例：「4.5 小時」→ 270）。
- \`region\` 必須原樣輸出導遊填的「主要地區」中文名稱；\`category\` 必須是代碼（mountain / river / culture / ecology）。
- \`regions\` 為導遊勾選的「附加地區（複選）」中文名稱陣列，請原樣輸出（不要加入主要地區、不要自行增減）；導遊未勾選時輸出 \`[]\`。
- \`refundRules\` 與每個方案的 \`planRefundRules\` 一律使用下方「平台標準退款規則」，不要自創。
- \`faq\` 使用 [{ "q": "...", "a": "..." }] 格式；每則 q／a 不超過 500 字。
- 方案一律輸出到 \`activityPlans\` 陣列（V2 方案管理格式）；行程的「詳細行程」介紹只放在**各方案的 \`planItinerary\`**（站點時間表），不要輸出活動層級的 itinerary。
- 若導遊提供多個方案，輸出多筆 \`activityPlans\`；若沒提供方案資訊，輸出 1 筆涵蓋整體行程的預設方案。
- 每個方案必須有 name（方案名稱）、priceType（\`per_person\` 每人計價 或 \`per_group\` 每團計價）、basePrice（整數 TWD）、durationMinutes（整數分鐘，至少 15）、bookingType（\`scheduled\` 排程／\`request\` 申請／\`instant\` 即時）、minParticipants、maxParticipants、highlights、planItinerary（站點時間表）。detailsLinkText 用「查看方案詳情 ›」、bookingBtnText 用「立即預約」。

## 目標 JSON schema
\`\`\`json
{
  "title": "string",
  "guideSlug": "string（可留空）",
  "region": "中文地區名稱（主要地區）",
  "regions": ["中文地區名稱（附加地區，可為空陣列）"],
  "category": "mountain | river | culture | ecology",
  "priceTwd": 0,
  "durationMinutes": 0,
  "meetingPoint": "string",
  "meetingPointMapUrl": "string（可留空）",
  "coverImageUrl": "https://images.unsplash.com/photo-XXXX?auto=format&fit=crop&w=1200&q=80",
  "imageUrls": ["url1", "url2", "url3", "url4", "url5"],
  "tagline": "一句話副標",
  "shortDescription": "2-3 句短描述",
  "description": "完整描述（可多段，用 \\n 分段）",
  "inclusions": ["string"],
  "exclusions": ["string"],
  "notices": ["string"],
  "refundRules": ["string"],
  "safetyNotice": "string",
  "goodFor": ["string"],
  "socialProofQuotes": ["string 或 { author, rating, text }"],
  "faq": [{ "q": "string", "a": "string" }],
  "activityPlans": [{
    "name": "string（方案名稱）",
    "priceType": "per_person | per_group",
    "basePrice": 0,
    "durationMinutes": 0,
    "bookingType": "scheduled | request | instant",
    "minParticipants": 1,
    "maxParticipants": 10,
    "highlights": ["string"],
    "detailsLinkText": "查看方案詳情 ›",
    "bookingBtnText": "立即預約",
    "language": "string",
    "earliestDeparture": "YYYY-MM-DD",
    "confirmByDays": 2,
    "freeCancelDays": 7,
    "planInclusions": ["string"],
    "planExclusions": ["string"],
    "planItinerary": [{ "icon": "📍", "title": "string", "duration": "string", "description": "string", "imageUrl": "https://images.unsplash.com/photo-XXXX?auto=format&fit=crop&w=1200&q=80" }],
    "meetingPointName": "string",
    "meetingAddress": "string",
    "experiencePointName": "string",
    "experienceAddress": "string",
    "planNotices": ["string"],
    "planRefundRules": ["string"]
  }]
}
\`\`\`

## 平台標準退款規則（直接套用）
${refundList}

## 文案語氣（Midao 祕島 品牌守則）
- 具體勝過抽象（「23 年走柴山」優於「資深嚮導」）；多用動詞（走進、踏過、鑽過）少用形容詞。
- 用台灣口語的溫度，可誠實點出難處（「走 7 小時、有點累」）增加真實感。
- 禁用浮誇詞：療癒、絕美、夢幻、驚艷、美呆、網美必訪、IG 打卡熱點。
- emoji 節制使用；planItinerary 的 icon 可用，內文盡量少。

## 導遊填寫的原始內容
【行程名稱】
${a.title || ''}

【主要地區】
${a.region || ''}

【附加地區（複選）】
${Array.isArray(a.regions) && a.regions.length ? a.regions.join('、') : '（導遊未勾選）'}

【類別】
${categoryLabel(a.category)}（代碼：${a.category || ''}）

【每人售價（TWD）】
${a.priceTwd ?? ''}

【行程時長（導遊填寫）】
${a.durationText || ''}

【集合地點】
${a.meetingPoint || ''}

【行程內容描述】
${a.description || ''}

${optionalBlock('注意事項（導遊填寫）', a.noticesRaw)}

${optionalBlock('方案說明（導遊填寫）', a.plansRaw)}

${optionalBlock('旅客好評／口碑（導遊填寫）', a.socialProofRaw)}

${optionalBlock('常見問答（導遊填寫）', a.faqRaw)}

【導遊資料】
姓名：${a.guideName || '（未填）'}
slug：${a.guideSlug || '（未填，可留空）'}
聯絡 email：${a.guideContactEmail || '（未填）'}

請依以上內容輸出最終 JSON。`;
}
