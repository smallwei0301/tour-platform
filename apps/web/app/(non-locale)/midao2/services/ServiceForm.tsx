'use client';

// midao2 服務三步精靈（create／edit 共用）：①基本資料 ─ ②需求問題 ─ ③預覽發布。
// 封面照片：create 模式僅暫存 File，交由父層在建立成功後上傳＋PATCH；
// edit 模式選檔後立即 compressImage→upload-image→PATCH coverImageUrl。

import React, { useState } from 'react';
import { C, Btn, Field, apiSend, Icon } from '../ui';
import { compressImage } from '../../../../src/lib/client-image-compress';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

export type DealMode = 'instant_booking' | 'confirm_first' | 'line_inquiry';
export type QuestionType = 'text' | 'yes_no' | 'single_choice' | 'multi_choice';
export type ServiceQuestion = { id?: string; label: string; type: QuestionType; options: string[]; required: boolean };

// ── 多方案（#1860 Stage 1B）───────────────────────────────
// canonical `activity_plans` 的 UI 投影。方案的新增／編輯／下架一律走單方案 API，
// 不經 ServiceValues、不經服務層 PATCH（避免全量替換造成未觸碰方案被靜默下架）。
export type PlanBookingType = 'scheduled' | 'request' | 'instant';
export type PlanPriceType = 'per_person' | 'per_group';
export type PlanStatus = 'active' | 'inactive';

export type ServicePlan = {
  id: string;
  slug: string | null;
  name: string;
  bookingType: PlanBookingType;
  durationMinutes: number;
  priceType: PlanPriceType;
  basePrice: number;
  minParticipants: number;
  maxParticipants: number;
  status: PlanStatus;
  updatedAt?: string | null;
};

// 送往單方案 API 的可編輯欄位（不含 id／slug／status／歸屬）。
export type ServicePlanDraft = {
  name: string;
  bookingType: PlanBookingType;
  durationMinutes: number;
  priceType: PlanPriceType;
  basePrice: number;
  minParticipants: number;
  maxParticipants: number;
};

const PLAN_BOOKING_TYPES: { key: PlanBookingType; label: string }[] = [
  { key: 'request', label: '先確認再成立' },
  { key: 'instant', label: '可直接預約' },
  { key: 'scheduled', label: '固定梯次' },
];
const PLAN_PRICE_TYPES: { key: PlanPriceType; label: string }[] = [
  { key: 'per_person', label: '每人計價' },
  { key: 'per_group', label: '每團計價' },
];
const PLAN_PRICE_TYPE_LABEL: Record<string, string> = {
  per_person: '每人計價',
  per_group: '每團計價',
};
const PLAN_BOOKING_TYPE_LABEL: Record<string, string> = {
  request: '先確認再成立',
  instant: '可直接預約',
  scheduled: '固定梯次',
};

// 服務層儲存前的固定提示（驗收要求逐字一致）。
export const PLAN_SAVE_NOTICE = '儲存後會立即更新前台';
// 單方案下架的必要警示（驗收要求逐字一致）。
export const PLAN_DEACTIVATE_WARNING = '只下架這一個方案，其他方案不受影響，已成立的訂單與歷史紀錄不受影響';

const EMPTY_PLAN_DRAFT: ServicePlanDraft = {
  name: '',
  bookingType: 'request',
  durationMinutes: 180,
  priceType: 'per_person',
  basePrice: 0,
  minParticipants: 1,
  maxParticipants: 6,
};

function planToDraft(plan: ServicePlan): ServicePlanDraft {
  return {
    name: plan.name ?? '',
    bookingType: plan.bookingType ?? 'request',
    durationMinutes: Number(plan.durationMinutes ?? 0),
    priceType: plan.priceType ?? 'per_person',
    basePrice: Number(plan.basePrice ?? 0),
    minParticipants: Number(plan.minParticipants ?? 1),
    maxParticipants: Number(plan.maxParticipants ?? 1),
  };
}

function validatePlanDraft(draft: ServicePlanDraft): string | null {
  if (!draft.name.trim()) return '請填寫方案名稱';
  if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes <= 0) return '請填寫方案時長（分鐘）';
  if (!Number.isFinite(draft.basePrice) || draft.basePrice < 0) return '請填寫方案價格';
  if (!Number.isFinite(draft.minParticipants) || draft.minParticipants < 1) return '最少人數需至少 1 人';
  if (!Number.isFinite(draft.maxParticipants) || draft.maxParticipants < draft.minParticipants) return '最多人數需大於或等於最少人數';
  return null;
}

export type ServiceValues = {
  title: string;
  tagline: string;
  coverImageUrl: string | null;
  durationMinutes: number;
  minParticipants: number;
  maxParticipants: number;
  region: string;
  languages: string[];
  priceTwd: number;
  dealMode: DealMode;
  questions: ServiceQuestion[];
};

type ServiceFormInitial = Partial<ServiceValues> & { activityId?: string };

const TEMPLATES: { key: string; label: string; preset: { durationMinutes: number; minParticipants: number; maxParticipants: number } }[] = [
  { key: 'hiking', label: '登山導覽', preset: { durationMinutes: 300, minParticipants: 2, maxParticipants: 6 } },
  { key: 'citywalk', label: '城市文化導覽', preset: { durationMinutes: 180, minParticipants: 2, maxParticipants: 8 } },
  { key: 'daytour', label: '包車一日遊', preset: { durationMinutes: 480, minParticipants: 1, maxParticipants: 4 } },
];

const DURATION_OPTIONS = [90, 120, 180, 240, 300, 360, 480];
const REGION_OPTIONS = ['高雄', '台南', '屏東', '台北', '台中', '花蓮', '台東', '南投', '宜蘭'];
const LANGUAGE_OPTIONS = ['中文', 'English', '日本語', '한국어'];
const DEAL_MODES: { key: DealMode; label: string }[] = [
  { key: 'instant_booking', label: '可直接預約' },
  { key: 'confirm_first', label: '先確認日期與需求' },
  { key: 'line_inquiry', label: '直接使用 LINE 詢問' },
];
const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: '簡答', yes_no: '是否', single_choice: '單選', multi_choice: '複選',
};
const DEFAULT_QUESTIONS: ServiceQuestion[] = [
  { label: '是否需要接送', type: 'yes_no', options: [], required: true },
  { label: '有想特別造訪的地點嗎', type: 'text', options: [], required: false },
];

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} 小時` : `${h.toFixed(1)} 小時`;
}

function initValues(initial?: ServiceFormInitial): ServiceValues {
  return {
    title: initial?.title ?? '',
    tagline: initial?.tagline ?? '',
    coverImageUrl: initial?.coverImageUrl ?? null,
    durationMinutes: initial?.durationMinutes ?? 0,
    minParticipants: initial?.minParticipants ?? 2,
    maxParticipants: initial?.maxParticipants ?? 6,
    region: initial?.region ?? '',
    languages: initial?.languages ?? [],
    priceTwd: initial?.priceTwd ?? 0,
    dealMode: initial?.dealMode ?? 'confirm_first',
    questions: initial?.questions ?? [],
  };
}

export default function ServiceForm({
  initial,
  onSubmit,
  submitting,
  mode,
  plans,
  plansLoading,
  plansError,
  onPlanCreate,
  onPlanUpdate,
  onPlanDeactivate,
}: {
  initial?: ServiceFormInitial;
  onSubmit: (values: ServiceValues, publish: boolean | null, coverFile?: File | null) => void;
  submitting?: boolean;
  mode: 'create' | 'edit';
  // 方案清單由父層獨立載入；ServiceValues 永遠不攜帶 plans。
  plans?: ServicePlan[];
  plansLoading?: boolean;
  plansError?: string | null;
  onPlanCreate?: (draft: ServicePlanDraft) => Promise<void>;
  onPlanUpdate?: (plan: ServicePlan, draft: ServicePlanDraft) => Promise<void>;
  onPlanDeactivate?: (plan: ServicePlan) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ServiceValues>(() => initValues(initial));
  const [seededQuestions, setSeededQuestions] = useState(mode === 'edit');
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial?.coverImageUrl ?? null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  // 方案編輯狀態：'new' 代表新增表單，其餘為 planId。
  const [planEditingId, setPlanEditingId] = useState<string | null>(null);
  const [planDraft, setPlanDraft] = useState<ServicePlanDraft>(EMPTY_PLAN_DRAFT);
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planActionError, setPlanActionError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ServicePlan | null>(null);

  const planList = plans ?? [];

  function set<K extends keyof ServiceValues>(key: K, value: ServiceValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyTemplate(key: string) {
    const tpl = TEMPLATES.find((t) => t.key === key);
    if (!tpl) return;
    setForm((prev) => ({ ...prev, ...tpl.preset }));
  }

  async function handleCoverFile(file: File) {
    setCoverError(null);
    if (mode === 'create') {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
      return;
    }
    const activityId = initial?.activityId;
    if (!activityId) return;
    setCoverUploading(true);
    let uploadedUrl: string | null = null;
    try {
      const compressed = await compressImage(file, 'gallery');
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch(`/api/guide/activities/${activityId}/upload-image`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok || !json.data?.url) throw new Error(json?.error?.message || '上傳失敗');
      uploadedUrl = json.data.url;
    } catch (err: any) {
      setCoverError(err?.message || '封面上傳失敗');
      setCoverUploading(false);
      return;
    }
    try {
      await apiSend(`/api/v2/guide/midao/services/${activityId}`, 'PATCH', { coverImageUrl: uploadedUrl });
      set('coverImageUrl', uploadedUrl);
      setCoverPreview(uploadedUrl);
    } catch {
      setCoverError('封面已上傳但儲存失敗，請再試一次');
    } finally {
      setCoverUploading(false);
    }
  }

  function goStep2() {
    if (!form.title.trim()) return setStep1Error('請填寫服務名稱');
    if (!form.durationMinutes) return setStep1Error('請選擇服務時間');
    if (form.minParticipants < 1 || form.maxParticipants < form.minParticipants) return setStep1Error('請確認適合人數');
    if (!Number.isFinite(form.priceTwd) || form.priceTwd < 0) return setStep1Error('請填寫參考價格');
    setStep1Error(null);
    if (!seededQuestions && form.questions.length === 0) {
      setForm((prev) => ({ ...prev, questions: DEFAULT_QUESTIONS.map((q) => ({ ...q })) }));
      setSeededQuestions(true);
    }
    setStep(2);
  }

  function addQuestion() {
    if (form.questions.length >= 10) return;
    set('questions', [...form.questions, { label: '', type: 'text', options: [], required: false }]);
  }

  function updateQuestion(idx: number, patch: Partial<ServiceQuestion>) {
    set('questions', form.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function removeQuestion(idx: number) {
    set('questions', form.questions.filter((_, i) => i !== idx));
  }

  // ── 方案管理（單方案命令；不經 onSubmit、不經服務層 PATCH）──────────
  function openPlanCreate() {
    setPlanActionError(null);
    setPlanFormError(null);
    setPlanDraft({ ...EMPTY_PLAN_DRAFT });
    setPlanEditingId('new');
  }

  function openPlanEdit(plan: ServicePlan) {
    setPlanActionError(null);
    setPlanFormError(null);
    setPlanDraft(planToDraft(plan));
    setPlanEditingId(plan.id);
  }

  function closePlanForm() {
    setPlanEditingId(null);
    setPlanFormError(null);
  }

  function setPlanField<K extends keyof ServicePlanDraft>(key: K, value: ServicePlanDraft[K]) {
    setPlanDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submitPlanForm() {
    if (planBusy) return;
    const invalid = validatePlanDraft(planDraft);
    if (invalid) { setPlanFormError(invalid); return; }
    setPlanFormError(null);
    setPlanActionError(null);
    setPlanBusy(true);
    try {
      if (planEditingId === 'new') {
        if (!onPlanCreate) return;
        await onPlanCreate({ ...planDraft, name: planDraft.name.trim() });
      } else {
        const target = planList.find((p) => p.id === planEditingId);
        if (!target || !onPlanUpdate) return;
        // 僅送這一個方案，其他方案不進 payload。
        await onPlanUpdate(target, { ...planDraft, name: planDraft.name.trim() });
      }
      setPlanEditingId(null);
    } catch (err: any) {
      setPlanFormError(err?.message || '方案儲存失敗');
    } finally {
      setPlanBusy(false);
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget || planBusy || !onPlanDeactivate) return;
    setPlanBusy(true);
    setPlanActionError(null);
    try {
      await onPlanDeactivate(deactivateTarget);
      setDeactivateTarget(null);
    } catch (err: any) {
      setPlanActionError(err?.message || '下架失敗');
    } finally {
      setPlanBusy(false);
    }
  }

  function renderPlanForm() {
    return (
      <div
        data-testid="midao2-plan-form"
        style={{ border: `1px solid ${C.ACCENT}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700 }}>{planEditingId === 'new' ? '新增方案' : '編輯方案'}</div>
        <Field label="方案名稱">
          <input
            value={planDraft.name}
            onChange={(e) => setPlanField('name', e.target.value)}
            data-testid="midao2-plan-field-name"
            style={inputStyle}
          />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="時長（分鐘）">
            <input
              type="number" min={1} value={planDraft.durationMinutes}
              onChange={(e) => setPlanField('durationMinutes', Number(e.target.value))}
              data-testid="midao2-plan-field-duration"
              style={inputStyle}
            />
          </Field>
          <Field label="價格（NT$）">
            <input
              type="number" min={0} value={planDraft.basePrice}
              onChange={(e) => setPlanField('basePrice', Number(e.target.value))}
              data-testid="midao2-plan-field-price"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="最少人數">
            <input
              type="number" min={1} value={planDraft.minParticipants}
              onChange={(e) => setPlanField('minParticipants', Number(e.target.value))}
              data-testid="midao2-plan-field-min"
              style={inputStyle}
            />
          </Field>
          <Field label="最多人數">
            <input
              type="number" min={1} value={planDraft.maxParticipants}
              onChange={(e) => setPlanField('maxParticipants', Number(e.target.value))}
              data-testid="midao2-plan-field-max"
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="計價方式">
          <select
            value={planDraft.priceType}
            onChange={(e) => setPlanField('priceType', e.target.value as PlanPriceType)}
            data-testid="midao2-plan-field-price-type"
            style={selectStyle}
          >
            {PLAN_PRICE_TYPES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="預約方式">
          <select
            value={planDraft.bookingType}
            onChange={(e) => setPlanField('bookingType', e.target.value as PlanBookingType)}
            data-testid="midao2-plan-field-booking-type"
            style={selectStyle}
          >
            {PLAN_BOOKING_TYPES.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </Field>
        {planFormError && <div data-testid="midao2-plan-form-error" style={{ color: C.RED, fontSize: 13 }}>{planFormError}</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn kind="primary" disabled={planBusy} onClick={submitPlanForm} data-testid="midao2-plan-save">
            {planBusy ? '儲存中…' : '儲存方案'}
          </Btn>
          <Btn kind="secondary" disabled={planBusy} onClick={closePlanForm} data-testid="midao2-plan-cancel">取消</Btn>
        </div>
      </div>
    );
  }

  function renderPlanSection() {
    return (
      <div
        data-testid="midao2-plan-section"
        style={{ border: `1px solid ${C.BORDER}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>方案管理</div>
            <div style={{ fontSize: 12, color: C.MUTED }}>每個方案獨立儲存；調整一個方案不會影響其他方案。</div>
          </div>
          <Btn
            kind="secondary"
            onClick={openPlanCreate}
            disabled={planBusy || planEditingId === 'new'}
            data-testid="midao2-plan-add"
            style={{ width: 'auto', height: 36, borderRadius: 999, fontSize: 13, padding: '0 14px' }}
          >
            ＋ 新增方案
          </Btn>
        </div>

        {plansError && <div data-testid="midao2-plan-error" style={{ color: C.RED, fontSize: 13 }}>{plansError}</div>}
        {planActionError && <div data-testid="midao2-plan-action-error" style={{ color: C.RED, fontSize: 13 }}>{planActionError}</div>}

        {plansLoading ? (
          <div data-testid="midao2-plan-loading" style={{ fontSize: 13, color: C.MUTED }}>方案載入中…</div>
        ) : (
          <div data-testid="midao2-plan-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {planList.length === 0 ? (
              <div data-testid="midao2-plan-empty" style={{ fontSize: 13, color: C.MUTED }}>尚未建立方案</div>
            ) : (
              planList.map((plan) => {
                const inactive = plan.status === 'inactive';
                return (
                  <div
                    key={plan.id}
                    data-testid={`midao2-plan-row-${plan.id}`}
                    data-plan-status={plan.status}
                    style={{
                      border: `1px solid ${C.BORDER}`, borderRadius: 12, padding: 12,
                      background: inactive ? C.BG : C.CARD,
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span data-testid={`midao2-plan-name-${plan.id}`} style={{ fontSize: 15, fontWeight: 700, color: inactive ? C.MUTED : C.TEXT }}>
                        {plan.name}
                      </span>
                      {inactive && (
                        <span
                          data-testid={`midao2-plan-inactive-${plan.id}`}
                          style={{ fontSize: 12, fontWeight: 700, color: C.MUTED, background: C.BORDER, borderRadius: 999, padding: '2px 10px' }}
                        >
                          已下架
                        </span>
                      )}
                    </div>
                    <div data-testid={`midao2-plan-meta-${plan.id}`} style={{ fontSize: 13, color: C.MUTED }}>
                      {hoursLabel(plan.durationMinutes || 0)} ・ {plan.minParticipants}-{plan.maxParticipants} 人 ・{' '}
                      {PLAN_PRICE_TYPE_LABEL[plan.priceType] || plan.priceType} ・ {PLAN_BOOKING_TYPE_LABEL[plan.bookingType] || plan.bookingType}
                    </div>
                    <div data-testid={`midao2-plan-price-${plan.id}`} style={{ fontSize: 16, fontWeight: 700, color: C.GREEN }}>
                      NT${Number(plan.basePrice || 0).toLocaleString()}
                    </div>
                    <div data-testid={`midao2-plan-slug-${plan.id}`} style={{ fontSize: 12, color: C.MUTED }}>{plan.slug || '—'}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Btn
                        kind="secondary" disabled={planBusy} onClick={() => openPlanEdit(plan)}
                        data-testid={`midao2-plan-edit-${plan.id}`}
                        style={{ width: 'auto', height: 34, borderRadius: 999, fontSize: 13, padding: '0 14px', flex: '1 1 100px', minWidth: 0 }}
                      >
                        編輯
                      </Btn>
                      {!inactive && (
                        <Btn
                          kind="ghost" disabled={planBusy}
                          onClick={() => { setPlanActionError(null); setDeactivateTarget(plan); }}
                          data-testid={`midao2-plan-deactivate-${plan.id}`}
                          style={{ width: 'auto', height: 34, borderRadius: 999, fontSize: 13, padding: '0 14px', color: C.RED, flex: '1 1 100px', minWidth: 0 }}
                        >
                          下架
                        </Btn>
                      )}
                    </div>
                    {planEditingId === plan.id && renderPlanForm()}
                  </div>
                );
              })
            )}
            {planEditingId === 'new' && renderPlanForm()}
          </div>
        )}

        {deactivateTarget && (
          <div
            role="dialog"
            aria-label="下架方案確認"
            data-testid="midao2-plan-deactivate-dialog"
            style={{ border: `1px solid ${C.RED}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: C.ORANGE_SOFT }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>要下架「{deactivateTarget.name}」嗎？</div>
            <div data-testid="midao2-plan-deactivate-warning" style={{ fontSize: 13, color: C.TEXT }}>
              {PLAN_DEACTIVATE_WARNING}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn kind="primary" disabled={planBusy} onClick={confirmDeactivate} data-testid="midao2-plan-deactivate-confirm">
                {planBusy ? '處理中…' : '確認下架這一個方案'}
              </Btn>
              <Btn kind="secondary" disabled={planBusy} onClick={() => setDeactivateTarget(null)} data-testid="midao2-plan-deactivate-cancel">
                取消
              </Btn>
            </div>
          </div>
        )}
      </div>
    );
  }

  const stepMeta = [
    { key: 1, label: '基本資料' },
    { key: 2, label: '需求問題' },
    { key: 3, label: '預覽發布' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {stepMeta.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ flex: 1, height: 1, background: C.BORDER }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#ffffff',
                  background: step === s.key ? C.ACCENT : step > s.key ? C.GREEN : C.BORDER,
                }}
              >
                {step > s.key ? <Icon name="check" size={14} style={{ color: '#ffffff' }} /> : s.key}
              </span>
              <span style={{ fontSize: 13, color: step === s.key ? C.TEXT : C.MUTED, fontWeight: step === s.key ? 700 : 500 }}>{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'create' && (
            <Field label="服務模板（選填，套用預設值）">
              <select onChange={(e) => applyTemplate(e.target.value)} defaultValue="" style={selectStyle}>
                <option value="" disabled>選擇模板</option>
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="服務名稱">
            <input value={form.title} onChange={(e) => set('title', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={`一句話介紹（${form.tagline.length}/60）`}>
            <textarea value={form.tagline} maxLength={60} onChange={(e) => set('tagline', e.target.value)} style={{ ...inputStyle, height: 60 }} />
          </Field>
          <Field label="封面照片">
            <label
              style={{
                border: `1px dashed ${C.BORDER}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6, cursor: 'pointer', color: C.MUTED, fontSize: 13,
              }}
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="封面預覽" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                <>
                  <Icon name="image-upload" size={28} style={{ color: C.MUTED }} />
                  <span>{coverUploading ? '上傳中…' : '新增封面照片'}</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); }}
              />
            </label>
            {coverError && <span style={{ color: C.RED, fontSize: 12 }}>{coverError}</span>}
          </Field>
          <Field label="服務時間">
            <select value={form.durationMinutes || ''} onChange={(e) => set('durationMinutes', Number(e.target.value))} style={selectStyle}>
              <option value="" disabled>選擇時長</option>
              {DURATION_OPTIONS.map((m) => <option key={m} value={m}>{hoursLabel(m)}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="最少人數">
              <input type="number" min={1} value={form.minParticipants} onChange={(e) => set('minParticipants', Number(e.target.value))} style={inputStyle} />
            </Field>
            <Field label="最多人數">
              <input type="number" min={1} value={form.maxParticipants} onChange={(e) => set('maxParticipants', Number(e.target.value))} style={inputStyle} />
            </Field>
          </div>
          <Field label="服務區域">
            <select value={form.region} onChange={(e) => set('region', e.target.value)} style={selectStyle}>
              <option value="">選擇區域</option>
              {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="導覽語言">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = form.languages.includes(lang);
                return (
                  <button
                    key={lang} type="button"
                    onClick={() => set('languages', active ? form.languages.filter((l) => l !== lang) : [...form.languages, lang])}
                    style={{
                      borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${active ? C.ACCENT : C.BORDER}`,
                      background: active ? C.ACCENT_SOFT : C.CARD, color: active ? C.ACCENT : C.TEXT,
                    }}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="參考價格（每人 NT$）">
            <input type="number" min={0} value={form.priceTwd} onChange={(e) => set('priceTwd', Number(e.target.value))} style={inputStyle} />
          </Field>
          <Field label="成交方式">
            <div style={{ background: C.ORANGE_SOFT, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEAL_MODES.map((d) => (
                <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                  <input type="radio" name="dealMode" checked={form.dealMode === d.key} onChange={() => set('dealMode', d.key)} />
                  {d.label}
                </label>
              ))}
            </div>
          </Field>
          {step1Error && <div style={{ color: C.RED, fontSize: 13 }}>{step1Error}</div>}
          {mode === 'edit' && renderPlanSection()}
          <Btn kind="primary" onClick={goStep2} data-testid="midao2-form-next1">下一步：設定需求問題</Btn>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {form.questions.map((q, idx) => (
            <div key={idx} style={{ border: `1px solid ${C.BORDER}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={q.label} placeholder="問題內容" onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="button" onClick={() => removeQuestion(idx)} style={{ background: 'transparent', border: 'none', color: C.RED, cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={q.type} onChange={(e) => updateQuestion(idx, { type: e.target.value as QuestionType })} style={selectStyle}>
                  {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} /> 必填
                </label>
              </div>
              {(q.type === 'single_choice' || q.type === 'multi_choice') && (
                <input
                  value={q.options.join(',')} placeholder="選項（逗號分隔）"
                  onChange={(e) => updateQuestion(idx, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })}
                  style={inputStyle}
                />
              )}
            </div>
          ))}
          <button
            type="button" onClick={addQuestion} disabled={form.questions.length >= 10} data-testid="midao2-form-addq"
            style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: C.ACCENT, fontWeight: 700, cursor: form.questions.length >= 10 ? 'not-allowed' : 'pointer', padding: 0 }}
          >
            ＋ 新增問題（{form.questions.length}/10）
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn kind="secondary" onClick={() => setStep(1)}>上一步</Btn>
            <Btn kind="primary" onClick={() => setStep(3)} data-testid="midao2-form-next2">下一步：預覽發布</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: `1px solid ${C.BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ height: 140, background: C.BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt={form.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : <Icon name="image-upload" size={32} style={{ color: C.MUTED }} />}
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{form.title || '（尚未命名）'}</div>
              {form.tagline && <div style={{ fontSize: 13, color: C.MUTED }}>{form.tagline}</div>}
              <div style={{ fontSize: 13, color: C.MUTED }}>
                約 {hoursLabel(form.durationMinutes || 0)} ・ {form.minParticipants}-{form.maxParticipants} 人
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.GREEN }}>NT${(form.priceTwd || 0).toLocaleString()} 起</div>
              <div style={{ fontSize: 12, color: C.MUTED }}>{DEAL_MODES.find((d) => d.key === form.dealMode)?.label}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn kind="secondary" onClick={() => setStep(2)}>上一步</Btn>
          </div>
          <div data-testid="midao2-form-save-notice" style={{ fontSize: 13, color: C.ORANGE, background: C.ORANGE_SOFT, borderRadius: 8, padding: '8px 12px' }}>
            {PLAN_SAVE_NOTICE}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {mode === 'edit' ? (
              <Btn kind="primary" disabled={submitting} onClick={() => onSubmit(form, null)} data-testid="midao2-form-save-edit">
                儲存變更
              </Btn>
            ) : (
              <>
                <Btn kind="secondary" disabled={submitting} onClick={() => onSubmit(form, false, coverFile)} data-testid="midao2-form-save-draft">
                  儲存草稿
                </Btn>
                <Btn kind="primary" disabled={submitting} onClick={() => onSubmit(form, true, coverFile)} data-testid="midao2-form-publish">
                  發布到接案頁
                </Btn>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: `1px solid ${C.BORDER}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: C.TEXT, background: C.CARD,
};
const selectStyle: React.CSSProperties = { ...inputStyle };
