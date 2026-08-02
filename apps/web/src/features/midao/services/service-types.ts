export type ServiceStatus = 'draft' | 'published';
export type BookingType = 'scheduled' | 'request' | 'instant';
export type QuestionType = 'single_choice' | 'multi_choice' | 'short_text' | 'long_text';

export interface ServiceListItem {
  activityId: string;
  title: string | null;
  slug: string | null;
  status: ServiceStatus;
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

export interface ServicePlan {
  name: string;
  booking_type: BookingType;
  slug?: string;
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
    plans: [{ name: '', booking_type: 'scheduled' }],
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
    plans: Array.isArray(payload?.plans)
      ? payload.plans.map((plan) => ({
        name: typeof plan?.name === 'string' ? plan.name : '',
        booking_type: plan?.booking_type === 'request' || plan?.booking_type === 'instant' ? plan.booking_type : 'scheduled',
        ...(typeof plan?.slug === 'string' ? { slug: plan.slug } : {}),
      }))
      : defaults.plans,
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
