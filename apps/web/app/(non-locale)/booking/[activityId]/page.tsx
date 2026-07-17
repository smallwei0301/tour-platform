'use client';
import Image from 'next/image';

import Link from 'next/link';
import { useEffect, useMemo, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { fetchActivityByIdOrSlug } from '../../../../src/lib/client-api';

// Client component：用字面量 process.env.NEXT_PUBLIC_* 讓 Next build 內嵌（透過 env 參數
// 間接讀取在 client bundle 不會被替換 → 永遠 undefined）。#1475 匯款付款選項旗標。
const TRANSFER_PAYMENT_ENABLED =
  process.env.NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED === '1' ||
  process.env.NEXT_PUBLIC_TRANSFER_PAYMENT_ENABLED === 'true';
import { inferPlanIdForBookingUrl } from '../../../../src/lib/booking-entry.mjs';
import { getBookingV2Step1CtaState } from '../../../../src/lib/booking-v2-step1-cta-state.mjs';
import { derivePlanMetaFromActivityPlans } from '../../../../src/lib/booking-v2-plan-meta.mjs';
import { track } from '../../../../src/lib/track';
import { formatSlotRangeLabel } from '../../../../src/lib/slot-generator';
import { CheckoutExtrasSection, type CheckoutExtrasValue } from '../../../../src/components/activity/CheckoutExtrasSection';
import { useClientLocale } from '../../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../../src/i18n/client-nav-messages';

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

const BOOKING_V2_PLAN_RECOVERY_REASONS = new Set(['PLAN_NOT_FOUND', 'AMBIGUOUS_PLAN', 'PLAN_INACTIVE', 'STALE_PLAN', 'UNRESOLVABLE_PLAN']);
const BOOKING_V2_PLAN_RECOVERY_MESSAGES = [
  'Activity plan not found',
  'Activity plan is not active',
  'Plan not found',
  'Selected plan not found',
  'Stale plan reference',
];

function getBookingV2RecoveryMessage(
  response: V2AvailableSlotsResponse,
  messages: { genericError: string; planRecovery: string },
) {
  const explicitZh = [response?.data?.messageZh, response?.error?.messageZh]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean);
  if (explicitZh) return explicitZh;

  const reason = typeof response?.data?.reason === 'string' ? response.data.reason.trim().toUpperCase() : '';
  if (reason && BOOKING_V2_PLAN_RECOVERY_REASONS.has(reason)) {
    return messages.planRecovery;
  }

  const errorMessage = typeof response?.error?.message === 'string' ? response.error.message.trim() : '';
  if (
    errorMessage &&
    BOOKING_V2_PLAN_RECOVERY_MESSAGES.some((candidate) => errorMessage.toLowerCase() === candidate.toLowerCase())
  ) {
    return messages.planRecovery;
  }

  return errorMessage || messages.genericError;
}

function BookingInnerV2FlagShell() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'bookingFlow');
  const dateLocale = locale === 'zh-Hant' ? 'zh-TW' : 'en-US';

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
  // #1591 加購＋#1594 點數折抵的顯示用狀態（互動邏輯在 CheckoutExtrasSection；server 重算為準）。
  const [extras, setExtras] = useState<CheckoutExtrasValue>({
    addonSelections: [], redeemPoints: 0, addonTotal: 0, effectiveDiscount: 0,
  });
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
        setLoadError(err.message || m.loadActivityFailed);
      });
    return () => {
      mounted = false;
    };
  }, [activitySlug, router, searchParams, m.loadActivityFailed]);

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
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate) return;

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
  }, [activity?.id, selectedDate, timezone, canRunV2PlanFlow, activeScheduleId, v2PlanKey]);

  useEffect(() => {
    async function fetchSlots() {
      if (!activity?.id || !canRunV2PlanFlow || !selectedDate) return;
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
          setV2Error(getBookingV2RecoveryMessage(json, { genericError: m.v2GenericError, planRecovery: m.v2PlanRecovery }));
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
        setV2Error(m.v2GenericError);
      } finally {
        setSlotsLoading(false);
      }
    }
    fetchSlots();
  }, [activity?.id, canRunV2PlanFlow, v2PlanKey, selectedDate, timezone, selectedSlotStartAt, effectiveMinParticipants, activeScheduleId, m.v2GenericError, m.v2PlanRecovery]);

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
          // #1591 加購（選填）：server 一律以 DB 快照重算金額，不信任前端數字。
          addonSelections: extras.addonSelections.length > 0 ? extras.addonSelections : undefined,
          // #1594 點數折抵（選填）：server 夾在 min(餘額, 訂單×30%) 為準。
          redeemPoints: extras.redeemPoints > 0 ? extras.redeemPoints : undefined,
        }),
      });
      const draftJson = await draftRes.json();
      if (!draftRes.ok || !draftJson?.success || !draftJson?.data?.bookingId) {
        throw new Error(
          draftJson?.error?.messageZh || draftJson?.error?.message || m.errSlotUnavailable
        );
      }
      setCreatedBookingId(draftJson.data.bookingId);
      setSubmittedAsRequest(Boolean(draftJson.data.requiresApproval));
      setStep(3);
    } catch (err) {
      const msg = err instanceof Error ? err.message : m.errSlotUnavailable;
      setV2Error(msg || m.errSlotUnavailable);
    } finally {
      setLoading(false);
    }
  }

  async function handleV2Checkout() {
    if (!createdBookingId || !agreed) {
      setV2Error(m.errOrderNotComplete);
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
          checkoutJson?.error?.messageZh || checkoutJson?.error?.message || m.errSlotUnavailable
        );
      }

      // 匯款（#1475）：不導向 ECPay，改顯示「已送出、等待人工查帳」確認。
      if (payMethod === 'transfer') {
        setTransferSubmitted(true);
        return;
      }

      const paymentFormHtml = checkoutJson?.data?.paymentFormHtml;
      if (!paymentFormHtml) throw new Error(m.errPaymentFormMissing);

      const container = document.createElement('div');
      container.style.display = 'none';
      container.innerHTML = paymentFormHtml;
      document.body.appendChild(container);
      const form = container.querySelector('form') as HTMLFormElement | null;
      if (!form) throw new Error(m.errPaymentFormInvalid);
      form.submit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : m.errSlotUnavailable;
      setV2Error(msg || m.errSlotUnavailable);
    } finally {
      setLoading(false);
    }
  }

  if (!activity) {
    return (
      <main className="tp-container" style={{ padding: '40px 0', minHeight: 'clamp(1250px, 2216px - 68vw, 1950px)' }}>
        <p style={{ color: 'var(--tp-muted)' }}>{loadError || m.loadingActivity}</p>
      </main>
    );
  }

  if (!canRunV2PlanFlow) {
    return (
      <main className="tp-container" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--tp-danger)' }}>{m.missingPlanParam}</p>
        {isLineContinuation ? (
          <p data-testid="booking-v2-line-fallback-state" style={{ color: 'var(--tp-muted)' }}>
            {m.lineFallbackMissingPlan}
          </p>
        ) : (
          <p style={{ color: 'var(--tp-muted)' }}>
            {m.missingPlanRetry}
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
  // #1591 含加購的小計；#1594 再扣點數折抵＝應付總額（顯示用；server 重算為準）。
  const payTotal = Math.max(0, total + extras.addonTotal - extras.effectiveDiscount);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: m.breadcrumbHome, item: baseUrl },
      { '@type': 'ListItem', position: 2, name: activity.title, item: `${baseUrl}/activities/${activity.region}/${activity.slug}` },
      { '@type': 'ListItem', position: 3, name: m.breadcrumbBooking },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <h1 className="sr-only">{activity.title} — {m.breadcrumbTitleSuffix}</h1>
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/activities">{m.breadcrumbAllActivities}</Link> &gt; {activity.title} &gt; {m.breadcrumbBooking}
      </div>

      <div className="tp-booking-progress" style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '20px 0 30px', maxWidth: 500 }}>
        {[m.stepTripConfirm, m.stepTravelerInfo, m.stepPayment].map((label, i) => (
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
                {m.v2RecoveryLink}
              </Link>
            </div>
          )}
          {isLineContinuation && (
            <p data-testid="booking-v2-line-fallback-state" style={{ color: 'var(--tp-muted)', margin: '10px 0 0' }}>
              {m.lineRetryFallback}
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
                {m.lineRetryButton}
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
                  {activity.guide?.displayName ? ` · ${m.guidePrefix}${activity.guide.displayName}` : ''}
                </p>
                <p style={{ margin: '4px 0', fontSize: 13, color: 'var(--tp-primary)', fontWeight: 600 }}>
                  {m.planPrefix}{selectedPlanDisplayName || (urlPlanId ? m.planCodePrefix.replace('{code}', urlPlanId.slice(0, 8)) : m.planResolvedFallback)}
                </p>
              </div>
            </div>
          </div>

          {step === 1 && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>{m.tripConfirmHeading}</h3>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="booking-date-capacity-picker" style={{ fontWeight: 700, fontSize: 14, display: 'block', marginBottom: 6 }}>{m.selectDateCapacityLabel}</label>
                <select
                  data-testid="booking-v2-date-capacity-picker"
                  id="booking-date-capacity-picker" name="date-capacity"
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
                        ? m.dateAvailableOption.replace('{date}', entry.date).replace('{n}', String(entry.capacityLeft))
                        : m.dateUnavailableOption.replace('{date}', entry.date);
                    return (
                      <option key={entry.date} value={entry.date} disabled={entry.state !== 'available'}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{m.participantsLabel}</span>
                <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 4, border: '1px solid var(--tp-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    type="button"
                    aria-label={m.decreaseParticipants}
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
                    aria-label={m.increaseParticipants}
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
              {!allowOnePersonAddOn && <p style={{ margin: '0 0 12px', color: 'var(--tp-muted)', fontSize: 13 }}>{m.minParticipantsNote.replace('{min}', String(baseMinParticipants))}{baseMaxParticipants ? m.maxParticipantsSuffix.replace('{max}', String(baseMaxParticipants)) : ''}</p>}

              <p style={{ margin: '0 0 6px' }}>{m.selectSlotLabel}</p>
              <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', marginBottom: 12, padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, fontSize: 14 }}>
                {slotsLoading && m.loading}
                {!slotsLoading && slots.length === 0 && m.slotNoCapacity.replace('{date}', selectedDate)}
                {!slotsLoading && slots.length > 0 && (
                  <>
                    {m.slotAvailable.replace('{date}', selectedDate).replace('{n}', String(selectedCapacityLeft))}
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
                  aria-label={m.selectSlotAriaLabel}
                  data-testid="traveler-slot-picker"
                  style={{
                    display: 'flex', flexWrap: 'wrap', gap: 8,
                    marginBottom: 12,
                  }}
                >
                  {slots.map((slot) => {
                    const isSelected = slot.startAt === selectedSlotStartAt;
                    const start = new Date(slot.startAt).toLocaleTimeString(dateLocale, {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                    });
                    const end = new Date(slot.endAt).toLocaleTimeString(dateLocale, {
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
                          {m.slotRemaining.replace('{n}', String(slot.capacityLeft))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {!slotsLoading && isOverCapacity && (
                <p style={{ margin: '0 0 12px', color: 'var(--tp-danger)', fontSize: 13 }}>
                  {m.overCapacity}
                </p>
              )}
              {!slotsLoading && slots.length === 0 && availabilityReason && (
                <p style={{ margin: '0 0 12px', color: 'var(--tp-muted)', fontSize: 13 }}>
                  {m.currentStatusPrefix}{availabilityReason}
                </p>
              )}

              {/* #1591 加購＋#1594 點數折抵（互動狀態在 CheckoutExtrasSection） */}
              <CheckoutExtrasSection
                activityId={resolvedActivityId}
                peopleCount={guests}
                baseTotal={total}
                onChange={setExtras}
              />

              <div style={{ borderTop: '1px solid var(--tp-border)', paddingTop: 14, marginTop: 14 }}>
                <h4>{m.feeDetailHeading}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{m.unitPriceLabel.replace('{unit}', effectivePlanMeta?.priceType === 'per_group' ? m.unitPerGroup : m.unitPerPerson)}</span>
                  <span>NT${unitPrice.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>{effectivePlanMeta?.priceType === 'per_group' ? m.perGroupPrice : m.perPersonPrice.replace('{price}', unitPrice.toLocaleString()).replace('{n}', String(guests))}</span>
                  <span>NT${total.toLocaleString()}</span>
                </div>
                {extras.addonTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }} data-testid="fee-addons">
                    <span>加購項目</span>
                    <span>NT${extras.addonTotal.toLocaleString()}</span>
                  </div>
                )}
                {extras.effectiveDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--tp-gold-strong)' }} data-testid="fee-points-discount">
                    <span>點數折抵</span>
                    <span>−NT${extras.effectiveDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--tp-muted)' }}>
                  <span>{m.platformFee}</span>
                  <span>NT$0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--tp-border)', paddingTop: 8, marginTop: 8 }}>
                  <span>{m.total}</span>
                  <span>NT${payTotal.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <h4>{m.cancelPolicyHeading}</h4>
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
                {m.nextStep}
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
              <h3>{m.contactHeading}</h3>
              <label style={{ display: 'block', marginBottom: 10 }}>
                {m.contactNameLabel}
                <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={m.contactNamePlaceholder}
                  required aria-required="true" name="contactName" autoComplete="name"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                {m.contactPhoneLabel}
                <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={m.contactPhonePlaceholder}
                  required aria-required="true" name="contactPhone" autoComplete="tel"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 10 }}>
                {m.contactEmailLabel}
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={m.contactEmailPlaceholder}
                  required aria-required="true" name="contactEmail" autoComplete="email"
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>
                {m.noteLabel}
                <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={m.notePlaceholder} rows={3}
                  style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 16 }}>
                <input type="checkbox" name="agreement" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                {m.agreePrefix}<Link href="/legal/terms" className="tp-link">{m.agreeTerms}</Link>{m.agreeAnd}<Link href="/legal/refund" className="tp-link">{m.agreeRefund}</Link>
              </label>
              {isRequestBooking && (
                <p data-testid="booking-request-hint" style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
                  {m.requestBookingHint}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="tp-btn tp-btn-ghost" onClick={() => setStep(1)} disabled={loading}>{m.prevStep}</button>
                <button
                  className="tp-btn tp-btn-primary"
                  style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                  onClick={handleCreateDraftBookingAndGoPayment}
                  disabled={loading || !canGoStep3}
                >
                  {loading
                    ? (isRequestBooking ? m.submittingRequest : m.creatingOrder)
                    : (isRequestBooking ? m.submitRequest : m.createOrderAndPay)}
                </button>
              </div>
            </div>
          )}

          {step === 3 && submittedAsRequest && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>{m.requestSubmittedHeading}</h3>
              <div data-testid="booking-request-submitted" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 16 }}>
                <p style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>{m.requestSubmittedBadge}</p>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--tp-muted)' }}>
                  {m.requestSubmittedBody}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--tp-muted)' }}>{m.requestNumberPrefix}{createdBookingId}</p>
                <Link className="tp-link" href="/me/orders" style={{ display: 'inline-block', marginTop: 10 }}>{m.goToMyOrders}</Link>
              </div>
            </div>
          )}

          {step === 3 && !submittedAsRequest && (
            <div style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>{m.paymentConfirmHeading}</h3>

              {transferSubmitted ? (
                <div data-testid="booking-transfer-submitted" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#15803d' }}>{m.transferSubmittedBadge}</p>
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--tp-muted)' }}>
                    {m.transferSubmittedBody}
                  </p>
                  <Link className="tp-link" href="/me/orders" style={{ display: 'inline-block', marginTop: 10 }}>{m.goToMyOrders}</Link>
                </div>
              ) : (
                <>
                  {/* 付款方式選擇 */}
                  <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${payMethod === 'ecpay' ? 'var(--tp-primary)' : 'var(--tp-border)'}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                      <input type="radio" name="payMethod" checked={payMethod === 'ecpay'} onChange={() => setPayMethod('ecpay')} />
                      {m.creditCard}
                    </label>
                    {transferEnabled && (
                      <label data-testid="booking-pay-transfer" style={{ display: 'flex', alignItems: 'center', gap: 10, border: `2px solid ${payMethod === 'transfer' ? 'var(--tp-primary)' : 'var(--tp-border)'}`, borderRadius: 10, padding: 12, cursor: 'pointer' }}>
                        <input type="radio" name="payMethod" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} />
                        {m.transferOption}
                      </label>
                    )}
                  </div>

                  {payMethod === 'ecpay' && (
                    <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 8px' }}>
                      {m.ecpayTransferNotice}
                    </p>
                  )}

                  {payMethod === 'transfer' && (
                    <div data-testid="booking-transfer-info" style={{ border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14, marginBottom: 12, background: 'var(--tp-bg-soft, #f9fafb)' }}>
                      {transferInfo == null && <p style={{ color: 'var(--tp-muted)', margin: 0 }}>{m.loadingTransferInfo}</p>}
                      {transferInfo && !transferInfo.configured && (
                        <p style={{ color: 'var(--tp-danger)', margin: 0 }}>{m.transferNotConfigured}</p>
                      )}
                      {transferInfo?.configured && (
                        <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                          <p style={{ margin: 0 }}>{m.transferBank.replace('{value}', String(transferInfo.bankName ?? ''))}</p>
                          <p style={{ margin: 0 }}>{m.transferAccountName.replace('{value}', String(transferInfo.accountName ?? ''))}</p>
                          <p style={{ margin: 0 }}>{m.transferAccountNumber.replace('{value}', String(transferInfo.accountNumber ?? ''))}</p>
                          {transferInfo.transferNote && <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)' }}>{transferInfo.transferNote}</p>}
                          <p style={{ margin: '8px 0 0', color: 'var(--tp-muted)', fontSize: 13 }}>{m.transferCompleteNote}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <p style={{ fontSize: 18, fontWeight: 700 }}>{m.totalPrefix.replace('{amount}', total.toLocaleString())}</p>
                  <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>{m.orderNumberPrefix}{createdBookingId || m.orderNotCreatedYet}</p>
                  {!createdBookingId && (
                    <p style={{ fontSize: 13, color: 'var(--tp-danger)', marginTop: 4 }}>
                      {m.errBackToCreateOrder}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <button className="tp-btn tp-btn-ghost" onClick={() => setStep(2)} disabled={loading}>{m.prevStep}</button>
                    <button
                      className="tp-btn tp-btn-primary"
                      style={{ flex: 1, padding: '14px 0', fontSize: 16, opacity: loading ? 0.7 : 1 }}
                      onClick={handleV2Checkout}
                      disabled={loading || !canConfirmPayment || (payMethod === 'transfer' && transferInfo != null && !transferInfo.configured)}
                    >
                      {loading ? m.processing : payMethod === 'transfer' ? m.transferSubmitOrder : m.confirmPayment.replace('{amount}', total.toLocaleString())}
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
          <h3 style={{ marginTop: 0 }}>{m.summaryHeading}</h3>
          <p style={{ margin: '6px 0' }}>{m.summaryDatePrefix}{selectedDate}</p>
          <p style={{ margin: '6px 0' }}>{m.summaryPeoplePrefix}{m.summaryPeopleUnit.replace('{n}', String(guests))}</p>
          <p style={{ margin: '6px 0' }}>{m.summaryCapacityPrefix}{selectedCapacityLeft}</p>
          <hr style={{ border: 0, borderTop: '1px solid var(--tp-border)', margin: '12px 0' }} />
          <p style={{ margin: 0, fontWeight: 700 }}>{m.summaryTotal.replace('{amount}', total.toLocaleString())}</p>
        </aside>
      </div>
    </main>
  );
}

// ── 外層包 Suspense（useSearchParams 需要）───────────────────
// Legacy 已全面退役（#1406 階段二移除入口、#1407 階段三刪碼＋flag 退場）：
// 預約殼層一律走 Booking V2，無 flag、無 legacy 分支。
export default function BookingPage() {
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'bookingFlow');

  return (
    <Suspense fallback={
      <main className="tp-container" style={{ padding: '60px 0', textAlign: 'center', minHeight: 'clamp(1250px, 2216px - 68vw, 1950px)' }}>
        <p style={{ color: 'var(--tp-muted)' }}>{m.loading}</p>
      </main>
    }>
      <BookingInnerV2FlagShell />
    </Suspense>
  );
}
