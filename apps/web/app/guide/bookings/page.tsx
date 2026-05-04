'use client';

import { useEffect, useState } from 'react';

type Booking = {
  id: string;
  guestName: string;
  maskedEmail: string;
  scheduleDate: string | null;
  planId: string | null;
  tourTitle: string;
  partySize: number;
  status: string;
  paymentStatus: string;
  totalTwd: number;
  createdAt: string;
};

type BookingDetail = Booking & {
  guestPhone: string;
  paidAt: string | null;
  adminNote: string | null;
  schedule: { date: string; endAt: string; planId: string; capacity: number; bookedCount: number } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款',
  confirmed: '已確認',
  cancelled: '已取消',
  refunded: '已退款',
};

function statusClass(status: string) {
  if (status === 'confirmed') return 'success';
  if (status === 'pending_payment') return 'warning';
  if (status === 'cancelled' || status === 'refunded') return 'danger';
  return 'neutral';
}

export default function GuideBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetch('/api/guide/bookings')
      .then((r) => r.json())
      .then((json) => setBookings(json?.data || []))
      .finally(() => setLoading(false));
  }, []);

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/guide/bookings/${id}`);
      const json = await res.json();
      if (json?.data) setSelected(json.data);
    } finally {
      setDetailLoading(false);
    }
  }

  const filtered = bookings.filter((booking) => !statusFilter || booking.status === statusFilter);

  return (
    <div className="tp-guide-grid">
      <section className="tp-guide-hero">
        <p className="tp-guide-kicker">guide bookings</p>
        <h1>旅客名單、付款狀態與聯絡方式，一次看清楚。</h1>
        <p>
          這頁保留 `/api/guide/bookings` 與 `/api/guide/bookings/[id]` 的邏輯，
          但把列表、篩選與 detail modal 收成統一的 MIDAO 工作台語言。
        </p>
      </section>

      <section className="tp-guide-panel">
        <div className="tp-guide-actions-row" style={{ marginTop: 0 }}>
          {[
            { value: '', label: '全部' },
            { value: 'confirmed', label: '已確認' },
            { value: 'pending_payment', label: '待付款' },
            { value: 'cancelled', label: '已取消' },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={statusFilter === filter.value ? 'tp-btn tp-btn-primary' : 'tp-btn tp-btn-ghost'}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tp-guide-panel">
        {loading ? (
          <div className="tp-guide-empty">載入訂單中…</div>
        ) : filtered.length === 0 ? (
          <div className="tp-guide-empty">目前沒有符合條件的訂單。</div>
        ) : (
          <div className="tp-guide-table-shell">
            <table className="tp-guide-table">
              <thead>
                <tr>
                  <th>旅客</th>
                  <th>行程</th>
                  <th>場次日期</th>
                  <th>人數</th>
                  <th>金額</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.guestName}</strong>
                      <div className="tp-guide-meta">{booking.maskedEmail}</div>
                    </td>
                    <td>{booking.tourTitle}</td>
                    <td>
                      {booking.scheduleDate
                        ? new Date(booking.scheduleDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
                        : '-'}
                    </td>
                    <td>{booking.partySize}</td>
                    <td>NT$ {booking.totalTwd.toLocaleString()}</td>
                    <td>
                      <span className={`tp-guide-status ${statusClass(booking.status)}`}>
                        {STATUS_LABELS[booking.status] || booking.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="tp-btn tp-btn-ghost" onClick={() => openDetail(booking.id)}>
                        查看詳情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(selected || detailLoading) && (
        <div className="tp-guide-overlay" onClick={() => !detailLoading && setSelected(null)}>
          <div className="tp-guide-modal-card" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? (
              <div className="tp-guide-empty">載入詳情中…</div>
            ) : selected && (
              <>
                <div className="tp-guide-modal-head">
                  <div>
                    <p className="tp-guide-kicker">booking detail</p>
                    <h2 style={{ marginBottom: 6 }}>訂單詳情</h2>
                    <div className="tp-guide-meta">{selected.tourTitle}</div>
                  </div>
                  <button type="button" className="tp-guide-action-btn" onClick={() => setSelected(null)}>
                    關閉
                  </button>
                </div>

                <div className="tp-guide-card-list">
                  <article className="tp-guide-data-card"><strong>旅客姓名</strong><div className="tp-guide-meta">{selected.guestName}</div></article>
                  <article className="tp-guide-data-card"><strong>手機號碼</strong><div className="tp-guide-actions-row"><span className="tp-guide-meta">{selected.guestPhone || '無'}</span>{selected.guestPhone && <button type="button" className="tp-btn tp-btn-ghost" onClick={() => navigator.clipboard.writeText(selected.guestPhone)}>複製</button>}</div></article>
                  <article className="tp-guide-data-card"><strong>Email</strong><div className="tp-guide-meta">{selected.maskedEmail}</div></article>
                  <article className="tp-guide-data-card"><strong>場次日期</strong><div className="tp-guide-meta">{selected.schedule ? new Date(selected.schedule.date).toLocaleString('zh-TW') : '-'}</div></article>
                  <article className="tp-guide-data-card"><strong>人數</strong><div className="tp-guide-meta">{selected.partySize} 人</div></article>
                  <article className="tp-guide-data-card"><strong>付款狀態</strong><div className="tp-guide-meta">{selected.paymentStatus === 'paid' ? `已付款（${selected.paidAt ? new Date(selected.paidAt).toLocaleString('zh-TW') : ''}）` : '未付款'}</div></article>
                  {selected.adminNote && <article className="tp-guide-data-card"><strong>管理員備註</strong><div className="tp-guide-meta">{selected.adminNote}</div></article>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
