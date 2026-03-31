'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DatePicker } from './DatePicker';

interface Schedule {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
}

interface Activity {
  slug: string;
  price?: number;
  priceTwd?: number;
  refundRules: string[];
  notices?: string[];
}

const PLANS = [
  {
    id: 'half-day',
    label: 'A. 半日行程',
    duration: '約 4 小時',
    priceMultiplier: 1,
    highlights: ['最早出發前 1 天可預訂', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
  },
  {
    id: 'full-day',
    label: 'B. 全日行程',
    duration: '約 8 小時',
    priceMultiplier: 1.6,
    highlights: ['午餐含餐（在地餐廳）', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
  },
];

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
}

export function DatePlanSection({ activity, schedules }: DatePlanSectionProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  return (
    <div>
      {/* Date picker */}
      <div style={{ marginBottom: 28 }}>
        <div className="kkd-section-label-row">
          <span className="kkd-section-label">出發日期</span>
        </div>
        <DatePicker
          schedules={schedules}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          price={activity.priceTwd ?? activity.price ?? 0}
        />
      </div>

      {/* Plan cards */}
      <div className="kkd-section-label-row" style={{ marginBottom: 12 }}>
        <span className="kkd-section-label">選擇方案</span>
      </div>

      <div className="kkd-plans-list">
        {PLANS.map((plan) => {
          const basePrice = activity.priceTwd ?? activity.price ?? 0;
          const planPrice = Math.round(basePrice * plan.priceMultiplier);
          const origPrice = Math.round(planPrice * 1.25);
          const isSelected = selectedPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`kkd-plan-card${isSelected ? ' selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <div className="kkd-plan-header">
                <div>
                  <span className="kkd-plan-name">{plan.label}</span>
                  <span className="kkd-plan-duration">
                    {ICONS.clock}
                    {plan.duration}
                  </span>
                </div>
                {selectedDate && (
                  <span className="kkd-plan-date-tag">
                    {selectedDate.slice(5).replace('-', '/')}
                  </span>
                )}
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

              <a
                href="#"
                className="kkd-link-sm"
                style={{ display: 'inline-block', marginBottom: 14 }}
                onClick={e => e.preventDefault()}
              >
                查看方案詳情 ›
              </a>

              <div className="kkd-plan-footer">
                <div className="kkd-plan-price-block">
                  <span className="kkd-plan-orig-price">NT${origPrice.toLocaleString()}</span>
                  <strong className="kkd-plan-price">NT${planPrice.toLocaleString()}</strong>
                  <span className="kkd-plan-per"> 起 / 人</span>
                </div>
                <Link
                  href={`/booking/${activity.slug}?plan=${plan.id}${selectedDate ? `&date=${selectedDate}` : ''}`}
                  className="tp-btn tp-btn-primary kkd-plan-select-btn"
                  onClick={e => { setSelectedPlan(plan.id); }}
                >
                  立即預約
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
