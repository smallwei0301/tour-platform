'use client';

import { useEffect, useState } from 'react';
import { ResponsiveTable, ResponsiveModal, type ResponsiveColumn } from '../../../src/components/admin/responsive';

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

function StatusPill({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: status === 'confirmed' ? '#dcfce7' : status === 'pending_payment' ? '#fef9c3' : '#fee2e2',
      color: status === 'confirmed' ? '#16a34a' : status === 'pending_payment' ? '#ca8a04' : '#dc2626',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
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
    } finally { setDetailLoading(false); }
  }

  const filtered = bookings.filter((b) => !statusFilter || b.status === statusFilter);

  const columns: ResponsiveColumn<Booking>[] = [
    {
      key: 'guest',
      header: '旅客',
      mobilePriority: 'title',
      cell: (b) => (
        <>
          <div style={{ fontWeight: 600 }}>{b.guestName}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{b.maskedEmail}</div>
        </>
      ),
    },
    { key: 'tour', header: '行程', cell: (b) => b.tourTitle },
    {
      key: 'date',
      header: '場次日期',
      cell: (b) => (
        <span style={{ fontSize: 13 }}>
          {b.scheduleDate ? new Date(b.scheduleDate).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) : '-'}
        </span>
      ),
    },
    { key: 'party', header: '人數', cell: (b) => `${b.partySize}` },
    {
      key: 'amount',
      header: '金額',
      align: 'right',
      cell: (b) => <span style={{ fontWeight: 600 }}>NT$ {b.totalTwd.toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: '狀態',
      align: 'right',
      mobilePriority: 'subtitle',
      cell: (b) => <StatusPill status={b.status} />,
    },
    // Whole row/card is tappable — drop the redundant 詳情 button on mobile.
    {
      key: 'action',
      header: '操作',
      align: 'right',
      mobilePriority: 'hidden',
      cell: (b) => (
        <button
          onClick={(e) => { e.stopPropagation(); openDetail(b.id); }}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer' }}
        >
          詳情
        </button>
      ),
    },
  ];

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800 }}>📋 訂單查看</h1>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { value: '', label: '全部' },
          { value: 'confirmed', label: '已確認' },
          { value: 'pending_payment', label: '待付款' },
          { value: 'cancelled', label: '已取消' },
        ].map((f) => (
          <button
            key={f.value}
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

      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        <ResponsiveTable<Booking>
          columns={columns}
          rows={filtered}
          getRowKey={(b) => b.id}
          onRowClick={(b) => openDetail(b.id)}
          loading={loading}
          emptyMessage="無訂單資料"
        />
      </div>

      <ResponsiveModal
        open={!!(selected || detailLoading)}
        onClose={() => { if (!detailLoading) setSelected(null); }}
        title="訂單詳情"
        size="sm"
      >
        {detailLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
        ) : selected && (
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
        )}
      </ResponsiveModal>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
      <div style={{ width: 90, flexShrink: 0, color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 500, flex: '1 1 200px', minWidth: 0, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
