'use client';
import Image from 'next/image';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createOrder, fetchActivityByIdOrSlug, fetchActivityBySlug, submitEcpayCallback } from '../../../src/lib/client-api';
import { isBookingV2ShellEnabled } from '../../../src/config/feature-flags.mjs';

// Client component：用字面量 process.env.NEXT_PUBLIC_* 讓 Next build 內嵌（透過 env 參數
// 間接讀取在 client bundle 不會被替換 → 永遠 undefined）。#1475 匯款付款選項旗標。
const TRANSFER_PAYMENT_ENABLED =
  process.env.NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED === '1' ||
  process.env.NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED === 'true';
import { inferPlanIdForBookingUrl } from '../../../src/lib/booking-entry.mjs';
import { getBookingV2Step1CtaState } from '../../../src/lib/booking-v2-step1-cta-state.mjs';
import { derivePlanMetaFromActivityPlans } from '../../../src/lib/booking-v2-plan-meta.mjs';
import { track } from '../../../src/lib/track';
import { formatSlotRangeLabel } from '../../../src/lib/slot-generator';

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
  plans?: Array<{
    id?: string | null;
    slug?: string | null;
    status?: string | null;
    name?: string | null;
    label?: string | null;
    displayName?: string | null;
    basePrice?: number | null;
    priceType?: 'per_person' | 'per_group' | string | null;
    minParticipants?: number | null;
    maxParticipants?: number | null;
  }> | null;
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: activity.title, item: `${baseUrl}/activities/${activity.region}/${activity.slug}` },
      { '@type': 'ListItem', position: 3, name: '預約' },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <h1 className="sr-only">{activity.title} — 預約</h1>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">全部行程</Link> &gt; {activity.title} &gt; 預約
      </div>

      {/* 進度列 */}
      <ol className="tp-booking-progress" aria-label="預約步驟" style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 30px', maxWidth: 500, listStyle: 'none', padding: 0 }}>
        {(['行程確認', '旅客資訊', '付款'] as const).map((label, i) => (
          <li key={i} aria-current={step === i + 1 ? 'step' : undefined} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
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
            {i < 2 && <div role="presentation" style={{ flex: 1, height: 2, background: step > i + 1 ? 'var(--tp-primary)' : '#e5e5e5', margin: '0 8px' }} />}
          </li>
        ))}
      </ol>

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
                  <Image src={activity.coverImageUrl} alt={activity.title} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} width={120} height={80} />
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
                  name="date"
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
                  name="participants"
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
                  required aria-required="true" name="contactName" autoComplete="name"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0912-345-678"
                  required aria-required="true" name="contactPhone" autoComplete="tel"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com"
                  required aria-required="true" name="contactEmail" autoComplete="email"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" name="agreement" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
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
              <h3>付款方式</h3>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--tp-primary)', borderRadius: 10, padding: 12 }}>
                  💳 信用卡（Visa / Mastercard / JCB）
                </div>
                <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: 0 }}>
                  確認後將前往 ECPay 安全付款頁，實際可用付款方式以付款頁顯示為準。
                </p>
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
  // 排程預約（scheduled）方案的固定場次 id；動態時段為 null。
  scheduleId?: string | null;
}

interface V2DateAvailability {
  date: string;
  state: 'available' | 'blocked' | 'no_slots';
  capacityLeft: number;
  reason: string;
  messageZh: string;
  firstAvailableStartAt?: string;
  selectedSlot?: V2Slot;
}

interface V2AvailableSlotsResponse {
  success?: boolean;
  data?: {
    timezone?: string;
    activityId?: string;
    planId?: string;
    selectedPlan?: {
      id?: string;
      name?: string;
      label?: string;
      displayName?: string;
      priceType?: 'per_person' | 'per_group';
      basePrice?: number;
      minParticipants?: number;
      maxParticipants?: number;
      bookingType?: 'scheduled' | 'request' | 'instant';
    };
    slots?: V2Slot[];
    dateAvailability?: V2DateAvailability[];
    dates?: V2DateAvailability[];
    reason?: string;
    messageZh?: string;
  };
  error?: {
    code?: string;
    message?: string;
    messageZh?: string;
    details?: {
      planKey?: string;
      activityId?: string;
      scheduleId?: string | null;
    };
  };
}

const BOOKING_V2_GENERIC_ERROR = '目前無法載入可預約日期，請稍後再試。';
const BOOKING_V2_PLAN_RECOVERY_MESSAGE = '找不到此方案，請回到行程頁重新選擇。';
const BOOKING_V2_PLAN_RECOVERY_REASONS = new Set(['PLAN_NOT_FOUND', 'AMBIGUOUS_PLAN', 'PLAN_INACTIVE', 'STALE_PLAN', 'UNRESOLVABLE_PLAN']);
const BOOKING_V2_PLAN_RECOVERY_MESSAGES = [
  'Activity plan not found',
  'Activity plan is not active',
  'Plan not found',
  'Selected plan not found',
  'Stale plan reference',
];

function getBookingV2RecoveryMessage(response: V2AvailableSlotsResponse) {
  const explicitZh = [response?.data?.messageZh, response?.error?.messageZh]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);
  if (explicitZh) return explicitZh;

  const reason = typeof response?.data?.reason === 'string' ? response.data.reason.trim().toUpperCase() : '';
  if (reason && BOOKING_V2_PLAN_RECOVERY_REASONS.has(reason)) {
    return BOOKING_V2_PLAN_RECOVERY_MESSAGE;
  }

  const errorMessage = typeof response?.error?.message === 'string' ? response.error.message.trim() : '';
  if (
    errorMessage &&
    BOOKING_V2_PLAN_RECOVERY_MESSAGES.some((candidate) => errorMessage.toLowerCase() === candidate.toLowerCase())
  ) {
    return BOOKING_V2_PLAN_RECOVERY_MESSAGE;
  }

  return errorMessage || BOOKING_V2_GENERIC_ERROR;
}

function BookingInnerV2FlagShell() {
  const params = useParams();
  const router = useRouter();
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
  const [useLegacyFallback] = useState(false);
  const [slots, setSlots] = useState<V2Slot[]>([]);
  const [dateAvailabilityOptions, setDateAvailabilityOptions] = useState<V2DateAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today);
  const activeUrlScheduleId = urlScheduleId && (!urlDate || urlDate === selectedDate) ? urlScheduleId : '';
  const v2PlanKey = useMemo(() => inferPlanIdForBookingUrl({
    explicitPlanId: urlPlanId,
    scheduleId: urlScheduleId,
    schedules: activity?.schedules || [],
    plans: activity?.plans || [],
  }), [activity?.schedules, activity?.plans, urlPlanId, urlScheduleId]);
  const activeScheduleId = activeUrlScheduleId;
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState('');
  const [resolvedActivityId, setResolvedActivityId] = useState('');
  const [resolvedPlanId, setResolvedPlanId] = useState('');
  const [availabilityReason, setAvailabilityReason] = useState('');
  const [selectedPlanMeta, setSelectedPlanMeta] = useState<{
    name: string | null;
    priceType: 'per_person' | 'per_group';
    basePrice: number;
    minParticipants: number;
    maxParticipants: number | null;
    bookingType: 'scheduled' | 'request' | 'instant';
  } | null>(null);
  const initialPlanMetaFromActivity = useMemo(
    () => derivePlanMetaFromActivityPlans(activity?.plans, v2PlanKey),
    [activity?.plans, v2PlanKey],
  ) as typeof selectedPlanMeta;
  const effectivePlanMeta = selectedPlanMeta ?? initialPlanMetaFromActivity;
  const [guests, setGuests] = useState(1);
  const [allowOnePersonAddOn, setAllowOnePersonAddOn] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState('');
  // 三種預約模式：request plan 送出申請後（先審核後付款）為 true，step 3 顯示審核中而非付款。
  const [submittedAsRequest, setSubmittedAsRequest] = useState(false);
  const [step, setStep] = useState(1);
  // 付款方式（#1475）：ecpay（信用卡）或 transfer（自行匯款，人工查帳）
  const [payMethod, setPayMethod] = useState<'ecpay' | 'transfer'>('ecpay');
  const [transferInfo, setTransferInfo] = useState<null | {
    configured: boolean; guideName?: string; bankName?: string; accountName?: string; accountNumber?: string; transferNote?: string | null;
  }>(null);
  const [transferSubmitted, setTransferSubmitted] = useState(false);
  const transferEnabled = TRANSFER_PAYMENT_ENABLED;
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
    fetchActivityByIdOrSlug(activitySlug)
      .then((resolved) => {
        if (!mounted) return;
        setActivity(resolved.activity as Activity);
        if (resolved.canonicalSlug && resolved.canonicalSlug !== activitySlug) {
          const nextPath = `/booking/${encodeURIComponent(resolved.canonicalSlug)}`;
          const nextQuery = searchParams.toString();
          const nextUrl = nextQuery ? `${nextPath}?${nextQuery}` : nextPath;
          if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
            window.history.replaceState(window.history.state, '', nextUrl);
          }
          router.replace(nextUrl);
        }
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setLoadError(err.message || '找不到此行程');
      });
    return () => {
      mounted = false;
    };
  }, [activitySlug, router, searchParams]);

  const baseMinParticipants = Math.max(1, effectivePlanMeta?.minParticipants ?? activity?.minParticipants ?? 1);
  const baseMaxParticipants = effectivePlanMeta?.maxParticipants ?? activity?.maxParticipants ?? null;
  const effectiveMinParticipants = allowOnePersonAddOn ? 1 : baseMinParticipants;
  const selectedPlanDisplayName = useMemo(() => {
    const fromApi = effectivePlanMeta?.name?.trim();
    if (fromApi) return fromApi;
    const matchedPlan = (activity?.plans || []).find((plan) => plan?.id && plan.id === v2PlanKey);
    if (!matchedPlan) return null;
    const candidates = [matchedPlan.displayName, matchedPlan.label, matchedPlan.name]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return candidates[0] || null;
  }, [activity?.plans, effectivePlanMeta?.name, v2PlanKey]);

  useEffect(() => {
    if (!activity) return;
    setGuests((prev) => Math.max(prev, effectiveMinParticipants));
  }, [activity, effectiveMinParticipants]);

  useEffect(() => {
    async function probeOnePersonAddOn() {
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate || useLegacyFallback) return;

      try {
        const scheduleParam = activeScheduleId ? `&scheduleId=${encodeURIComponent(activeScheduleId)}` : '';
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
  }, [activity?.id, selectedDate, timezone, canRunV2PlanFlow, useLegacyFallback, activeScheduleId, v2PlanKey]);

  useEffect(() => {
    async function fetchSlots() {
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate || useLegacyFallback) return;
      try {
        setSlotsLoading(true);
        setV2Error('');
        const participants = effectiveMinParticipants;
        const scheduleParam = activeScheduleId ? `&scheduleId=${encodeURIComponent(activeScheduleId)}` : '';
        const rangeStart = new Date(`${selectedDate}T00:00:00.000Z`);
        const rangeEnd = new Date(rangeStart);
        rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 13);
        const dateFrom = rangeStart.toISOString().slice(0, 10);
        const dateTo = rangeEnd.toISOString().slice(0, 10);
        const url = `/api/v2/activities/${activity.id}/available-slots?planId=${encodeURIComponent(v2PlanKey)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}${scheduleParam}&timezone=${encodeURIComponent(timezone)}&participants=${participants}`;
        const res = await fetch(url, { cache: 'no-store' });
        const json = (await res.json()) as V2AvailableSlotsResponse;
        if (!res.ok || !json?.success) {
          setSlots([]);
          setDateAvailabilityOptions([]);
          setAvailabilityReason(json?.data?.reason || '');
          setV2Error(getBookingV2RecoveryMessage(json));
          return;
        }

        const dateAvailability = (json.data?.dateAvailability || json.data?.dates || []).sort((a, b) => a.date.localeCompare(b.date));
        setDateAvailabilityOptions(dateAvailability);

        const selectedDateEntry = dateAvailability.find((entry) => entry.date === selectedDate);
        const selectedSlotFromDateEntry = selectedDateEntry?.selectedSlot;
        const selectedDateSlots = (json.data?.slots || [])
          .filter((slot) => slot.isAvailable)
          .filter((slot) => {
            const localDate = new Date(slot.startAt).toLocaleDateString('sv-SE', { timeZone: timezone });
            return localDate === selectedDate;
          })
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        const fallbackSlot = selectedDateEntry?.firstAvailableStartAt
          ? {
              startAt: selectedDateEntry.firstAvailableStartAt,
              endAt: selectedDateEntry.firstAvailableStartAt,
              capacityLeft: selectedDateEntry.capacityLeft,
              bookingType: 'instant' as const,
              isAvailable: selectedDateEntry.state === 'available',
            }
          : null;
        const canonicalSelectedSlot = selectedSlotFromDateEntry || selectedDateSlots[0] || fallbackSlot;
        // Issue #1306: when the API returns multiple `isAvailable` slots
        // for the selected date, the traveler must be able to pick from
        // all of them — previously this line collapsed `selectedDateSlots`
        // to `[canonicalSelectedSlot]` (a single entry), hiding the rest.
        // Now we keep every available slot the API gave us; only fall back
        // to the canonical/fallback single entry when there are none.
        const nextSlots = selectedDateSlots.length > 0
          ? selectedDateSlots
          : canonicalSelectedSlot
            ? [canonicalSelectedSlot]
            : [];
        const resolvedPlanCandidate = json.data?.planId || v2PlanKey;
        const selectedPlan = json.data?.selectedPlan;
        if (selectedPlan && Number.isFinite(Number(selectedPlan.basePrice))) {
          const selectedPlanName = [selectedPlan.displayName, selectedPlan.label, selectedPlan.name]
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .find((value) => value.length > 0) || null;
          setSelectedPlanMeta({
            name: selectedPlanName,
            priceType: selectedPlan.priceType === 'per_group' ? 'per_group' : 'per_person',
            basePrice: Number(selectedPlan.basePrice),
            minParticipants: Number.isFinite(Number(selectedPlan.minParticipants)) ? Math.max(1, Number(selectedPlan.minParticipants)) : 1,
            maxParticipants: Number.isFinite(Number(selectedPlan.maxParticipants)) ? Number(selectedPlan.maxParticipants) : null,
            bookingType:
              selectedPlan.bookingType === 'request' || selectedPlan.bookingType === 'scheduled'
                ? selectedPlan.bookingType
                : 'instant',
          });
        }
        setResolvedActivityId(json.data?.activityId || activity?.id || '');
        setResolvedPlanId(json.data?.planId || resolvedPlanCandidate);
        setAvailabilityReason(selectedDateEntry?.reason || json.data?.reason || '');
        setSlots(nextSlots);
        setV2Error('');
        if (!nextSlots.find((s: V2Slot) => s.startAt === selectedSlotStartAt)) {
          setSelectedSlotStartAt(nextSlots[0]?.startAt || '');
        }
      } catch {
        setSlots([]);
        setDateAvailabilityOptions([]);
        setAvailabilityReason('');
        setV2Error('目前無法載入可預約日期，請稍後再試。');
      } finally {
        setSlotsLoading(false);
      }
    }
    fetchSlots();
  }, [activity?.id, canRunV2PlanFlow, v2PlanKey, selectedDate, timezone, useLegacyFallback, selectedSlotStartAt, effectiveMinParticipants, activeScheduleId]);

  // 選擇匯款時載入該筆預約的匯款資訊（#1475）。訪客以 contactEmail 授權。
  useEffect(() => {
    if (step !== 3 || payMethod !== 'transfer' || !createdBookingId) return;
    let mounted = true;
    (async () => {
      try {
        const q = contactEmail ? `?contactEmail=${encodeURIComponent(contactEmail)}` : '';
        const res = await fetch(`/api/v2/bookings/${createdBookingId}/transfer-info${q}`, { cache: 'no-store' });
        const json = await res.json();
        if (!mounted) return;
        if (res.ok && json?.success) setTransferInfo(json.data);
        else setTransferInfo({ configured: false });
      } catch {
        if (mounted) setTransferInfo({ configured: false });
      }
    })();
    return () => { mounted = false; };
  }, [step, payMethod, createdBookingId, contactEmail]);

  async function handleCreateDraftBookingAndGoPayment() {
    if (!resolvedActivityId || !resolvedPlanId || !selectedSlotStartAt || !canGoStep3) return;
    try {
      setLoading(true);
      setLoadError('');
      setV2Error('');
      setCreatedBookingId('');

      // 事件：purchase_intent（v2 — 使用者按下「建立訂單並前往付款」）
      track({
        event_name: 'purchase_intent',
        properties: {
          item_id: resolvedActivityId,
          item_name: activity?.title,
          schedule_id: selectedSlotStartAt,
          amount: total,
          rollout_variant: 'v2',
        },
        page_path: `/booking/${activitySlug}`,
      });

      // 排程預約（scheduled）：每個可選時段帶有自己的固定場次 scheduleId，
      // 以選取的時段為準；其餘模式沿用 URL 帶入的 activeScheduleId。
      const selectedSlot = slots.find((s) => s.startAt === selectedSlotStartAt);
      const draftScheduleId = selectedSlot?.scheduleId || activeScheduleId || undefined;

      const draftRes = await fetch('/api/v2/bookings/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify({
          activityId: resolvedActivityId,
          planId: resolvedPlanId,
          scheduleId: draftScheduleId,
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
        throw new Error(
          draftJson?.error?.messageZh || draftJson?.error?.message || '此場次目前無法預約，請重新整理或選擇其他日期。'
        );
      }
      setCreatedBookingId(draftJson.data.bookingId);
      setSubmittedAsRequest(Boolean(draftJson.data.requiresApproval));
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '此場次目前無法預約，請重新整理或選擇其他日期。';
      setV2Error(msg || '此場次目前無法預約，請重新整理或選擇其他日期。');
    } finally {
      setLoading(false);
    }
  }

  async function handleV2Checkout() {
    if (!createdBookingId || !agreed) {
      setV2Error('訂單尚未建立完成，請先回到上一步重新建立訂單。');
      return;
    }
    try {
      setLoading(true);
      setLoadError('');
      setV2Error('');

      const checkoutRes = await fetch(`/api/v2/bookings/${createdBookingId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
        },
        body: JSON.stringify({ provider: payMethod }),
      });
      const checkoutJson = await checkoutRes.json();
      if (!checkoutRes.ok || !checkoutJson?.success) {
        throw new Error(
          checkoutJson?.error?.messageZh || checkoutJson?.error?.message || '此場次目前無法預約，請重新整理或選擇其他日期。'
        );
      }

      // 匯款（#1475）：不導向 ECPay，改顯示「已送出、等待人工查帳」確認。
      if (payMethod === 'transfer') {
        setTransferSubmitted(true);
        return;
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
      const msg = err instanceof Error ? err.message : '此場次目前無法預約，請重新整理或選擇其他日期。';
      setV2Error(msg || '此場次目前無法預約，請重新整理或選擇其他日期。');
    } finally {
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
          <p style={{ color: 'var(--tp-muted)' }}>
            請返回行程頁重新選擇方案後再試。
          </p>
        )}
      </main>
    );
  }

  const canSubmit = Boolean(selectedSlotStartAt && contactName && contactPhone && contactEmail && agreed && !loading);
  const canGoStep3 = Boolean(contactName && contactPhone && contactEmail && agreed && !loading);
  const canConfirmPayment = Boolean(createdBookingId && canSubmit);
  const recoveryHref = activity ? `/activities/${encodeURIComponent(activity.region)}/${encodeURIComponent(activity.slug)}#section-plan` : '/activities';
  const selectedSlot = slots.find((slot) => slot.startAt === selectedSlotStartAt) || slots[0] || null;
  const selectedCapacityLeft = selectedSlot?.capacityLeft ?? 0;
  // 三種預約模式：request plan 走「先審核後付款」——step 2 改為送出申請、step 3 顯示審核中。
  const planBookingType = selectedPlanMeta?.bookingType ?? selectedSlot?.bookingType ?? 'instant';
  const isRequestBooking = planBookingType === 'request';
  const isOverCapacity = slots.length > 0 && guests > selectedCapacityLeft;
  const step1CtaState = getBookingV2Step1CtaState({
    slotsLoading,
    slotsCount: slots.length,
    guests,
    selectedCapacityLeft,
  });
  const unitPrice = effectivePlanMeta?.basePrice ?? activity.priceTwd;
  const total = effectivePlanMeta?.priceType === 'per_group' ? unitPrice : unitPrice * guests;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: activity.title, item: `${baseUrl}/activities/${activity.region}/${activity.slug}` },
      { '@type': 'ListItem', position: 3, name: '預約' },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <h1 className="sr-only">{activity.title} — 預約</h1>
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
          {!isLineContinuation && activity && (
            <div style={{ marginTop: 10 }}>
              <Link className="tp-link" data-testid="booking-v2-recovery-link" href={recoveryHref}>
                回到行程頁重新選擇方案
              </Link>
            </div>
          )}
          {isLineContinuation && (
            <p data-testid="booking-v2-line-fallback-state" style={{ color: 'var(--tp-muted)', margin: '10px 0 0' }}>
              LINE LIFF 延續流程維持 shared checkout/payment-init；不切換舊版流程。請重試，若持續失敗請回報 Correlation ID：
              {correlationId || 'line-correlation-missing'}
            </p>
          )}
          {isLineContinuation && (
            <div style={{ marginTop: 10 }}>
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
            </div>
          )}
        </div>
      )}

      <div className="tp-booking-layout" style={{ display: 'grid', gap: 24 }}>
        <div>
          <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {activity.coverImageUrl && (
                <Image src={activity.coverImageUrl} alt={activity.title} style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} width={120} height={80} />
              )}
              <div>
                <h3 style={{ margin: 0 }}>{activity.title}</h3>
                <p style={{ margin: '4px 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                  📍 {activity.region} · 🕐 {activity.durationDisplay}
                  {activity.guide?.displayName ? ` · 導遊：${activity.guide.displayName}` : ''}
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--tp-primary)', fontWeight: 600 }}>
                  📋 方案：{selectedPlanDisplayName || (urlPlanId ? `方案代碼 ${urlPlanId.slice(0, 8)}` : '已選擇')}
                </p>
              </div>
            </div>
          </div>

          {step === 1 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>行程確認</h3>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 6 }}>📅 選擇日期與名額</span>
                <select
                  data-testid="booking-v2-date-capacity-picker"
                  name="date-capacity"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--tp-border)',
                    borderRadius: 10,
                    marginTop: 4,
                    background: '#fff',
                    color: 'var(--tp-text)',
                  }}
                >
                  {dateAvailabilityOptions.map((entry) => {
                    const label =
                      entry.state === 'available'
                        ? `${entry.date}（剩餘 ${entry.capacityLeft}）`
                        : `${entry.date}（不可預約）`;
                    return (
                      <option key={entry.date} value={entry.date} disabled={entry.state !== 'available'}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>👥 參加人數</span>
                <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 4, border: '1px solid var(--tp-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    type="button"
                    aria-label="減少人數"
                    disabled={guests <= effectiveMinParticipants}
                    onClick={() => setGuests((g) => Math.max(effectiveMinParticipants, g - 1))}
                    style={{
                      padding: '8px 16px', border: 'none', borderRight: '1px solid var(--tp-border)',
                      background: '#f9fafb', color: '#374151',
                      fontSize: 18, fontWeight: 700, minWidth: 44,
                      cursor: guests <= effectiveMinParticipants ? 'not-allowed' : 'pointer',
                      opacity: guests <= effectiveMinParticipants ? 0.4 : 1,
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    name="participants"
                    inputMode="numeric"
                    min={effectiveMinParticipants}
                    max={baseMaxParticipants ?? undefined}
                    value={guests}
                    onChange={(e) => {
                      const n = Number(e.target.value) || effectiveMinParticipants;
                      const capped = baseMaxParticipants != null ? Math.min(n, baseMaxParticipants) : n;
                      setGuests(Math.max(effectiveMinParticipants, capped));
                    }}
                    style={{ flex: 1, minWidth: 0, padding: '10px 12px', border: 'none', textAlign: 'center', fontSize: 14, outline: 'none' }}
                  />
                  <button
                    type="button"
                    aria-label="增加人數"
                    disabled={baseMaxParticipants != null && guests >= baseMaxParticipants}
                    onClick={() => setGuests((g) => (baseMaxParticipants != null ? Math.min(baseMaxParticipants, g + 1) : g + 1))}
                    style={{
                      padding: '8px 16px', border: 'none', borderLeft: '1px solid var(--tp-border)',
                      background: '#f9fafb', color: '#374151',
                      fontSize: 18, fontWeight: 700, minWidth: 44,
                      cursor: baseMaxParticipants != null && guests >= baseMaxParticipants ? 'not-allowed' : 'pointer',
                      opacity: baseMaxParticipants != null && guests >= baseMaxParticipants ? 0.4 : 1,
                    }}
                  >
                    +
                  </button>
                </div>
              </label>
              {!allowOnePersonAddOn && <p style={{ margin: '0 0 12px', color: 'var(--tp-muted)', fontSize: 13 }}>此行程最少 {baseMinParticipants} 人成團{baseMaxParticipants ? `，最多 ${baseMaxParticipants} 人` : ''}</p>}

              <p style={{ margin: '0 0 6px' }}>選擇可預約場次</p>
              <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', marginBottom: 12, padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, fontSize: 14 }}>
                {slotsLoading && '載入中…'}
                {!slotsLoading && slots.length === 0 && `${selectedDate}（此日期目前無可預約名額）`}
                {!slotsLoading && slots.length > 0 && (
                  <>
                    {`${selectedDate}（可預約，剩餘 ${selectedCapacityLeft}）`}
                    {/* AC4: show range label parity with guide preview using formatSlotRangeLabel */}
                    {selectedSlot?.endAt && (
                      <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--tp-primary)' }}>
                        {formatSlotRangeLabel(selectedSlot.startAt, selectedSlot.endAt)}
                      </span>
                    )}
                  </>
                )}
              </div>
              {/* Issue #1306: when the API returns multiple available slots
                  for the picked date, render a picker so travellers can
                  choose which start time. Single-slot days keep the
                  existing summary line above and omit the picker entirely
                  (no behaviour change for those). Times use Asia/Taipei
                  per the issue's parity requirement with guide preview. */}
              {!slotsLoading && slots.length > 1 && (
                <div
                  role="radiogroup"
                  aria-label="選擇可預約時段"
                  data-testid="traveler-slot-picker"
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {slots.map((slot) => {
                    const isSelected = slot.startAt === selectedSlotStartAt;
                    const start = new Date(slot.startAt).toLocaleTimeString('zh-TW', {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                    });
                    const end = new Date(slot.endAt).toLocaleTimeString('zh-TW', {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                    });
                    return (
                      <button
                        key={slot.startAt}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedSlotStartAt(slot.startAt)}
                        data-testid="traveler-slot-option"
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: `1px solid ${isSelected ? 'var(--tp-primary)' : 'var(--tp-border)'}`,
                          background: isSelected ? 'var(--tp-primary-soft, #eef2ff)' : '#fff',
                          color: isSelected ? 'var(--tp-primary)' : 'var(--tp-text)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: 14,
                          cursor: 'pointer',
                          lineHeight: 1.3,
                        }}
                      >
                        {start}–{end}
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--tp-muted)', fontWeight: 400 }}>
                          剩餘 {slot.capacityLeft}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!slotsLoading && isOverCapacity && (
                <p style={{ margin: '0 0 12px', color: 'var(--tp-danger)', fontSize: 13 }}>
                  參加人數已超過此日期剩餘名額，請降低人數或選擇其他日期。
                </p>
              )}
              {!slotsLoading && slots.length === 0 && availabilityReason && (
                <p style={{ margin: '0 0 12px', color: 'var(--tp-muted)', fontSize: 13 }}>
                  目前狀態：{availabilityReason}
                </p>
              )}

              <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }}>
                <h4>費用明細</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>單價（{effectivePlanMeta?.priceType === 'per_group' ? '每組' : '每人'}）</span>
                  <span>NT${unitPrice.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{effectivePlanMeta?.priceType === 'per_group' ? '每組價格' : `NT$${unitPrice.toLocaleString()} × ${guests} 人`}</span>
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

              <button
                className="tp-btn tp-btn-primary"
                onClick={() => {
                  track({
                    event_name: 'begin_checkout',
                    properties: {
                      item_id: activity.id,
                      item_name: activity.title,
                      schedule_id: selectedSlotStartAt,
                      price: unitPrice,
                      rollout_variant: 'v2',
                    },
                    page_path: `/booking/${activitySlug}`,
                  });
                  setStep(2);
                }}
                disabled={step1CtaState.disabled}
                aria-describedby={step1CtaState.disabled ? step1CtaState.reasonId ?? undefined : undefined}
              >
                下一步：填寫資訊 →
              </button>
              {step1CtaState.reason && (
                <p
                  id={step1CtaState.reasonId ?? undefined}
                  style={{
                    margin: '10px 0 0',
                    color: step1CtaState.tone === 'muted' ? 'var(--tp-muted)' : '#b42318',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                  role={step1CtaState.role ?? undefined}
                >
                  {step1CtaState.reason}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3>聯絡人資訊</h3>
              <label style={{ display: 'block', marginBottom: 10 }}>
                姓名 *
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="請輸入真實姓名"
                  required aria-required="true" name="contactName" autoComplete="name"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電話 *
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0912-345-678"
                  required aria-required="true" name="contactPhone" autoComplete="tel"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                電子信箱 *
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="you@example.com"
                  required aria-required="true" name="contactEmail" autoComplete="email"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                給導遊的備註（選填）
                <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：有食物過敏、行動不便、希望多停留某景點等" rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" name="agreement" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                我已閱讀並同意<Link href="/legal/terms" className="tp-link">服務條款</Link>與<Link href="/legal/refund" className="tp-link">退款政策</Link>
              </label>
              {isRequestBooking && (
                <p data-testid="booking-request-hint" style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
                  此行程採「申請預約」：送出申請後由導遊審核，通過後將通知你前往付款，此步驟尚不會收費。
                </p>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)} disabled={loading}>← 上一步</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleCreateDraftBookingAndGoPayment}
                  disabled={loading || !canGoStep3}
                >
                  {loading
                    ? (isRequestBooking ? '送出申請中…' : '建立訂單中…')
                    : (isRequestBooking ? '送出預約申請 →' : '建立訂單並前往付款 →')}
                </button>
              </div>
            </div>
          )}

          {step === 3 && submittedAsRequest && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>申請已送出（待導遊審核）</h3>
              <div data-testid="booking-request-submitted" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>✅ 已送出預約申請</p>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--tp-muted)' }}>
                  導遊審核通過後，我們會以 Email 通知你前往付款；此步驟尚未收費。可至「我的訂單」查看狀態。
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--tp-muted)' }}>申請編號：{createdBookingId}</p>
                <Link className="tp-link" href="/me/orders" style={{ display: 'inline-block', marginTop: 10 }}>前往我的訂單 →</Link>
              </div>
            </div>
          )}

          {step === 3 && !submittedAsRequest && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>付款確認（建立預約後）</h3>

              {transferSubmitted ? (
                <div data-testid="booking-transfer-submitted" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#15803d' }}>✅ 已送出匯款預約</p>
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--tp-muted)' }}>
                    請依匯款資訊完成轉帳，我們將人工核對入帳後為您確認預約。可至「我的訂單」查看狀態。
                  </p>
                  <Link className="tp-link" href="/me/orders" style={{ display: 'inline-block', marginTop: 10 }}>前往我的訂單 →</Link>
                </div>
              ) : (
                <>
                  {/* 付款方式選擇 */}
                  <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${payMethod === 'ecpay' ? 'var(--tp-primary)' : 'var(--tp-border)'}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                      <input type="radio" name="payMethod" checked={payMethod === 'ecpay'} onChange={() => setPayMethod('ecpay')} />
                      💳 信用卡（Visa / Mastercard / JCB）
                    </label>
                    {transferEnabled && (
                      <label data-testid="booking-pay-transfer" style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${payMethod === 'transfer' ? 'var(--tp-primary)' : 'var(--tp-border)'}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                        <input type="radio" name="payMethod" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} />
                        🏦 自行匯款（人工核帳）
                      </label>
                    )}
                  </div>

                  {payMethod === 'ecpay' && (
                    <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 8px' }}>
                      確認後將前往 ECPay 安全付款頁，實際可用付款方式以付款頁顯示為準。🔒 付款由 ECPay 加密處理，資料不經本站。
                    </p>
                  )}

                  {payMethod === 'transfer' && (
                    <div data-testid="booking-transfer-info" style={{ border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14, marginBottom: 12, background: 'var(--tp-bg-soft, #f9fafb)' }}>
                      {transferInfo == null && <p style={{ color: 'var(--tp-muted)', margin: 0 }}>載入匯款資訊中…</p>}
                      {transferInfo && !transferInfo.configured && (
                        <p style={{ color: 'var(--tp-danger)', margin: 0 }}>此導遊尚未提供匯款資訊，請改用信用卡付款。</p>
                      )}
                      {transferInfo?.configured && (
                        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                          <p style={{ margin: 0 }}>銀行：{transferInfo.bankName}</p>
                          <p style={{ margin: 0 }}>戶名：{transferInfo.accountName}</p>
                          <p style={{ margin: 0 }}>帳號：{transferInfo.accountNumber}</p>
                          {transferInfo.transferNote && <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)' }}>{transferInfo.transferNote}</p>}
                          <p style={{ margin: '8px 0 0', color: 'var(--tp-muted)', fontSize: 13 }}>請完成匯款後按下方按鈕送出，我們將人工核對入帳。</p>
                        </div>
                      )}
                    </div>
                  )}

                  <p style={{ fontSize: 18, fontWeight: 700 }}>總計：NT${total.toLocaleString()}</p>
                  <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>訂單編號：{createdBookingId || '尚未建立'}</p>
                  {!createdBookingId && (
                    <p style={{ fontSize: 13, color: 'var(--tp-danger)', marginTop: 4 }}>
                      請先回上一步建立訂單後，再進行付款確認。
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)} disabled={loading}>← 上一步</button>
                    <button
                      className="tp-btn tp-btn-primary"
                      style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                      onClick={handleV2Checkout}
                      disabled={loading || !canConfirmPayment || (payMethod === 'transfer' && transferInfo != null && !transferInfo.configured)}
                    >
                      {loading ? '處理中…' : payMethod === 'transfer' ? '我已匯款，送出訂單' : `確認付款 NT$${total.toLocaleString()}`}
                    </button>
                  </div>
                </>
              )}
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
          <p style={{ margin: '6px 0' }}>可預約名額：{selectedCapacityLeft}</p>
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
