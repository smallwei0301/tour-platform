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
}: {
  initial?: ServiceFormInitial;
  onSubmit: (values: ServiceValues, publish: boolean | null, coverFile?: File | null) => void;
  submitting?: boolean;
  mode: 'create' | 'edit';
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ServiceValues>(() => initValues(initial));
  const [seededQuestions, setSeededQuestions] = useState(mode === 'edit');
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(initial?.coverImageUrl ?? null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

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
