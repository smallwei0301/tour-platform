'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';

type Hold = {
  holdId: string;
  participants: number;
  note?: string | null;
  scheduleId: string;
  activityId: string;
  activityTitle?: string | null;
  guideId: string;
  scheduleStartAt?: string | null;
  capacity?: number | null;
  bookedCount?: number | null;
  createdAt?: string | null;
};

function fmt(dt?: string | null): string {
  if (!dt) return '-';
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminExternalHoldsPage() {
  const [rows, setRows] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/external-holds', { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok || !Array.isArray(j?.data)) {
        const code = j?.error?.code ? `（${j.error.code}）` : `（HTTP ${res.status}）`;
        setRows([]);
        setLoadError(`外部佔位資料載入失敗${code}，目前清單非即時狀態，請重試或稍後再試。`);
        return;
      }
      setRows(j.data);
    } catch {
      setRows([]);
      setLoadError('外部佔位資料載入失敗（網路錯誤），請重試或稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totalParticipants = rows.reduce((s, r) => s + (Number(r.participants) || 0), 0);

  const columns: ResponsiveColumn<Hold>[] = [
    {
      key: 'activity', header: '活動', mobilePriority: 'title',
      cell: (r) => <span style={{ fontSize: 13 }}>{r.activityTitle || r.activityId.slice(0, 8)}</span>,
    },
    {
      key: 'schedule', header: '場次時間', mobilePriority: 'subtitle',
      cell: (r) => <span style={{ fontSize: 13 }}>{fmt(r.scheduleStartAt)}</span>,
    },
    {
      key: 'participants', header: '佔位人數', align: 'right', mobileLabel: '人數',
      cell: (r) => <strong data-testid="external-hold-participants" style={{ color: '#b45309' }}>🔒 {r.participants} 人</strong>,
    },
    {
      key: 'fill', header: '已訂/容量', align: 'right', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontSize: 12, color: '#6b7280' }}>{r.bookedCount ?? '-'}/{r.capacity ?? '-'}</span>,
    },
    {
      key: 'note', header: '備註', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontSize: 12, color: '#6b7280' }}>{r.note || '-'}</span>,
    },
    {
      key: 'createdAt', header: '登記時間', mobilePriority: 'hidden',
      cell: (r) => <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmt(r.createdAt)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="外部佔位" subtitle="外部通路（OTA／電話／走客）已售、佔用平台名額的座位" />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 非營收說明：避免被誤讀為訂單／營收 */}
        <Card
          data-testid="external-hold-revenue-note"
          style={{ padding: '12px 16px', border: '1px solid #fcd34d', background: '#fffbeb' }}
        >
          <div style={{ fontSize: 13, color: '#92400e' }}>
            🔒 外部佔位佔用名額以防超賣，<strong>不是付款訂單、不計入營收與結算</strong>。
            登記/釋放由導遊於導遊後台自助操作。目前共 <strong>{rows.length}</strong> 筆、<strong>{totalParticipants}</strong> 人。
          </div>
        </Card>

        {!loading && loadError && (
          <Card
            data-testid="admin-external-holds-load-error"
            style={{ padding: '14px 18px', border: '1px solid #fecaca', background: '#fef2f2' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ color: '#b91c1c', fontSize: 14, fontWeight: 600 }}>{loadError}</div>
              <button
                onClick={() => { void load(); }}
                style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#b91c1c', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                重試
              </button>
            </div>
          </Card>
        )}

        <Card data-testid="admin-external-holds-table">
          {!loading && !loadError && rows.length === 0 ? (
            <div style={{ padding: '24px 18px', color: '#9ca3af', fontSize: 14 }}>目前沒有外部佔位。</div>
          ) : (
            <ResponsiveTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.holdId}
            />
          )}
        </Card>
      </div>
    </>
  );
}
