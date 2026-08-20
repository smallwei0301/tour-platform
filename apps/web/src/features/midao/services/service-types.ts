export type ServiceStatus = 'draft' | 'published';
export type ServiceLifecycleState = 'draft' | 'published_versioned' | 'published_unversioned' | 'unpublished';
export type BookingType = 'scheduled' | 'request' | 'instant';
export type QuestionType = 'single_choice' | 'multi_choice' | 'short_text' | 'long_text';

export interface ServiceListItem {
  activityId: string;
  title: string | null;
  slug: string | null;
  status: ServiceStatus;
  lifecycleState: ServiceLifecycleState;
  hasUnpublishedChanges: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  publishedVersion: number | null;
  draftRevision: number | null;
  updatedAt: string | null;
}

export interface ServiceDraftQuestion {
  question_key: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  sort_order: number;
  label?: string;
}

export type PlanPriceType = 'per_person' | 'per_group';

/**
 * #1859 D2：欄位名與型別完全對齊 public.activity_plans，不得改成 camelCase。
 * `slug` 是 S6 發布 RPC 的 (activity_id, slug) 身分鍵：既有方案必帶原值，
 * 新方案不填，交給 S6 既有的 'plan-' || md5(...) 產生規則。
 */
export interface ServicePlan {
  name: string;
  booking_type: BookingType;
  duration_minutes: number;
  price_type: PlanPriceType;
  base_price: number;
  min_participants: number;
  max_participants: number;
  slug?: string;
}

export const PLAN_FIELD_DEFAULTS = {
  duration_minutes: 60,
  price_type: 'per_person',
  base_price: 0,
  min_participants: 1,
  max_participants: 10,
} as const;

export function emptyServicePlan(): ServicePlan {
  return { name: '', booking_type: 'scheduled', ...PLAN_FIELD_DEFAULTS };
}

export const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  scheduled: '指定時段',
  request: '提出需求',
  instant: '立即預約',
};

export const PRICE_TYPE_LABELS: Record<PlanPriceType, string> = {
  per_person: '每人計價',
  per_group: '整團計價',
};

const BOOKING_TYPES: readonly BookingType[] = ['scheduled', 'request', 'instant'];
const PRICE_TYPES: readonly PlanPriceType[] = ['per_person', 'per_group'];

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * #1859：逐欄以型別守衛保留既有值，只有欄位缺失或型別不合法時才補預設。
 * 絕不覆寫已存在的合法值（含 base_price = 0），也絕不為新方案捏造 slug。
 */
export function mergeServicePlan(plan: Partial<ServicePlan> | null | undefined): ServicePlan {
  return {
    name: typeof plan?.name === 'string' ? plan.name : '',
    booking_type: BOOKING_TYPES.includes(plan?.booking_type as BookingType) ? (plan!.booking_type as BookingType) : 'scheduled',
    duration_minutes: finiteNumberOr(plan?.duration_minutes, PLAN_FIELD_DEFAULTS.duration_minutes),
    price_type: PRICE_TYPES.includes(plan?.price_type as PlanPriceType) ? (plan!.price_type as PlanPriceType) : PLAN_FIELD_DEFAULTS.price_type,
    base_price: finiteNumberOr(plan?.base_price, PLAN_FIELD_DEFAULTS.base_price),
    min_participants: finiteNumberOr(plan?.min_participants, PLAN_FIELD_DEFAULTS.min_participants),
    max_participants: finiteNumberOr(plan?.max_participants, PLAN_FIELD_DEFAULTS.max_participants),
    ...(typeof plan?.slug === 'string' ? { slug: plan.slug } : {}),
  };
}

export interface ServiceDraftPayload {
  name: string;
  description: string;
  descriptions?: string[];
  plans: ServicePlan[];
  questions: ServiceDraftQuestion[];
}

export interface PublicationPreview {
  valid: boolean;
  errors: string[];
}

export interface ServiceDraft {
  activityId: string;
  guideId: string;
  revision: number;
  status: 'active' | 'discarded' | 'published';
  payload: Partial<ServiceDraftPayload>;
  updatedAt: string | null;
  materializationOrigin: string;
  materializationReviewState: string | null;
}

export interface ServiceListData {
  items: ServiceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DraftResponseData {
  draft: ServiceDraft | null;
  publicationPreview?: PublicationPreview;
}

export function emptyServiceDraft(): ServiceDraftPayload {
  return {
    name: '',
    description: '',
    descriptions: [],
    plans: [emptyServicePlan()],
    questions: [],
  };
}

export function mergeServiceDraft(payload: Partial<ServiceDraftPayload> | null | undefined): ServiceDraftPayload {
  const defaults = emptyServiceDraft();
  return {
    ...defaults,
    ...(payload ?? {}),
    name: typeof payload?.name === 'string' ? payload.name : defaults.name,
    description: typeof payload?.description === 'string' ? payload.description : defaults.description,
    descriptions: Array.isArray(payload?.descriptions) ? payload.descriptions.filter((value): value is string => typeof value === 'string') : defaults.descriptions,
    plans: Array.isArray(payload?.plans) ? payload.plans.map(mergeServicePlan) : defaults.plans,
    questions: Array.isArray(payload?.questions)
      ? payload.questions.map((question, index) => ({
        question_key: typeof question?.question_key === 'string' ? question.question_key : '',
        type: question?.type === 'single_choice' || question?.type === 'multi_choice' || question?.type === 'long_text' ? question.type : 'short_text',
        options: Array.isArray(question?.options) ? question.options.filter((value): value is string => typeof value === 'string') : [],
        required: question?.required === true,
        sort_order: typeof question?.sort_order === 'number' ? question.sort_order : index,
        ...(typeof question?.label === 'string' ? { label: question.label } : {}),
      }))
      : defaults.questions,
  };
}
