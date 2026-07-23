'use client';

// 公開接案頁需求表單：精選服務卡（選定捲入表單）→ 服務問題 → 日期/時段 → 人數/語言/接送 →
// 聯絡方式 → 特殊需求 → honeypot → 送出。公開端無 CSRF，plain fetch。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, Card, Btn, Icon } from '../../midao2/ui';

type QuestionType = 'text' | 'single_choice' | 'multi_choice' | 'yes_no';

type Question = {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};

type Service = {
  activityId: string;
  title: string;
  tagline: string | null;
  coverImageUrl: string | null;
  durationMinutes: number | null;
  minParticipants: number;
  maxParticipants: number;
  priceTwd: number;
  dealMode: 'instant_booking' | 'confirm_first' | 'line_inquiry';
  questions: Question[];
};

type Guide = {
  displayName: string;
  headline: string | null;
  bio: string | null;
  languages: string[];
  regions: string[];
  experienceYears: number | null;
  photoUrl: string | null;
  heroUrl: string | null;
};

type Period = 'morning' | 'afternoon' | 'evening';
type AvailDay = { date: string; openPeriods: string[] };

const DEAL_MODE_LABEL: Record<string, string> = {
  instant_booking: '可直接預約',
  confirm_first: '先確認日期與需求',
  line_inquiry: '直接使用 LINE 詢問',
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'morning', label: '上午' },
  { key: 'afternoon', label: '下午' },
  { key: 'evening', label: '晚上' },
];

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: '送出太頻繁，請稍後再試',
  INVALID_ACTIVITY: '請重新選擇服務',
  CONTACT_REQUIRED: '請至少留下 LINE ID 或 Email 其中一種聯絡方式',
};

function formatHours(durationMinutes: number | null): string {
  if (!durationMinutes) return '—';
  const hours = durationMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function hasAnswer(v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v && v.trim() !== '';
}

function formatAnswer(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join('、');
  return v ?? '';
}

export default function RequestForm({
  guide: _guide,
  services,
  slug,
}: {
  guide: Guide;
  services: Service[];
  slug: string;
}) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [selectedActivityId, setSelectedActivityId] = useState<string>(services[0]?.activityId ?? '');
  const [travelerName, setTravelerName] = useState('');
  const [lineId, setLineId] = useState('');
  const [email, setEmail] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [backupDate, setBackupDate] = useState('');
  const [preferredPeriod, setPreferredPeriod] = useState('');
  const [participantsCount, setParticipantsCount] = useState(2);
  const [participantsNote, setParticipantsNote] = useState('');
  const [language, setLanguage] = useState('中文');
  const [needPickup, setNeedPickup] = useState(false);
  const [specialNote, setSpecialNote] = useState('');
  const [answersMap, setAnswersMap] = useState<Record<string, string | string[]>>({});
  const [website, setWebsite] = useState(''); // honeypot：正常使用者不會填
  const [availability, setAvailability] = useState<Record<string, AvailDay[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNo, setRequestNo] = useState('');

  const formRef = useRef<HTMLDivElement | null>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.activityId === selectedActivityId) ?? null,
    [services, selectedActivityId],
  );

  function selectService(activityId: string) {
    setSelectedActivityId(activityId);
    setAnswersMap({});
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // 選日期後打 availability API，per month 快取。
  useEffect(() => {
    if (!preferredDate) return;
    const month = preferredDate.slice(0, 7);
    if (availability[month]) return;
    let cancelled = false;
    fetch(`/api/v2/public/midao/guides/${slug}/availability?month=${month}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json?.success) {
          const days: AvailDay[] = Array.isArray(json.data?.days) ? json.data.days : [];
          setAvailability((prev) => ({ ...prev, [month]: days }));
        }
      })
      .catch(() => {
        // 讀取失敗不擋填單，時段膠囊維持中性樣式即可。
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredDate]);

  const month = preferredDate ? preferredDate.slice(0, 7) : '';
  const days = availability[month] ?? [];
  const dayInfo = days.find((d) => d.date === preferredDate);
  const openPeriods = dayInfo?.openPeriods ?? [];
  const dayIsFull = !!preferredDate && !!dayInfo && openPeriods.length === 0;

  function setAnswer(id: string, value: string | string[]) {
    setAnswersMap((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMultiOption(id: string, option: string) {
    setAnswersMap((prev) => {
      const cur = Array.isArray(prev[id]) ? (prev[id] as string[]) : [];
      const next = cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option];
      return { ...prev, [id]: next };
    });
  }

  function resetForm() {
    setStep('form');
    setSelectedActivityId(services[0]?.activityId ?? '');
    setTravelerName('');
    setLineId('');
    setEmail('');
    setPreferredDate('');
    setBackupDate('');
    setPreferredPeriod('');
    setParticipantsCount(2);
    setParticipantsNote('');
    setLanguage('中文');
    setNeedPickup(false);
    setSpecialNote('');
    setAnswersMap({});
    setWebsite('');
    setError(null);
    setRequestNo('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (!selectedActivityId) {
      setError('請選擇服務');
      return;
    }
    if (!travelerName.trim()) {
      setError('請填寫稱呼');
      return;
    }
    if (!preferredDate) {
      setError('請選擇希望日期');
      return;
    }
    if (!lineId.trim() && !email.trim()) {
      setError(ERROR_MESSAGES.CONTACT_REQUIRED);
      return;
    }
    const missingRequired = (selectedService?.questions ?? []).some((q) => q.required && !hasAnswer(answersMap[q.id]));
    if (missingRequired) {
      setError('請完整填寫必填項目');
      return;
    }

    setSubmitting(true);
    try {
      const answers = (selectedService?.questions ?? []).map((q) => ({
        questionId: q.id,
        label: q.label,
        answer: formatAnswer(answersMap[q.id]),
      }));
      const res = await fetch(`/api/v2/public/midao/guides/${slug}/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          activityId: selectedActivityId,
          travelerName: travelerName.trim(),
          travelerLineId: lineId.trim(),
          travelerEmail: email.trim(),
          preferredDate,
          backupDate: backupDate || undefined,
          preferredPeriod: preferredPeriod || undefined,
          participantsCount,
          participantsNote,
          language,
          needPickup,
          specialNote,
          answers,
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) {
        const code = json?.error?.code as string | undefined;
        setError((code && ERROR_MESSAGES[code]) || json?.error?.message || '送出失敗，請稍後再試');
        return;
      }
      setRequestNo(json.data?.requestNo ?? '');
      setStep('done');
    } catch {
      setError('網路異常，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'done') {
    return (
      <Card data-testid="g-done" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ color: C.GREEN, display: 'flex', justifyContent: 'center' }}>
          <Icon name="check-circle" size={48} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 14 }}>需求已送出</div>
        <div style={{ fontSize: 14, color: C.MUTED, marginTop: 6, fontFamily: 'monospace' }}>編號 #{requestNo}</div>
        <div style={{ fontSize: 14, color: C.TEXT, marginTop: 16 }}>
          導遊會透過你留下的 LINE 或 Email 與你聯繫，通常一天內回覆。
        </div>
        <div style={{ marginTop: 24 }}>
          <Btn kind="secondary" onClick={resetForm}>
            再送一筆
          </Btn>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 精選服務 */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>精選服務</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map((svc) => {
            const selected = svc.activityId === selectedActivityId;
            return (
              <Card
                key={svc.activityId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  border: selected ? `2px solid ${C.ACCENT}` : `1px solid ${C.BORDER}`,
                }}
              >
                <div
                  style={{
                    height: 140,
                    borderRadius: 10,
                    background: C.BG,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {svc.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={svc.coverImageUrl}
                      alt={svc.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Icon name="image-upload" size={32} style={{ color: C.MUTED }} />
                  )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{svc.title}</div>
                <div style={{ fontSize: 13, color: C.MUTED }}>
                  約 {formatHours(svc.durationMinutes)} 小時・{svc.minParticipants}-{svc.maxParticipants} 人
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: C.GREEN }}>
                    NT${svc.priceTwd.toLocaleString()} 起
                  </span>
                  <span style={{ fontSize: 12, color: C.MUTED }}>{DEAL_MODE_LABEL[svc.dealMode] || svc.dealMode}</span>
                </div>
                <Btn
                  kind={selected ? 'primary' : 'secondary'}
                  onClick={() => selectService(svc.activityId)}
                  data-testid={`g-svc-${svc.activityId}`}
                >
                  {selected ? '✓ 已選定此服務' : '選擇此服務'}
                </Btn>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 需求表單 */}
      <div ref={formRef} id="request-form">
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>填寫需求</h2>

          {selectedService?.dealMode === 'line_inquiry' && (
            <div
              style={{
                background: C.ACCENT_SOFT,
                color: C.ACCENT,
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
              }}
            >
              這個服務由導遊透過 LINE 與你確認細節，留下 LINE ID 導遊會主動加你。
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>稱呼</span>
              <input
                value={travelerName}
                onChange={(e) => setTravelerName(e.target.value)}
                maxLength={60}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
            </label>

            {/* 服務問題 */}
            {selectedService?.questions.map((q) => (
              <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 14, color: C.MUTED }}>
                  {q.label}
                  {q.required && <span style={{ color: '#dc2626' }}> *</span>}
                </span>
                {q.type === 'text' && (
                  <input
                    value={(answersMap[q.id] as string) ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
                  />
                )}
                {q.type === 'yes_no' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['是', '否'].map((opt) => {
                      const on = answersMap[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswer(q.id, opt)}
                          style={{
                            flex: 1,
                            borderRadius: 999,
                            border: `1px solid ${on ? C.ACCENT : C.BORDER}`,
                            background: on ? C.ACCENT_SOFT : C.CARD,
                            color: on ? C.ACCENT : C.TEXT,
                            padding: '8px 4px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.type === 'single_choice' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {q.options.map((opt) => {
                      const on = answersMap[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setAnswer(q.id, opt)}
                          style={{
                            borderRadius: 999,
                            border: `1px solid ${on ? C.ACCENT : C.BORDER}`,
                            background: on ? C.ACCENT_SOFT : C.CARD,
                            color: on ? C.ACCENT : C.TEXT,
                            padding: '8px 14px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.type === 'multi_choice' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {q.options.map((opt) => {
                      const cur = Array.isArray(answersMap[q.id]) ? (answersMap[q.id] as string[]) : [];
                      const on = cur.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleMultiOption(q.id, opt)}
                          style={{
                            borderRadius: 999,
                            border: `1px solid ${on ? C.ACCENT : C.BORDER}`,
                            background: on ? C.ACCENT_SOFT : C.CARD,
                            color: on ? C.ACCENT : C.TEXT,
                            padding: '8px 14px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {on ? '✓ ' : ''}
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* 日期＋時段 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>希望日期</span>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => {
                  setPreferredDate(e.target.value);
                  setPreferredPeriod('');
                }}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                {PERIODS.map((p) => {
                  const isOpen = openPeriods.includes(p.key);
                  const selected = preferredPeriod === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPreferredPeriod(p.key)}
                      style={{
                        flex: 1,
                        borderRadius: 999,
                        border: `1px solid ${selected ? C.ACCENT : isOpen ? C.ACCENT : C.BORDER}`,
                        background: selected ? C.ACCENT : isOpen ? C.ACCENT_SOFT : C.CARD,
                        color: selected ? '#ffffff' : isOpen ? C.ACCENT : C.MUTED,
                        padding: '8px 4px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {dayIsFull && (
                <div style={{ fontSize: 13, color: '#ea580c' }}>這天已滿，選其他日期或填備用日期</div>
              )}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>備用日期（選填）</span>
              <input
                type="date"
                value={backupDate}
                onChange={(e) => setBackupDate(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>人數</span>
              <input
                type="number"
                min={1}
                max={99}
                value={participantsCount}
                onChange={(e) => setParticipantsCount(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>人數備註（選填）</span>
              <input
                value={participantsNote}
                onChange={(e) => setParticipantsNote(e.target.value)}
                maxLength={200}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>使用語言</span>
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                maxLength={40}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={needPickup} onChange={(e) => setNeedPickup(e.target.checked)} />
              <span style={{ fontSize: 14 }}>需要接送</span>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, color: C.MUTED }}>特殊需求（選填，最多 500 字）</span>
              <textarea
                value={specialNote}
                onChange={(e) => setSpecialNote(e.target.value)}
                maxLength={500}
                rows={3}
                style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14, resize: 'vertical' }}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 14, color: C.MUTED }}>LINE ID</span>
                <input
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  maxLength={120}
                  style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 14, color: C.MUTED }}>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.BORDER}`, fontSize: 14 }}
                />
              </label>
              <div style={{ fontSize: 12, color: C.MUTED }}>LINE ID、Email 至少填寫一種聯絡方式</div>
            </div>

            {/* honeypot：一般使用者看不到也不會填 */}
            <input
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              style={{ display: 'none' }}
              tabIndex={-1}
              autoComplete="off"
            />

            {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

            <Btn kind="primary" type="submit" disabled={submitting} data-testid="g-submit">
              {submitting ? '送出中…' : '送出需求'}
            </Btn>
          </form>
        </Card>
      </div>
    </div>
  );
}
