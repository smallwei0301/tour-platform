'use client';

import Link from 'next/link';
import type { Activity } from '../../fixtures/data';

interface Schedule {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
}

interface PlanCardProps {
  activity: Activity;
  selectedDate: string | null;
  schedules: Schedule[];
}

export function PlanCard({ activity, selectedDate, schedules }: PlanCardProps) {
  const originalPrice = Math.round(activity.price * 1.25);

  // Find earliest available booking date
  const availableSchedules = schedules.filter((s) => {
    const capacity = Number(s.capacity || 0);
    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
    return status === 'open' && capacity - bookedCount > 0;
  });

  const earliestSchedule = availableSchedules.sort((a, b) => {
    const aDate = a.startAt || a.start_at || '';
    const bDate = b.startAt || b.start_at || '';
    return aDate.localeCompare(bDate);
  })[0];

  const earliestDate = earliestSchedule
    ? (() => {
        const d = new Date(earliestSchedule.startAt || earliestSchedule.start_at || '');
        return `${d.getMonth() + 1}/${d.getDate()}`;
      })()
    : null;

  // Free cancellation from refund rules
  const freeCancelRule = activity.refundRules.find(
    (r) => r.includes('免費') || r.includes('全額退款') || r.includes('3天') || r.includes('72')
  );

  // If a date is selected, check if there's a valid schedule
  const selectedSchedule = selectedDate
    ? schedules.find((s) => {
        const startAt = s.startAt || s.start_at || '';
        return startAt.startsWith(selectedDate);
      })
    : null;

  const bookingHref = selectedDate
    ? `/booking/${activity.slug}?date=${selectedDate}`
    : `/booking/${activity.slug}`;

  return (
    <div className="tp-plan-card">
      <div className="tp-plan-card-header">
        <h4 className="tp-plan-card-title">標準方案</h4>
        {selectedDate && selectedSchedule && (
          <span className="tp-plan-date-tag">
            已選：{selectedDate.slice(5).replace('-', '/')}
          </span>
        )}
      </div>

      <div className="tp-plan-card-details">
        {earliestDate && (
          <div className="tp-plan-detail-row">
            <span className="tp-plan-check">✅</span>
            <span>最早可預訂日期：{earliestDate}</span>
          </div>
        )}
        {freeCancelRule && (
          <div className="tp-plan-detail-row">
            <span className="tp-plan-check">✅</span>
            <span>{freeCancelRule}</span>
          </div>
        )}
        <div className="tp-plan-detail-row">
          <span className="tp-plan-check">✅</span>
          <span>實名認證導遊帶領</span>
        </div>
        <div className="tp-plan-detail-row">
          <span className="tp-plan-check">✅</span>
          <span>電子憑證，出發前確認即可</span>
        </div>
      </div>

      <span className="tp-plan-detail-link">查看方案詳情 &gt;</span>

      <div className="tp-plan-card-footer">
        <div className="tp-plan-price-block">
          <span className="tp-plan-original-price">NT${originalPrice.toLocaleString()}</span>
          <span className="tp-plan-price">
            NT${activity.price.toLocaleString()}
          </span>
          <span className="tp-plan-price-label">起 / 人</span>
        </div>
        <Link href={bookingHref} className="tp-btn tp-plan-select-btn">
          選擇
        </Link>
      </div>
    </div>
  );
}
