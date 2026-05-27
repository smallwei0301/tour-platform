'use client';
import Image from 'next/image';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createOrder, fetchActivityBySlug, submitEcpayCallback } from '../../../src/lib/client-api';
import { isBookingV2ShellEnabled } from '../../../src/config/feature-flags.mjs';
import { inferPlanIdForBookingUrl } from '../../../src/lib/booking-entry.mjs';
import { track } from '../../../src/lib/track';

// ── 型別 ──────────────────────────────────────────────────────
interface Schedule {
  id: string;
  startAt: string;
  endAt?: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId?: string | null;
}

interface Activity {
  id: string;
  slug: string;
  title: string;
  priceTwd: number;
  priceLabel: string;
  durationDisplay: string;
  region: string;
  coverImageUrl?: string;
  refundRules: string[];
  maxParticipants: number;
  minParticipants: number;
  schedules: Schedule[];
  plans?: Array<{ id?: string | null; status?: string | null }> | null;
  guide?: { displayName?: string } | null;
}

// ── 內部元件（useSearchParams 必須在 Suspense 內）────────────
function BookingInnerLegacy() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activitySlug = params.activityId as string;

  // URL query params（由 DatePlanSection 帶過來）
  const urlScheduleId = searchParams.get('scheduleId') || '';
  const urlPlanId = searchParams.get('plan') || '';
  const urlDate = searchParams.get('date') || '';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(1);
  const [guests, setGuests] = useState(2);
  const [selectedScheduleId, setSelectedScheduleId] = useState(urlScheduleId);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState('');

  useEffect(() => {
    track({
      event_name: 'booking_page_view',
      properties: {
        activity_slug: activitySlug,
        plan_id: urlPlanId || undefined,
        date: urlDate || undefined,
        rollout_variant: 'legacy',
      },
      page_path: `/booking/${activitySlug}`,
    });
  }, [activitySlug, urlPlanId, urlDate]);

  // ── 從 DB 讀取行程資料 ────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    fetchActivityBySlug(activitySlug)
      .then((data: Activity) => {
        if (!mounted) return;
        setActivity(data);
        // 若 URL 帶了 scheduleId，優先用 URL 的；否則若只有一個場次直接預選
        if (!urlScheduleId && data.schedules?.length === 1 && data.schedules[0].status === 'open') {
          setSelectedScheduleId(data.schedules[0].id);
        }
      })
      .catch((err: Error) => {
        if (mounted) setLoadError(err.message || '找不到此行程');
      });
    return () => { mounted = false; };
  }, [activitySlug, urlScheduleId]);

  // 開放場次（status=open 且有剩餘名額）
  const openSchedules = useMemo(() => {
    if (!activity) return [];
    return activity.schedules.filter((s) => {
      const remaining = s.capacity - s.bookedCount;
      return s.status === 'open' && remaining > 0;
    });
  }, [activity]);

  // 若 URL 帶了 planId，過濾出對應方案的場次（plan_id 為 null 代表適用所有）
  const filteredSchedules = useMemo(() => {
    if (!urlPlanId) return openSchedules;
    return openSchedules.filter((s) => !s.planId || s.planId === urlPlanId);
  }, [openSchedules, urlPlanId]);

  const canGoStep3 = Boolean(
    contactName && contactPhone && contactEmail && agreed && selectedScheduleId
  );

  const total = activity ? activity.priceTwd * guests : 0;

  // ── 建立訂單 ──────────────────────────────────────────────
  async function handleCreateOrderAndGoPayment() {
    if (!canGoStep3 || !activity) {
      setErrorMessage('請先填完整聯絡資訊、選擇可預約場次，並同意條款。');
      return;
    }
    try {
      setLoading(true);
      setErrorMessage('');
      const order = await createOrder({
        experienceSlug: activity.slug,
        scheduleId: selectedScheduleId,
        peopleCount: guests,
        contactName,
        contactPhone,
        contactEmail
      });
      setCreatedOrderId(order.id);
      setStep(3);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '建立訂單失敗');
    } finally {
      setLoading(false);
    }
  }

  // ── 模擬付款成功 ─────────────────────────────────────────
  async function handleMockPaymentSuccess() {
    if (!createdOrderId) {
      setErrorMessage('尚未建立訂單，請回上一步先建立訂單。');
      return;
    }
    try {
      setLoading(true);
      setErrorMessage('');
      await submitEcpayCallback({
        orderId: createdOrderId,
        tradeNo: `MOCK-${Date.now()}`
      });
      // revalidate 後跳轉到成功頁
      router.refresh();
      router.push(`/order/success?orderId=${encodeURIComponent(createdOrderId)}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '付款回調失敗');
    } finally {
      setLoading(false);
    }
  }

  // ── 載入中 / 錯誤狀態 ────────────────────────────────────
  if (loadError) {
    return (
      <main className="tp-container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <h1>找不到此行程</h1>
        <p style={{ color: 'var(--tp-muted)', marginBottom: 16 }}>{loadError}</p>
        <Link href="/activities" className="tp-link">返回行程列表</Link>
      </main>
    );
  }

  if (!activity) {
    return (
      <main className="tp-container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--tp-muted)' }}>載入行程資料中…</p>
      </main>
    );
  }

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">全部行程</Link> &gt; {activity.title} &gt; 預約
      </div>

      {/* 進度列 */}
      <div className="tp-booking-progress" style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 30px', maxWidth: 500 }}>
        {['行程確認', '旅客資訊', '付款'].map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step >= i + 1 ? 'var(--tp-primary)' : '#e5e5e5',
              color: step >= i + 1 ? '#fff' : '#999', fontWeight: 700, fontSize: 14,
            }}>
              {i + 1}
            </div>
            <span style={{ marginLeft: 6, fontSize: 14, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--tp-text)' : 'var(--tp-muted)' }}>
              {label}
            </span>
            {i < 2 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? 'var(--tp-primary)' : '#e5e5e5', margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {errorMessage && (
        <div style={{ marginBottom: 16, background: '#fff4f4', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
          ⚠️ {errorMessage}
        </div>
      )}

      <div className="tp-booking-layout" style={{ display: 'grid', gap: 24 }}>
        <div>
          {/* ── Step 1：行程確認 ── */}
          {step === 1 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                {activity.coverImageUrl && (
                  <Image src={activity.coverImageUrl} alt={activity.title} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} width={1200} height={675} />
                )}
                <div>
                  <h3 style={{ margin: 0 }}>{activity.title}</h3>
                  <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                    📍 {activity.region} · 🕐 {activity.durationDisplay}
                    {activity.guide?.displayName ? ` · 導遊：${activity.guide.displayName}` : ''}
                  </p>
                  {urlPlanId && (
                    <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--tp-primary)', fontWeight: 600 }}>
                      📋 方案：{urlPlanId}
                    </p>
                  )}
                  {urlDate && (
                    <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--tp-muted)' }}>
                      📅 偏好日期：{urlDate}
                    </p>
                  )}
                </div>
              </div>

              {/* 場次選擇 */}
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>📅 選擇可預約場次</span>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }}
                >
                  <option value="">請選擇場次</option>
                  {filteredSchedules.map((s) => {
                    const d = new Date(s.startAt);
                    const remaining = s.capacity - s.bookedCount;
                    return (
                      <option key={s.id} value={s.id}>
                        {d.toLocaleDateString('zh-TW')} {d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}（剩 {remaining} 位）
                      </option>
                    );
                  })}
                </select>
                {filteredSchedules.length === 0 && (
                  <p style={{ marginTop: 6, fontSize: 13, color: '#b42318' }}>目前沒有可預約場次，請稍後再試。</p>
                )}
              </label>

              {/* 人數 */}
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>👥 參加人數</span>
                <input
                  type="number"
                  value={guests}
                  onChange={(e) => setGuests(Math.max(activity.minParticipants || 1, parseInt(e.target.value) || 1))}
                  min={activity.minParticipants || 1}
                  max={activity.maxParticipants || 20}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }}
                />
              </label>

              {/* 費用明細 */}
              <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }}>
                <h4>費用明細</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{activity.priceLabel} × {guests} 人</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--tp-muted)' }}>
                  <span>平台服務費</span>
                  <span>NT$0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--tp-border)', paddingTop: 8, marginTop: 8 }}>
                  <span>總計</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
              </div>

              {/* 取消政策 */}
              {activity.refundRules?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4>取消政策</h4>
                  <ul style={{ paddingLeft: 18, lineHeight: 2, fontSize: 14, color: 'var(--tp-muted)' }}>
                    {activity.refundRules.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              <button
                className="tp-btn tp-btn-primary"
                style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: 16 }}
                onClick={() => setStep(2)}
              >
                下一步：填寫資訊 →
              </button>
            </div>
          )}

          {/* ── Step 2：旅客資訊 ── */}
          {step === 2 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>聯絡人資訊</h3>
              <label style={{ display: 'block', marginBottom: 10 }}>
                姓名 *
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="請輸入真實姓名"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0912-345-678"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                我已閱讀並同意<Link href="/legal/terms" className="tp-link">服務條款</Link>與<Link href="/legal/refund" className="tp-link">退款政策</Link>
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleCreateOrderAndGoPayment}
                  disabled={loading || !canGoStep3}
                >
                  {loading ? '建立訂單中…' : '建立訂單並前往付款 →'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3：付款 ── */}
          {step === 3 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>選擇付款方式</h3>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--tp-primary)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" defaultChecked /> 💳 信用卡（Visa / Mastercard / JCB）
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> LINE Pay
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> ATM 虛擬帳號
                </label>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700 }}>總計：NT${total.toLocaleString()}</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>🔒 付款由 ECPay 加密處理，資料不經本站</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>訂單編號：{createdOrderId}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleMockPaymentSuccess}
                  disabled={loading}
                >
                  {loading ? '付款處理中…' : `確認付款 NT$${total.toLocaleString()}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 右側摘要卡 ── */}
        <div style={{ position: 'sticky', top: 80, height: 'fit-content', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 16 }}>
          {activity.coverImageUrl && (
            <Image src={activity.coverImageUrl} alt={activity.title}
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} width={1200} height={675} />
          )}
          <h4 style={{ margin: '0 0 4px' }}>{activity.title}</h4>
          <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>📍 {activity.region} · 🕐 {activity.durationDisplay}</p>
          {activity.guide?.displayName && (
            <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>導遊：{activity.guide.displayName}</p>
          )}
          <div style={{ borderTop: '1px solid var(--tp-border)', marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>總計</span>
              <span>NT${total.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

interface V2Slot {
  startAt: string;
  endAt: string;
  capacityLeft: number;
  bookingType: 'scheduled' | 'request' | 'instant';
  isAvailable: boolean;
}

interface V2AvailableSlotsResponse {
  success?: boolean;
  data?: {
    timezone?: string;
    activityId?: string;
    planId?: string;
    slots?: V2Slot[];
    reason?: string;
    messageZh?: string;
  };
  error?: {
    message?: string;
  };
}

function BookingInnerV2FlagShell() {
  const params = useParams();
  const searchParams = useSearchParams();

  const activitySlug = params.activityId as string;
  const urlPlanId = searchParams.get('plan') || '';
  const urlScheduleId = searchParams.get('scheduleId') || '';
  const urlDate = searchParams.get('date') || '';
  const timezone = searchParams.get('timezone') || 'Asia/Taipei';
  const source = searchParams.get('source') || searchParams.get('sourceChannel') || 'web';
  const correlationId = searchParams.get('correlationId') || '';
  const sourceChannel = source === 'line' ? 'line' : 'web';
  const isLineContinuation = sourceChannel === 'line';
  const today = new Date().toISOString().slice(0, 10);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loadError, setLoadError] = useState('');
  const [v2Error, setV2Error] = useState('');
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [useLegacyFallback, setUseLegacyFallback] = useState(false);
  const [slots, setSlots] = useState<V2Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today);
  const activeUrlScheduleId = urlScheduleId && (!urlDate || urlDate === selectedDate) ? urlScheduleId : '';
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState('');
  const [resolvedActivityId, setResolvedActivityId] = useState('');
  const [resolvedPlanId, setResolvedPlanId] = useState('');
  const [guests, setGuests] = useState(1);
  const [allowOnePersonAddOn, setAllowOnePersonAddOn] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState('');
  const [step, setStep] = useState(1);
  const v2PlanKey = useMemo(() => inferPlanIdForBookingUrl({
    explicitPlanId: urlPlanId,
    scheduleId: urlScheduleId,
    schedules: activity?.schedules || [],
    plans: activity?.plans || [],
  }), [activity?.schedules, activity?.plans, urlPlanId, urlScheduleId]);
  const canRunV2PlanFlow = Boolean(v2PlanKey);

  useEffect(() => {
    track({
      event_name: 'booking_page_view',
      properties: {
        activity_slug: activitySlug,
        plan_id: urlPlanId || undefined,
        date: selectedDate || undefined,
        rollout_variant: 'v2',
      },
      page_path: `/booking/${activitySlug}`,
    });
  }, [activitySlug, urlPlanId, selectedDate, sourceChannel, correlationId]);

  useEffect(() => {
    let mounted = true;
    fetchActivityBySlug(activitySlug)
      .then((data: Activity) => {
        if (!mounted) return;
        setActivity(data);
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setLoadError(err.message || '找不到此行程');
      });
    return () => {
      mounted = false;
    };
  }, [activitySlug]);

  const baseMinParticipants = Math.max(1, activity?.minParticipants || 1);
  const effectiveMinParticipants = allowOnePersonAddOn ? 1 : baseMinParticipants;

  useEffect(() => {
    if (!activity) return;
    setGuests((prev) => Math.max(prev, effectiveMinParticipants));
  }, [activity, effectiveMinParticipants]);

  useEffect(() => {
    async function probeOnePersonAddOn() {
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate || useLegacyFallback) return;

      try {
        const scheduleParam = activeUrlScheduleId ? `&scheduleId=${encodeURIComponent(activeUrlScheduleId)}` : '';
        const probeUrl = `/api/v2/activities/${activity.id}/available-slots?planId=${encodeURIComponent(v2PlanKey)}&dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDate)}${scheduleParam}&timezone=${encodeURIComponent(timezone)}&participants=1`;
        const res = await fetch(probeUrl, { cache: 'no-store' });
        const json = (await res.json()) as V2AvailableSlotsResponse;
        const onePersonSlots = (json?.data?.slots || []).filter((slot) => slot.isAvailable);
        setAllowOnePersonAddOn(onePersonSlots.length > 0);
      } catch {
        setAllowOnePersonAddOn(false);
      }
    }

    probeOnePersonAddOn();
  }, [activity?.id, selectedDate, timezone, canRunV2PlanFlow, useLegacyFallback, activeUrlScheduleId]);

  useEffect(() => {
    async function fetchSlots() {
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate || useLegacyFallback) return;
      try {
        setSlotsLoading(true);
        setV2Error('');
        const participants = Math.max(guests, effectiveMinParticipants);
        const scheduleParam = activeUrlScheduleId ? `&scheduleId=${encodeURIComponent(activeUrlScheduleId)}` : '';
        const url = `/api/v2/activities/${activity.id}/available-slots?planId=${encodeURIComponent(v2PlanKey)}&dateFrom=${encodeURIComponent(selectedDate)}&dateTo=${encodeURIComponent(selectedDate)}${scheduleParam}&timezone=${encodeURIComponent(timezone)}&participants=${participants}`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = (await res.json()) as V2AvailableSlotsResponse;
        if (!res.ok || !json?.success) {
          setSlots([]);
          setV2Error(json?.data?.messageZh || json?.error?.message || '目前無法載入可預約日期，請稍後再試。');
          return;
        }
        const nextSlotsRaw = (json.data?.slots || []).filter((s: V2Slot) => s.isAvailable);
        const nextSlotsByDate = new Map<string, V2Slot>();
        for (const slot of nextSlotsRaw) {
          const localDate = new Date(slot.startAt).toLocaleDateString('sv-SE', { timeZone: timezone });
          const existing = nextSlotsByDate.get(localDate);
          if (!existing || new Date(slot.startAt).getTime() < new Date(existing.startAt).getTime()) {
            nextSlotsByDate.set(localDate, slot);
          }
        }
        const nextSlots = Array.from(nextSlotsByDate.values()).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        const resolvedPlanCandidate = json.data?.planId || v2PlanKey;
        setResolvedActivityId(json.data?.activityId || activity?.id || '');
        setResolvedPlanId(json.data?.planId || resolvedPlanCandidate);
        setSlots(nextSlots);
        if (nextSlots.length === 0 && json.data?.messageZh) {
          setV2Error(json.data.messageZh);
        }
        if (!nextSlots.find((s: V2Slot) => s.startAt === selectedSlotStartAt)) {
          setSelectedSlotStartAt(nextSlots[0]?.startAt || '');
        }
      } catch {
        setSlots([]);
        setV2Error('目前無法載入可預約日期，請稍後再試。');
      } finally {
        setSlotsLoading(false);
      }
    }
    fetchSlots();
  }, [activity?.id, canRunV2PlanFlow, v2PlanKey, selectedDate, timezone, guests, useLegacyFallback, selectedSlotStartAt, effectiveMinParticipants, activeUrlScheduleId]);

  async function handleV2Checkout() {
    if (!resolvedActivityId || !resolvedPlanId || !selectedSlotStartAt || !agreed) return;
    try {
      setLoading(true);
      setLoadError('');
      setV2Error('');

      const draftRes = await fetch('/api/v2/bookings/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify({
          activityId: resolvedActivityId,
          planId: resolvedPlanId,
          startAt: selectedSlotStartAt,
          timezone,
          participants: Math.max(guests, effectiveMinParticipants),
          sourceChannel,
          contactName,
          contactPhone,
          contactEmail,
          customerNote: note || undefined,
        }),
      });
      const draftJson = await draftRes.json();
      if (!draftRes.ok || !draftJson?.success || !draftJson?.data?.bookingId) {
        throw new Error(draftJson?.error?.message || '建立預約草稿失敗');
      }
      setCreatedBookingId(draftJson.data.bookingId);

      const checkoutRes = await fetch(`/api/v2/bookings/${draftJson.data.bookingId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify({ provider: 'ecpay' }),
      });
      const checkoutJson = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutJson?.success) {
        throw new Error(checkoutJson?.error?.message || '建立付款失敗');
      }

      const paymentFormHtml = checkoutJson?.data?.paymentFormHtml;
      if (!paymentFormHtml) throw new Error('付款表單不存在');

      const container = document.createElement('div');
      container.style.display = 'none';
      container.innerHTML = paymentFormHtml;
      document.body.appendChild(container);
      const form = container.querySelector('form') as HTMLFormElement | null;
      if (!form) throw new Error('付款表單格式錯誤');
      form.submit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '處理失敗';
      setV2Error(msg || '目前無法建立付款流程，請稍後再試。');
      setLoading(false);
    }
  }

  if (useLegacyFallback) {
    return <BookingInnerLegacy />;
  }

  if (!activity) {
    return (
      <main className="tp-container" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--tp-muted)' }}>{loadError || '載入行程中…'}</p>
      </main>
    );
  }

  if (!canRunV2PlanFlow) {
    return (
      <main className="tp-container" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--tp-danger)' }}>缺少或無法判定方案參數（plan），請從行程頁重新選擇方案。</p>
        {isLineContinuation ? (
          <p data-testid="booking-v2-line-fallback-state" style={{ color: 'var(--tp-muted)' }}>
            LINE LIFF 延續流程已中斷（缺少或無法判定 plan）。請回到 LIFF 入口重新帶入完整參數後再試。
          </p>
        ) : (
          <button
            className="tp-btn tp-btn-ghost"
            data-testid="booking-v2-fallback-btn"
            onClick={() => {
              track({
                event_name: 'booking_v2_fallback_clicked',
                properties: { reason: 'missing_plan', rollout_variant: 'v2' },
                page_path: `/booking/${activitySlug}`,
              });
              setUseLegacyFallback(true);
            }}
          >
            改用舊版預約流程
          </button>
        )}
      </main>
    );
  }

  const canSubmit = Boolean(selectedSlotStartAt && contactName && contactPhone && contactEmail && agreed && !loading);
  const canGoStep3 = Boolean(contactName && contactPhone && contactEmail && agreed && !loading);
  const total = activity.priceTwd * guests;

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">全部行程</Link> &gt; {activity.title} &gt; 預約
      </div>

      <div className="tp-booking-progress" style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 30px', maxWidth: 500 }}>
        {['行程確認', '旅客資訊', '付款'].map((label, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: step >= i + 1 ? 'var(--tp-primary)' : '#e5e5e5',
                color: step >= i + 1 ? '#fff' : '#999',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {i + 1}
            </div>
            <span style={{ marginLeft: 6, fontSize: 14, fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? 'var(--tp-text)' : 'var(--tp-muted)' }}>
              {label}
            </span>
            {i < 2 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? 'var(--tp-primary)' : '#e5e5e5', margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {loadError && <p style={{ color: 'var(--tp-danger)' }}>⚠️ {loadError}</p>}
      {v2Error && (
        <div
          data-testid="booking-v2-error"
          style={{ marginBottom: 16, background: '#fff4f4', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}
        >
          ⚠️ {v2Error}
          {isLineContinuation && (
            <p data-testid="booking-v2-line-fallback-state" style={{ color: 'var(--tp-muted)', margin: '10px 0 0' }}>
              LINE LIFF 延續流程維持 shared checkout/payment-init；不切換舊版流程。請重試，若持續失敗請回報 Correlation ID：
              {correlationId || 'line-correlation-missing'}
            </p>
          )}
          <div style={{ marginTop: 10 }}>
            {isLineContinuation ? (
              <button
                className="tp-btn tp-btn-ghost"
                data-testid="booking-v2-line-retry-btn"
                onClick={() => {
                  track({
                    event_name: 'booking_v2_line_retry_clicked',
                    properties: { reason: 'v2_error', rollout_variant: 'v2', correlation_id: correlationId || undefined },
                    page_path: `/booking/${activitySlug}`,
                  });
                  setV2Error('');
                }}
              >
                重新嘗試 shared checkout
              </button>
            ) : (
              <button
                className="tp-btn tp-btn-ghost"
                data-testid="booking-v2-fallback-btn"
                onClick={() => {
                  track({
                    event_name: 'booking_v2_fallback_clicked',
                    properties: { reason: 'v2_error', rollout_variant: 'v2' },
                    page_path: `/booking/${activitySlug}`,
                  });
                  setUseLegacyFallback(true);
                }}
              >
                改用舊版預約流程
              </button>
            )}
          </div>
        </div>
      )}

      <div className="tp-booking-layout" style={{ display: 'grid', gap: 24 }}>
        <div>
          <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {activity.coverImageUrl && (
                <Image src={activity.coverImageUrl} alt={activity.title} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} width={1200} height={675} />
              )}
              <div>
                <h3 style={{ margin: 0 }}>{activity.title}</h3>
                <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                  📍 {activity.region} · 🕐 {activity.durationDisplay}
                  {activity.guide?.displayName ? ` · 導遊：${activity.guide.displayName}` : ''}
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--tp-primary)', fontWeight: 600 }}>📋 方案：{urlPlanId}</p>
              </div>
            </div>
          </div>

          {step === 1 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>行程確認</h3>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>📅 預約日期</span>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="tp-input" />
              </label>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>👥 參加人數</span>
                <input
                  type="number"
                  min={effectiveMinParticipants}
                  value={guests}
                  onChange={(e) => setGuests(Math.max(effectiveMinParticipants, Number(e.target.value) || effectiveMinParticipants))}
                  className="tp-input"
                />
              </label>
              {!allowOnePersonAddOn && <p style={{ margin: '0 0 12px', color: 'var(--tp-muted)', fontSize: 13 }}>此行程最少 {baseMinParticipants} 人成團</p>}

              <p style={{ margin: '0 0 6px' }}>選擇可預約場次</p>
              <div className="tp-input" style={{ minHeight: 44, display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                {slotsLoading && '載入中…'}
                {!slotsLoading && slots.length === 0 && `${selectedDate}（此日期目前無可預約名額）`}
                {!slotsLoading && slots.length > 0 && `${selectedDate}（可預約，剩餘 ${slots[0]?.capacityLeft ?? 0}）`}
              </div>

              <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }}>
                <h4>費用明細</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{activity.priceLabel} × {guests} 人</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--tp-muted)' }}>
                  <span>平台服務費</span>
                  <span>NT$0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--tp-border)', paddingTop: 8, marginTop: 8 }}>
                  <span>總計</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <h4>取消政策</h4>
                <ul style={{ paddingLeft: 18, lineHeight: 2, fontSize: 14, color: 'var(--tp-muted)' }}>
                  {(activity.refundRules || []).map((rule, idx) => <li key={idx}>{rule}</li>)}
                </ul>
              </div>

              <button className="tp-btn tp-btn-primary" onClick={() => setStep(2)} disabled={slotsLoading || slots.length === 0}>
                下一步：填寫資訊 →
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>聯絡人資訊</h3>
              <label style={{ display: 'block', marginBottom: 10 }}>
                姓名 *
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="請輸入真實姓名"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0912-345-678"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                我已閱讀並同意<Link href="/legal/terms" className="tp-link">服務條款</Link>與<Link href="/legal/refund" className="tp-link">退款政策</Link>
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={() => setStep(3)}
                  disabled={loading || !canGoStep3}
                >
                  建立訂單並前往付款 →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>選擇付款方式</h3>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--tp-primary)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" defaultChecked /> 💳 信用卡（Visa / Mastercard / JCB）
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> LINE Pay
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--tp-border)', borderRadius: 10, padding: 12 }}>
                  <input type="radio" name="payment" /> ATM 虛擬帳號
                </label>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700 }}>總計：NT${total.toLocaleString()}</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>🔒 付款由 ECPay 加密處理，資料不經本站</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>訂單編號：{createdBookingId || '尚未建立'}</p>
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleV2Checkout}
                  disabled={loading || !canSubmit}
                >
                  {loading ? '付款處理中…' : `確認付款 NT$${total.toLocaleString()}`}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 16, height: 'fit-content', position: 'sticky', top: 80 }}>
          {activity.coverImageUrl && (
            <Image src={activity.coverImageUrl} alt={activity.title}
              style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 10, marginBottom: 10 }} width={1200} height={675} />
          )}
          <h3 style={{ marginTop: 0 }}>預約摘要</h3>
          <p style={{ margin: '6px 0' }}>日期：{selectedDate}</p>
          <p style={{ margin: '6px 0' }}>人數：{guests} 人</p>
          <p style={{ margin: '6px 0' }}>可預約名額：{slots[0]?.capacityLeft ?? 0}</p>
          <hr style={{ border: 0, borderTop: '1px solid var(--tp-border)', margin: '12px 0' }} />
          <p style={{ margin: 0, fontWeight: 700 }}>總計 NT${total.toLocaleString()}</p>
        </aside>
      </div>
    </main>
  );
}

// ── 外層包 Suspense（useSearchParams 需要）───────────────────
export default function BookingPage() {
  const useV2 = isBookingV2ShellEnabled();

  return (
    <Suspense fallback={
      <main className="tp-container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--tp-muted)' }}>載入中…</p>
      </main>
    }>
      {useV2 ? <BookingInnerV2FlagShell /> : <BookingInnerLegacy />}
    </Suspense>
  );
}
