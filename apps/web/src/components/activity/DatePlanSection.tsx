'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DatePicker } from './DatePicker';
import { PlanDetailModal } from './PlanDetailModal';
import { resolvePlanBookingHref } from '../../lib/booking-entry.mjs';

interface Schedule {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
  planId?: string | null;
  plan_id?: string | null;
  minParticipants?: number;
  min_participants?: number;
}

interface PlanConfig {
  id: string;
  label: string;
  duration: string;
  priceMultiplier: number;
  price?: number;
  highlights: string[];
  detailsLinkText?: string;
  bookingBtnText?: string;
  // 方案詳情欄位
  language?: string;
  earliestDeparture?: string;
  confirmByDays?: number;
  freeCancelDays?: number;
  planInclusions?: string[];
  planExclusions?: string[];
  planItinerary?: Array<{ text: string; imageUrl?: string }>;
  meetingPointName?: string;
  meetingAddress?: string;
  experiencePointName?: string;
  experienceAddress?: string;
  planNotices?: string[];
  planRefundRules?: string[];
}

interface Activity {
  slug: string;
  price?: number;
  priceTwd?: number;
  refundRules: string[];
  notices?: string[];
  plans?: PlanConfig[] | null;
}

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 'half-day',
    label: 'A. 半日行程',
    duration: '約 4 小時',
    priceMultiplier: 1,
    highlights: ['最早出發前 1 天可預訂', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
  {
    id: 'full-day',
    label: 'B. 全日行程',
    duration: '約 8 小時',
    priceMultiplier: 1.6,
    highlights: ['午餐含餐（在地餐廳）', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
];

// ── 工具函數：取得某日期 + 某方案的場次資訊 ──
function getPlanScheduleForDate(
  schedules: Schedule[],
  date: string | null,
  planId: string,
): { schedule: Schedule | null; remaining: number; isFull: boolean; isOpen: boolean } {
  if (!date) return { schedule: null, remaining: 0, isFull: false, isOpen: false };
  for (const s of schedules) {
    const startAt = s.startAt || s.start_at || '';
    const sPlanId = s.planId ?? s.plan_id ?? null;
    const dateKey = new Date(startAt).toISOString().slice(0, 10);
    // 匹配日期 + 方案（plan_id=null 表示適用所有方案）
    if (dateKey === date && (sPlanId === planId || sPlanId === null)) {
      const capacity = Number(s.capacity || 0);
      const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
      const remaining = capacity - bookedCount;
      const status = s.status || (remaining <= 0 ? 'full' : 'open');
      return {
        schedule: s,
        remaining: Math.max(0, remaining),
        isFull: status === 'full' || remaining <= 0,
        isOpen: status === 'open' && remaining > 0,
      };
    }
  }
  // 該日期 + 方案沒有場次 → 未開放
  return { schedule: null, remaining: 0, isFull: false, isOpen: false };
}

// 簡單 SVG 圖示（純黑線條，無填色）
const ICONS = {
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  cancel: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    </svg>
  ),
  guide: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  ticket: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
    </svg>
  ),
  meal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  ),
};

function getIconForHighlight(text: string) {
  if (text.includes('取消')) return ICONS.cancel;
  if (text.includes('導遊')) return ICONS.guide;
  if (text.includes('憑證')) return ICONS.ticket;
  if (text.includes('餐')) return ICONS.meal;
  if (text.includes('預訂') || text.includes('日')) return ICONS.clock;
  return ICONS.check;
}

interface DatePlanSectionProps {
  activity: Activity;
  schedules: Schedule[];
  useBookingV2: boolean;
}

export function DatePlanSection({ activity, schedules, useBookingV2 }: DatePlanSectionProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalPlan, setModalPlan] = useState<PlanConfig | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [liveSchedules, setLiveSchedules] = useState<Schedule[] | null>(null);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

  async function ensureLiveAvailability() {
    if (availabilityLoaded) return;
    setAvailabilityLoaded(true);
    try {
      const res = await fetch(`/api/activities/${encodeURIComponent(activity.slug)}/availability`);
      const json = await res.json().catch((): null => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.data?.schedules)) {
        setAvailabilityLoaded(false);
        return;
      }
      setLiveSchedules(json.data.schedules as Schedule[]);
    } catch {
      setAvailabilityLoaded(false);
      // ignore: keep SSR schedules as fallback
    }
  }

  const effectiveSchedules = liveSchedules && liveSchedules.length > 0 ? liveSchedules : schedules;

  // Use DB plans if available, otherwise fall back to defaults
  const PLANS = (activity.plans && activity.plans.length > 0) ? activity.plans : DEFAULT_PLANS;
  const VISIBLE_PLANS = showAllPlans ? PLANS : PLANS.slice(0, 2);

  return (
  <>
    <div>
      {/* Date picker */}
      <div style={{ marginBottom: 28 }}>
        <div className="kkd-section-label-row">
          <span className="kkd-section-label">出發日期</span>
        </div>
        <DatePicker
          schedules={effectiveSchedules}
          selectedDate={selectedDate}
          onSelect={(date) => {
            void ensureLiveAvailability();
            setSelectedDate(date);
          }}
          price={activity.priceTwd ?? activity.price ?? 0}
        />
      </div>

      {/* Plan cards */}
      <div className="kkd-section-label-row" style={{ marginBottom: 12 }}>
        <span className="kkd-section-label">選擇方案</span>
      </div>

      <div className="kkd-plans-list">
        {VISIBLE_PLANS.map((plan) => {
          const basePrice = activity.priceTwd ?? activity.price ?? 0;
          const planPrice = Math.round(basePrice * plan.priceMultiplier);
          const origPrice = Math.round(planPrice * 1.25);
          const isSelected = selectedPlan === plan.id;

          // 取得該方案在選中日期的可用性
          const planAvail = getPlanScheduleForDate(effectiveSchedules, selectedDate, plan.id);
          const showFull = selectedDate && planAvail.isFull;
          const showNotOpen = selectedDate && !planAvail.schedule;
          const canBook = !selectedDate || planAvail.isOpen;

          return (
            <div
              key={plan.id}
              className={[
                'kkd-plan-card',
                isSelected ? 'selected' : '',
                showFull ? 'full' : '',
                showNotOpen ? 'not-open' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (!canBook) return;
                void ensureLiveAvailability();
                setSelectedPlan(plan.id);
              }}
              style={(!canBook && selectedDate) ? { opacity: 0.55, pointerEvents: 'none' as const } : undefined}
            >
              <div className="kkd-plan-header">
                <div>
                  <span className="kkd-plan-name">{plan.label}</span>
                  <span className="kkd-plan-duration">
                    {ICONS.clock}
                    {plan.duration}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* 額滿 / 未開放 badge */}
                  {showFull && (
                    <span style={{
                      background: '#fee2e2', color: '#991b1b', padding: '2px 10px',
                      borderRadius: 20, fontSize: 12, fontWeight: 700,
                    }}>額滿</span>
                  )}
                  {showNotOpen && (
                    <span style={{
                      background: '#f3f4f6', color: '#6b7280', padding: '2px 10px',
                      borderRadius: 20, fontSize: 12, fontWeight: 600,
                    }}>未開放</span>
                  )}
                  {/* 剩餘名額 */}
                  {selectedDate && planAvail.isOpen && (
                    <span style={{
                      background: planAvail.remaining <= 3 ? '#fef9c3' : '#dcfce7',
                      color: planAvail.remaining <= 3 ? '#854d0e' : '#166534',
                      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    }}>
                      剩 {planAvail.remaining} 位
                    </span>
                  )}
                  {selectedDate && (
                    <span className="kkd-plan-date-tag">
                      {selectedDate.slice(5).replace('-', '/')}
                    </span>
                  )}
                </div>
              </div>

              {/* Highlights: transparent bg, black icon + text */}
              <ul className="kkd-plan-notice-list">
                {plan.highlights.map((h, i) => (
                  <li key={i} className="kkd-plan-notice-item">
                    <span className="kkd-plan-notice-icon">{getIconForHighlight(h)}</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="kkd-link-sm"
                style={{ display: 'inline-block', marginBottom: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 'inherit', color: 'inherit' }}
                onClick={() => setModalPlan(plan)}
              >
                {plan.detailsLinkText || '查看方案詳情 ›'}
              </button>

              <div className="kkd-plan-footer">
                <div className="kkd-plan-price-block">
                  <span className="kkd-plan-orig-price">NT${origPrice.toLocaleString()}</span>
                  <strong className="kkd-plan-price">NT${planPrice.toLocaleString()}</strong>
                  <span className="kkd-plan-per"> 起 / 人</span>
                </div>
                {showFull ? (
                  <span
                    className="tp-btn kkd-plan-select-btn"
                    style={{ background: '#d1d5db', color: '#6b7280', cursor: 'not-allowed', pointerEvents: 'auto' }}
                  >
                    已額滿
                  </span>
                ) : showNotOpen ? (
                  <span
                    className="tp-btn kkd-plan-select-btn"
                    style={{ background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed', pointerEvents: 'auto' }}
                  >
                    未開放
                  </span>
                ) : (
                  <Link
                    href={resolvePlanBookingHref({
                      activitySlug: activity.slug,
                      planId: plan.id,
                      date: selectedDate || undefined,
                      scheduleId: planAvail.schedule?.id || undefined,
                      useBookingV2,
                    })}
                    className="tp-btn tp-btn-primary kkd-plan-select-btn"
                    onClick={() => {
                      void ensureLiveAvailability();
                      setSelectedPlan(plan.id);
                    }}
                  >
                    {plan.bookingBtnText || '立即預約'}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {PLANS.length > 2 && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowAllPlans(v => !v)}
            style={{
              background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            {showAllPlans ? '收合方案' : `查看更多方案（還有 ${PLANS.length - 2} 個）`}
          </button>
        </div>
      )}
    </div>

    {/* ── 方案詳情 Modal ── */}
    {modalPlan && (
      <PlanDetailModal
        plan={modalPlan}
        basePrice={activity.priceTwd ?? activity.price ?? 0}
        onClose={() => setModalPlan(null)}
      />
    )}
  </>
  );
}
