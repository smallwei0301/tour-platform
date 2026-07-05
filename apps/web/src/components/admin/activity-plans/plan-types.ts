// 方案管理共用型別與純函式（#1615 第二批）：自 app/admin/activities/[id]/plans/page.tsx
// 原樣拆出，供頁面、方案表單 Modal 與開放季節面板共用，零行為變更。

// #297 方案詳情「行程介紹」改為站點時間表（參考編輯行程的「詳細行程時間表」設計），
// 每個站點可分區編輯 icon／站名／時長／描述，並可填圖片 URL 或後台上傳。
// 同時相容舊版單行格式 { text, imageUrl }。
export type ItineraryStep = {
  icon: string;
  title: string;
  duration: string;
  description: string;
  imageUrl: string;
};
export type StoredItineraryStep = {
  icon?: string | null;
  title?: string | null;
  duration?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  text?: string | null;
};
export const createEmptyItineraryStep = (): ItineraryStep => ({
  icon: '📍',
  title: '',
  duration: '',
  description: '',
  imageUrl: '',
});

export type ReadinessCheck = {
  readinessOk: boolean;
  blockers: Array<{ code: string; messageZh: string }>;
  warnings: string[];
  summary: {
    activePlansCount: number;
    futureSchedulesCount: number;
    openSchedulesWithNullPlan: number;
  };
};

export type ActivityPlan = {
  id: string;
  activity_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  price_type: 'per_person' | 'per_group';
  base_price: number;
  min_participants: number;
  max_participants: number;
  booking_type: 'scheduled' | 'request' | 'instant';
  status: 'active' | 'inactive' | 'archived';
  is_year_round?: boolean | null;
  created_at: string;
  updated_at: string;
  details_link_text?: string | null;
  booking_btn_text?: string | null;
  highlights?: string[] | null;
  language?: string | null;
  earliest_departure?: string | null;
  confirm_by_days?: number | null;
  free_cancel_days?: number | null;
  plan_inclusions?: string[] | null;
  plan_exclusions?: string[] | null;
  plan_itinerary?: StoredItineraryStep[] | null;
  meeting_point_name?: string | null;
  meeting_address?: string | null;
  experience_point_name?: string | null;
  experience_address?: string | null;
  plan_notices?: string[] | null;
  plan_refund_rules?: string[] | null;
};

export type Activity = {
  id: string;
  title: string;
};

export type ActivityPlanSeason = {
  id: string;
  name: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
  timezone: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type SeasonFormState = {
  name: string;
  start_month: string;
  start_day: string;
  end_month: string;
  end_day: string;
  timezone: string;
};

export const createDefaultSeasonForm = (): SeasonFormState => ({
  name: '',
  start_month: '',
  start_day: '',
  end_month: '',
  end_day: '',
  timezone: 'Asia/Taipei',
});

export const seasonToForm = (season: ActivityPlanSeason): SeasonFormState => ({
  name: season.name,
  start_month: String(season.start_month),
  start_day: String(season.start_day),
  end_month: String(season.end_month),
  end_day: String(season.end_day),
  timezone: season.timezone,
});

export const formatSeasonWindow = (season: Pick<ActivityPlanSeason, 'start_month' | 'start_day' | 'end_month' | 'end_day'>) =>
  `${season.start_month}/${season.start_day} - ${season.end_month}/${season.end_day}`;

export const createDefaultForm = () => ({
  name: '',
  description: '',
  duration_minutes: 60,
  price_type: 'per_person' as 'per_person' | 'per_group',
  base_price: 0,
  min_participants: 1,
  max_participants: 10,
  booking_type: 'scheduled' as 'scheduled' | 'request' | 'instant',
  status: 'active' as 'active' | 'inactive' | 'archived',
  details_link_text: '',
  booking_btn_text: '',
  highlights: '',
  language: '',
  earliest_departure: '',
  confirm_by_days: '',
  free_cancel_days: '',
  plan_inclusions: '',
  plan_exclusions: '',
  plan_itinerary: [] as ItineraryStep[],
  meeting_point_name: '',
  meeting_address: '',
  experience_point_name: '',
  experience_address: '',
  plan_notices: '',
  plan_refund_rules: '',
});

export type PlanFormState = ReturnType<typeof createDefaultForm>;

export const listToTextarea = (value?: string[] | null) => (Array.isArray(value) ? value.join('\n') : '');

// 將後台儲存的行程介紹（新版站點 or 舊版 { text, imageUrl }）轉為可編輯的站點清單。
// 舊版單行的 text 視為站名（title），讓既有資料在新站點編輯器中不流失。
export const itineraryToForm = (value?: StoredItineraryStep[] | null): ItineraryStep[] =>
  Array.isArray(value)
    ? value.map((step) => ({
        icon: (step?.icon || '📍').trim() || '📍',
        title: (step?.title || step?.text || '').trim(),
        duration: (step?.duration || '').trim(),
        description: (step?.description || '').trim(),
        imageUrl: (step?.imageUrl || '').trim(),
      }))
    : [];

// 送出前清掉完全空白的站點；其餘交由後端 normalizeRichPlanPayload 正規化。
export const itineraryForPayload = (steps: ItineraryStep[]) =>
  (Array.isArray(steps) ? steps : [])
    .map((step) => ({
      icon: step.icon.trim(),
      title: step.title.trim(),
      duration: step.duration.trim(),
      description: step.description.trim(),
      imageUrl: step.imageUrl.trim(),
    }))
    .filter((step) => step.title || step.description || step.imageUrl);

export const parseLineList = (value: string) => value.split('\n').map((x) => x.trim()).filter(Boolean);
