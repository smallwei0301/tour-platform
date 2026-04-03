'use client';

import { useEffect, useState } from 'react';

type DashboardData = {
  monthlyBookings: number;
  pendingBookings: Array<{
    id: string; guestName: string; partySize: number;
    status: string; createdAt: string; tourTitle: string;
  }>;
  upcomingSchedules: Array<{
    id: string; tourTitle: string; date: string;
    planId: string; bookedCount: number; maxCapacity: number; status: string;
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

export default function GuideDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);

  // Schedule detail modal
  const [scheduleModal, setScheduleModal] = useState<{
    scheduleId: string; tourTitle: string; date: string; planId: string;
    bookedCount: number; maxCapacity: number;
  } | null>(null);
  const [scheduleBookings, setScheduleBookings] = useState<ScheduleBooking[]>([]);
  const [scheduleBookingsLoading, setScheduleBookingsLoading] = useState(false);

  async function openScheduleDetail(s: NonNullable<DashboardData['upcomingSchedules']>[0]) {
    setScheduleModal({ scheduleId: s.id, tourTitle: s.tourTitle, date: s.date, planId: s.planId, bookedCount: s.bookedCount, maxCapacity: s.maxCapacity });
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

  useEffect(() => {
    // Check if new user (cookie)
    setIsNew(document.cookie.includes('guide_is_new=1'));

    fetch('/api/guide/dashboard')
      .then((r) => r.json())
      .then((json) => setData(json?.data))
      .finally(() => setLoading(false));
  }, []);

  const [guideName, setGuideName] = useState('導遊');

  useEffect(() => {
    const raw = document.cookie.split(';').map(c => c.trim())
      .find(c => c.startsWith('guide_name='))?.split('=')[1] || '導遊';
    setGuideName(decodeURIComponent(raw));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Welcome Banner */}
      {isNew && (
        <div style={{
          background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
          borderRadius: 14,
          padding: '16px 20px',
          border: '1px solid #ddd6fe',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#5b21b6' }}>
              👋 歡迎 {guideName}！
            </div>
            <div style={{ fontSize: 13, color: '#7c3aed', marginTop: 4 }}>
              這是你的導遊後台。你可以在這裡管理場次和查看訂單。
            </div>
          </div>
          <button
            onClick={() => { setIsNew(false); document.cookie = 'guide_is_new=; Path=/guide; Max-Age=0'; }}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#a78bfa' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard label="本月預訂數" value={data?.monthlyBookings ?? 0} icon="📦" />
        <StatCard label="近期訂單" value={data?.pendingBookings?.length ?? 0} icon="📋" />
        <StatCard label="本週場次" value={data?.upcomingSchedules?.length ?? 0} icon="📅" />
      </div>

      {/* Recent Bookings */}
      <Section title="📋 近期訂單">
        {(!data?.pendingBookings?.length) ? (
          <Empty text="尚無訂單" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '8px 10px' }}>旅客</th>
                <th>行程</th>
                <th>人數</th>
                <th>狀態</th>
                <th>時間</th>
              </tr>
            </thead>
            <tbody>
              {data.pendingBookings.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px' }}>{b.guestName}</td>
                  <td>{b.tourTitle}</td>
                  <td>{b.partySize}</td>
                  <td><StatusPill status={b.status} /></td>
                  <td style={{ color: '#9ca3af', fontSize: 12 }}>
                    {new Date(b.createdAt).toLocaleDateString('zh-TW')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Upcoming Schedules */}
      <Section title="📅 本週場次">
        {(!data?.upcomingSchedules?.length) ? (
          <Empty text="本週無場次" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.upcomingSchedules.map((s) => (
              <div
                key={s.id}
                onClick={() => openScheduleDetail(s)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: '#fff', borderRadius: 10,
                  border: '1px solid #f3f4f6', cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.12)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.tourTitle}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(s.date).toLocaleDateString('zh-TW', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {s.planId && ` · ${s.planId}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', marginLeft: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.bookedCount}/{s.maxCapacity}</div>
                  <StatusPill status={s.status} />
                </div>
                <span style={{ marginLeft: 8, color: '#d1d5db', fontSize: 16 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Schedule Booking Detail Modal */}
      {scheduleModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setScheduleModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px', width: '100%', maxWidth: 600, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 -4px 30px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 16px' }} />

            {/* Header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{scheduleModal.tourTitle}</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                📅 {new Date(scheduleModal.date).toLocaleString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                {scheduleModal.planId && ` · ${scheduleModal.planId}`}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 13, color: '#374151' }}>
                  👥 已訂 <strong>{scheduleModal.bookedCount}</strong> / {scheduleModal.maxCapacity} 人
                </span>
                <span style={{ fontSize: 13, color: scheduleModal.bookedCount === 0 ? '#9ca3af' : '#7c3aed' }}>
                  剩餘 {scheduleModal.maxCapacity - scheduleModal.bookedCount} 位
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
                📋 旅客名單（{scheduleBookings.filter(b => b.status !== 'cancelled_by_user' && b.status !== 'cancelled').length} 位確認）
              </div>

              {scheduleBookingsLoading ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>載入中…</div>
              ) : scheduleBookings.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>此場次尚無訂單</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {scheduleBookings.map(b => {
                    const isCancelled = b.status === 'cancelled_by_user' || b.status === 'cancelled';
                    return (
                      <div key={b.id} style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: isCancelled ? '#f9fafb' : '#faf5ff',
                        border: `1px solid ${isCancelled ? '#f3f4f6' : '#ede9fe'}`,
                        opacity: isCancelled ? 0.6 : 1,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>
                              {b.guestName}
                              {isCancelled && <span style={{ marginLeft: 6, fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（已取消）</span>}
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>👥 {b.partySize} 人</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 600,
                              color: b.status === 'confirmed' ? '#16a34a' : b.status === 'pending_payment' ? '#d97706' : '#9ca3af'
                            }}>
                              {b.status === 'confirmed' ? '已確認' : b.status === 'pending_payment' ? '待付款' : isCancelled ? '已取消' : b.status}
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>NT$ {b.totalTwd.toLocaleString()}</div>
                          </div>
                        </div>
                        {/* Phone - full number for guide */}
                        {b.guestPhone && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: '#374151' }}>📞 {b.guestPhone}</span>
                            <button
                              onClick={() => navigator.clipboard.writeText(b.guestPhone)}
                              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, color: '#7c3aed', cursor: 'pointer' }}
                            >
                              複製
                            </button>
                          </div>
                        )}
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>{b.maskedEmail}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setScheduleModal(null)}
              style={{ width: '100%', marginTop: 16, padding: '12px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      padding: '18px 20px',
      border: '1px solid #f3f4f6',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1f2937' }}>{value}</div>
        </div>
        <div style={{ fontSize: 28 }}>{icon}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #f3f4f6' }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: '#dcfce7', text: '#16a34a' },
    open: { bg: '#dbeafe', text: '#2563eb' },
    full: { bg: '#fef3c7', text: '#d97706' },
    pending_payment: { bg: '#fef9c3', text: '#ca8a04' },
    cancelled: { bg: '#fee2e2', text: '#dc2626' },
  };
  const c = colors[status] || { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.text, fontSize: 12, fontWeight: 600 }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>{text}</div>
  );
}
