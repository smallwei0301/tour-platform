// 「下載目前行程 JSON」樣板組裝（#1615 第二批）：自 edit page 的 downloadTemplate
// 原樣拆出。輸入為頁面當前編輯中的即時值，輸出 shape 與 applyImportedActivity 讀取的
// shape 一致（可原樣重新匯入），零行為變更。
import { QUOTE_PHOTO_MAX, type SocialProofQuoteRow } from './SocialProofQuotesEditor';

export interface ActivityExportValues {
  title: string;
  guideSlug: string;
  region: string;
  category: string;
  priceTwd: string;
  durationMinutes: string;
  meetingPoint: string;
  meetingPointMapUrl: string;
  coverImageUrl: string;
  imageUrls: string[];
  tagline: string;
  shortDescription: string;
  description: string;
  inclusions: string;
  exclusions: string;
  notices: string;
  refundRules: string;
  safetyNotice: string;
  goodFor: string;
  socialProofQuotes: SocialProofQuoteRow[];
  faq: Array<{ q: string; a: string }>;
}

// #1531+: 「下載 JSON 樣板」匯出「當前正在編輯的這個行程」的所有文案設定，
//  而非固定的柴山範例，方便操作者複製、備份或微調後再匯入。
export function buildActivityExportTemplate(v: ActivityExportValues) {
  const {
    title, guideSlug, region, category, priceTwd, durationMinutes,
    meetingPoint, meetingPointMapUrl, coverImageUrl, imageUrls,
    tagline, shortDescription, description, inclusions, exclusions,
    notices, refundRules, safetyNotice, goodFor, socialProofQuotes, faq,
  } = v;
  const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
  return {
    _instructions: {
      version: 'C - 匯出當前行程設定（可直接重新匯入）',
      note: '此檔為目前編輯中行程的文案設定快照，可直接匯入。_instructions 只做欄位說明，不會寫入資料庫。',
      how_to_use: [
        '1. 複製這份檔案後修改內容',
        '2. 保留欄位名稱不變，只改值',
        '3. 圖片欄位可填真實 URL，也可留空後改用後台上傳',
        '4. activityPlans[] 為 V2 方案（每人／每團計價）。匯入時「只新增不覆蓋」既有方案，之後請至後台「📋 方案管理」維護',
        '5. planItinerary[].imageUrl 是方案介紹步驟的圖片，可填 URL 或後台上傳',
        '6. 匯入後請檢查 diff 預覽，確認後再按儲存'
      ],
      title: '行程名稱。對應後台「行程名稱」。',
      guideSlug: '導遊 slug。對應後台「導遊」，例如 andy-lee。',
      region: '中文地區名稱。對應後台「地區」，例如 高雄市。',
      category: '類別代碼：mountain / river / culture / ecology。',
      priceTwd: '基礎售價（每人 TWD）。對應後台「價格/人」。',
      durationMinutes: '整體活動分鐘數。對應後台「行程時長（分鐘）」。',
      meetingPoint: '集合地點文字。',
      meetingPointMapUrl: 'Google Maps 或其他地圖 URL。',
      coverImageUrl: '封面圖片 URL。也可改用後台上傳。',
      imageUrls: '活動照片 URL 陣列。每個元素一張圖，對應 Gallery，可改用後台上傳。',
      tagline: '一句話副標。',
      shortDescription: '短描述。',
      description: '完整描述。',
      inclusions: '包含項目陣列。',
      exclusions: '不包含項目陣列。',
      notices: '注意事項陣列。',
      refundRules: '退款規則陣列。',
      safetyNotice: '安全說明。',
      goodFor: '適合對象陣列。',
      socialProofQuotes: '社群口碑語錄陣列。',
      faq: 'FAQ 陣列，格式 [{ q, a }]。',
      activityPlans: 'V2 方案陣列；對應後台「📋 方案管理」。匯入時「只新增不覆蓋」既有方案；後續一律於「方案管理」維護。',
      activityPlans_fields: {
        name: '方案名稱（必填）。',
        slug: '方案英文代碼（選填，未填會由名稱自動產生）。',
        priceType: '計價方式：per_person 每人 / per_group 每團。',
        basePrice: '方案基本售價（整數 TWD）。',
        durationMinutes: '方案時長（整數分鐘，至少 15）。',
        bookingType: '預約方式：scheduled 排程 / request 申請 / instant 即時。',
        minParticipants: '最低成團人數。',
        maxParticipants: '方案最多人數。',
        highlights: '方案亮點陣列。',
        detailsLinkText: '查看詳情連結文字。',
        bookingBtnText: '預約按鈕文字。',
        language: '導覽語言。',
        earliestDeparture: '最早可出發日 YYYY-MM-DD。',
        confirmByDays: '最晚幾天前回覆訂單結果。',
        freeCancelDays: '幾天前可免費取消。',
        planInclusions: '方案費用包含項目。',
        planExclusions: '方案費用不包含項目。',
        planItinerary: '方案「詳細行程」站點時間表，格式 [{ icon, title, duration, description, imageUrl? }]。',
        meetingPointName: '集合地點名稱。',
        meetingAddress: '集合地點地址。',
        experiencePointName: '體驗地點名稱。',
        experienceAddress: '體驗地點地址。',
        planNotices: '方案購買須知陣列。',
        planRefundRules: '方案取消政策陣列。'
      }
    },
    // ↓↓↓ 以下皆為「當前編輯中行程」的即時值（含尚未儲存的修改） ↓↓↓
    title: title.trim(),
    guideSlug: guideSlug || undefined,
    region,
    category,
    priceTwd: priceTwd !== '' ? Number(priceTwd) : 0,
    durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
    meetingPoint,
    meetingPointMapUrl,
    coverImageUrl,
    imageUrls,
    tagline,
    shortDescription,
    description,
    inclusions: toArray(inclusions),
    exclusions: toArray(exclusions),
    notices: toArray(notices),
    refundRules: toArray(refundRules),
    safetyNotice,
    goodFor: toArray(goodFor),
    socialProofQuotes: socialProofQuotes
      .map(q => ({ author: q.author.trim(), rating: q.rating, text: q.text.trim(), photos: (q.photos ?? []).filter(Boolean).slice(0, QUOTE_PHOTO_MAX) }))
      .filter(q => q.text.length > 0),
    faq,
    // 方案改由「方案管理」維護，此頁不再持有方案值；提供一筆 V2 範例方案作為匯入起點。
    // 匯入時只會「新增尚不存在的方案」，不會覆蓋既有方案。
    activityPlans: [
      {
        name: '範例方案（每人計價）',
        priceType: 'per_person',
        basePrice: priceTwd !== '' ? Number(priceTwd) : 0,
        durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
        bookingType: 'scheduled',
        minParticipants: 1,
        maxParticipants: 10,
        highlights: [],
        planInclusions: [],
        planExclusions: [],
        planItinerary: [{ icon: '📍', title: '第一站', duration: '', description: '', imageUrl: '' }],
        planNotices: [],
        planRefundRules: [],
      },
    ],
  };
}
