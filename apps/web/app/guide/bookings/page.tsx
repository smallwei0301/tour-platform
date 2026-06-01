'use client';

import { useEffect, useRef, useState } from 'react';

type Booking = {
  id: string; guestName: string; maskedEmail: string; scheduleDate: string | null;
  planId: string | null; tourTitle: string; partySize: number; status: string;
  paymentStatus: string; totalTwd: number; createdAt: string;
};

type BookingDetail = Booking & {
  guestPhone: string; paidAt: string | null; adminNote: string | null;
  schedule: { date: string; endAt: string; planId: string; capacity: number; bookedCount: number } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_payment: '待付款', confirmed: '已確認', cancelled: '已取消', refunded: '已退款',
};

export default function GuideBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const detailDialogOpen = selected !== null || detailLoading;

  useEffect(() => {
    fetch('/api/guide/bookings')
      .then((r) => r.json())
      .then((json) => setBookings(json?.data || []))
      .finally(() => setLoading(false));
  }, []);

  async function openDetail(id: string, trigger?: HTMLElement | null) {
    if (trigger) triggerRef.current = trigger;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/guide/bookings/${id}`);
      const json = await res.json();
      if (json?.data) setSelected(json.data);
    } finally { setDetailLoading(false); }
  }

  function closeDetail() {
    setSelected(null);
  }

  useEffect(() => {
    if (!detailDialogOpen) {
      if (triggerRef.current && document.contains(triggerRef.current)) {
        triggerRef.current.focus();
      }
      return;
    }

    const container = dialogRef.current;
    if (!container) return;

    const focusables = getFocusableElements(container);
    const initialFocus = closeButtonRef.current || focusables[0] || container;
    initialFocus.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDetail();
        return;
      }

      if (event.key !== 'Tab') return;

      const currentFocusables = getFocusableElements(container);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (active && !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailDialogOpen]);

  const filtered = bookings.filter((b) => !statusFilter || b.status === statusFilter);

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800 }}>📋 訂單查看</h1>

      {/* Filter */}
      <div role="tablist" aria-label="預約狀態篩選" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { value: '', label: '全部' },
          { value: 'confirmed', label: '已確認' },
          { value: 'pending_payment', label: '待付款' },
          { value: 'cancelled', label: '已取消' },
        ].map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: statusFilter === f.value ? '#7c3aed' : '#f3f4f6',
              color: statusFilter === f.value ? '#fff' : '#6b7280',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>無訂單資料</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                <th scope="col" style={{ padding: '10px 12px' }}>旅客</th>
                <th scope="col">行程</th>
                <th scope="col">場次日期</th>
                <th scope="col">人數</th>
                <th scope="col">金額</th>
                <th scope="col">狀態</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={(e) => openDetail(b.id, e.currentTarget as HTMLElement)}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{b.guestName}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.maskedEmail}</div>
                  </td>
                  <td>{b.tourTitle}</td>
                  <td style={{ fontSize: 13 }}>
                    {b.scheduleDate ? new Date(b.scheduleDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '-'}
                  </td>
                  <td>{b.partySize}</td>
                  <td style={{ fontWeight: 600 }}>NT$ {b.totalTwd.toLocaleString()}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: b.status === 'confirmed' ? '#dcfce7' : b.status === 'pending_payment' ? '#fef9c3' : '#fee2e2',
                      color: b.status === 'confirmed' ? '#16a34a' : b.status === 'pending_payment' ? '#ca8a04' : '#dc2626',
                    }}>
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(b.id, e.currentTarget); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >
                      詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {detailDialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !detailLoading && closeDetail()}
        >
          <div
            ref={dialogRef}
            role="dialog" aria-modal="true" aria-labelledby="booking-detail-modal-title" tabIndex={-1}
            style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 500, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
            ) : selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 id="booking-detail-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>訂單詳情</h3>
                  <button ref={closeButtonRef} aria-label="關閉" onClick={closeDetail} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
                  <InfoRow label="旅客姓名" value={selected.guestName} />
                  <InfoRow
                    label="手機號碼"
                    value={
                      <span>
                        {selected.guestPhone || '無'}
                        {selected.guestPhone && (
                          <button
                            onClick={() => navigator.clipboard.writeText(selected.guestPhone)}
                            style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 11, cursor: 'pointer' }}
                          >
                            📋 複製
                          </button>
                        )}
                      </span>
                    }
                  />
                  <InfoRow label="Email" value={selected.maskedEmail} />
                  <InfoRow label="行程" value={selected.tourTitle} />
                  <InfoRow label="場次日期" value={selected.schedule ? new Date(selected.schedule.date).toLocaleString('zh-TW') : '-'} />
                  <InfoRow label="人數" value={`${selected.partySize} 人`} />
                  <InfoRow label="金額" value={`NT$ ${selected.totalTwd.toLocaleString()}`} />
                  <InfoRow label="訂單狀態" value={STATUS_LABELS[selected.status] || selected.status} />
                  <InfoRow label="付款狀態" value={selected.paymentStatus === 'paid' ? `✅ 已付款（${new Date(selected.paidAt!).toLocaleString('zh-TW')}）` : '⏳ 未付款'} />
                  {selected.adminNote && <InfoRow label="管理員備註" value={selected.adminNote} />}

                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ width: 90, flexShrink: 0, color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
  );
}
