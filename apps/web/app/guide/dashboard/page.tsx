'use client';

import { useEffect, useState } from 'react';

type DashboardData = {
  monthlyBookings: number;
  pendingBookings: Array<{
    id: string;
    guestName: string;
    partySize: number;
    status: string;
    createdAt: string;
    tourTitle: string;
  }>;
  upcomingSchedules: Array<{
    id: string;
    tourTitle: string;
    date: string;
    planId: string;
    bookedCount: number;
    maxCapacity: number;
    status: string;
  }>;
};

type ScheduleBooking = {
  id: string;
  guestName: string;
  guestPhone: string;
  maskedEmail: string;
  partySize: number;
  status: string;
  totalTwd: number;
  paidAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  confirmed: '已確認',
  cancelled: '已取消',
  refunded: '已退款',
  open: '開放',
  full: '額滿',
  cancelled_schedule: '已取消',
};

function statusClass(status: string) {
  if (status === 'confirmed' || status === 'open') return 'success';
  if (status === 'pending_payment' || status === 'full') return 'warning';
  if (status === 'cancelled' || status === 'cancelled_schedule') return 'danger';
  return 'neutral';
}

export default function GuideDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [guideName, setGuideName] = useState('導遊');
  const [scheduleModal, setScheduleModal] = useState<{
    scheduleId: string;
    tourTitle: string;
    date: string;
    planId: string;
    bookedCount: number;
    maxCapacity: number;
  } | null>(null);
  const [scheduleBookings, setScheduleBookings] = useState<ScheduleBooking[]>([]);
  const [scheduleBookingsLoading, setScheduleBookingsLoading] = useState(false);

  useEffect(() => {
    setIsNew(document.cookie.includes('guide_is_new=1'));
    const raw = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('guide_name='))
      ?.split('=')[1] || '導遊';
    setGuideName(decodeURIComponent(raw));

    fetch('/api/guide/dashboard')
      .then((r) => r.json())
      .then((json) => setData(json?.data))
      .finally(() => setLoading(false));
  }, []);

  async function openScheduleDetail(s: NonNullable<DashboardData['upcomingSchedules']>[0]) {
    setScheduleModal({
      scheduleId: s.id,
      tourTitle: s.tourTitle,
      date: s.date,
      planId: s.planId,
      bookedCount: s.bookedCount,
      maxCapacity: s.maxCapacity,
    });
    setScheduleBookings([]);
    setScheduleBookingsLoading(true);
    try {
      const res = await fetch(`/api/guide/bookings?scheduleId=${s.id}`);
      const json = await res.json();
      setScheduleBookings(json?.data || []);
    } finally {
      setScheduleBookingsLoading(false);
    }
  }

  if (loading) {
    return <div className="tp-guide-empty">載入中…</div>;
  }

  return (
    <div className="tp-guide-grid">
      <section className="tp-guide-hero">
        <p className="tp-guide-kicker">guide dashboard</p>
        <h1>{guideName}，今天要先看哪一段行程節奏？</h1>
        <p>
          這裡保留原本 `/api/guide/dashboard` 與 `/api/guide/bookings?scheduleId=...` 的資料邏輯，
          但把入口改成一個真正的導遊工作台首頁：先看本月預訂、近期訂單，再快速打開場次中的旅客名單。
        </p>
        <div className="tp-guide-hero-meta">
          <span className="tp-guide-chip">📦 本月預訂</span>
          <span className="tp-guide-chip">📋 近期訂單</span>
          <span className="tp-guide-chip">🗓️ 本週場次</span>
        </div>
      </section>

      {isNew && (
        <section className="tp-guide-banner">
          <strong>👋 歡迎 {guideName}！</strong>
          <p className="tp-guide-meta" style={{ margin: '8px 0 0' }}>
            這是你的導遊工作台。你可以在這裡管理場次、時間規則與旅客資訊。
          </p>
          <div className="tp-guide-actions-row">
            <button
              type="button"
              className="tp-btn tp-btn-ghost"
              onClick={() => {
                setIsNew(false);
                document.cookie = 'guide_is_new=; Path=/guide; Max-Age=0';
              }}
            >
              我知道了
            </button>
          </div>
        </section>
      )}

      <section className="tp-guide-stat-grid">
        <article className="tp-guide-stat-card">
          <div className="tp-guide-stat-label">本月預訂數</div>
          <div className="tp-guide-stat-value">{data?.monthlyBookings ?? 0}</div>
          <div className="tp-guide-stat-note">這個月已成立的旅客預約</div>
        </article>
        <article className="tp-guide-stat-card">
          <div className="tp-guide-stat-label">近期訂單</div>
          <div className="tp-guide-stat-value">{data?.pendingBookings?.length ?? 0}</div>
          <div className="tp-guide-stat-note">等待你確認的近期旅客名單</div>
        </article>
        <article className="tp-guide-stat-card">
          <div className="tp-guide-stat-label">本週場次</div>
          <div className="tp-guide-stat-value">{data?.upcomingSchedules?.length ?? 0}</div>
          <div className="tp-guide-stat-note">近期可帶團或即將出發的場次</div>
        </article>
      </section>

      <section className="tp-guide-grid cols-2" style={{ alignItems: 'start' }}>
        <div className="tp-guide-panel">
          <h2>近期訂單</h2>
          {!data?.pendingBookings?.length ? (
            <div className="tp-guide-empty">目前沒有近期訂單。</div>
          ) : (
            <div className="tp-guide-card-list">
              {data.pendingBookings.map((booking) => (
                <article key={booking.id} className="tp-guide-data-card">
                  <div className="tp-guide-data-top">
                    <div>
                      <strong>{booking.guestName}</strong>
                      <div className="tp-guide-meta">{booking.tourTitle}</div>
                    </div>
                    <span className={`tp-guide-status ${statusClass(booking.status)}`}>
                      {STATUS_LABELS[booking.status] || booking.status}
                    </span>
                  </div>
                  <div className="tp-guide-meta" style={{ marginTop: 10 }}>
                    👥 {booking.partySize} 人 · 建立時間 {new Date(booking.createdAt).toLocaleDateString('zh-TW')}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="tp-guide-panel">
          <h2>本週場次</h2>
          {!data?.upcomingSchedules?.length ? (
            <div className="tp-guide-empty">本週沒有場次。</div>
          ) : (
            <div className="tp-guide-card-list">
              {data.upcomingSchedules.map((schedule) => (
                <button
                  key={schedule.id}
                  type="button"
                  className="tp-guide-data-card"
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => openScheduleDetail(schedule)}
                >
                  <div className="tp-guide-data-top">
                    <div>
                      <strong>{schedule.tourTitle}</strong>
                      <div className="tp-guide-meta">
                        {new Date(schedule.date).toLocaleDateString('zh-TW', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {schedule.planId && ` · ${schedule.planId}`}
                      </div>
                    </div>
                    <span className={`tp-guide-status ${statusClass(schedule.status)}`}>
                      {STATUS_LABELS[schedule.status] || schedule.status}
                    </span>
                  </div>
                  <div className="tp-guide-actions-row" style={{ marginTop: 12 }}>
                    <span className="tp-guide-chip">已訂 {schedule.bookedCount} / {schedule.maxCapacity}</span>
                    <span className="tp-guide-chip">點擊查看旅客名單</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {scheduleModal && (
        <div className="tp-guide-overlay" onClick={() => setScheduleModal(null)}>
          <div className="tp-guide-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-guide-modal-head">
              <div>
                <p className="tp-guide-kicker">schedule detail</p>
                <h2 style={{ marginBottom: 6 }}>{scheduleModal.tourTitle}</h2>
                <div className="tp-guide-meta">
                  {new Date(scheduleModal.date).toLocaleString('zh-TW')}
                  {scheduleModal.planId && ` · ${scheduleModal.planId}`}
                </div>
              </div>
              <button type="button" className="tp-guide-action-btn" onClick={() => setScheduleModal(null)}>
                關閉
              </button>
            </div>

            <div className="tp-guide-banner" style={{ marginBottom: 18 }}>
              👥 已訂 {scheduleModal.bookedCount} / {scheduleModal.maxCapacity} 人，剩餘 {scheduleModal.maxCapacity - scheduleModal.bookedCount} 位
            </div>

            {scheduleBookingsLoading ? (
              <div className="tp-guide-empty">載入旅客名單中…</div>
            ) : scheduleBookings.length === 0 ? (
              <div className="tp-guide-empty">此場次目前還沒有訂單。</div>
            ) : (
              <div className="tp-guide-card-list">
                {scheduleBookings.map((booking) => {
                  const isCancelled = booking.status === 'cancelled_by_user' || booking.status === 'cancelled';
                  return (
                    <article key={booking.id} className="tp-guide-data-card" style={{ opacity: isCancelled ? 0.68 : 1 }}>
                      <div className="tp-guide-data-top">
                        <div>
                          <strong>{booking.guestName}</strong>
                          <div className="tp-guide-meta">
                            👥 {booking.partySize} 人 · {booking.maskedEmail}
                          </div>
                        </div>
                        <span className={`tp-guide-status ${statusClass(booking.status)}`}>
                          {booking.status === 'confirmed'
                            ? '已確認'
                            : booking.status === 'pending_payment'
                              ? '待付款'
                              : isCancelled
                                ? '已取消'
                                : booking.status}
                        </span>
                      </div>
                      <div className="tp-guide-actions-row">
                        {booking.guestPhone && (
                          <button type="button" className="tp-btn tp-btn-ghost" onClick={() => navigator.clipboard.writeText(booking.guestPhone)}>
                            複製電話：{booking.guestPhone}
                          </button>
                        )}
                        <span className="tp-guide-chip">NT$ {booking.totalTwd.toLocaleString()}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
