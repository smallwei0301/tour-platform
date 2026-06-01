'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { ResponsiveTable, type ResponsiveColumn } from '../../../src/components/admin/responsive';

type Schedule = {
  id: string; activityId: string; tourTitle: string; planName: string; date: string; endAt?: string;
  capacity: number; bookedCount: number; status: string; guideNote: string | null;
};

type Filter = 'all' | 'upcoming' | 'past';

export default function GuideSchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [editingCap, setEditingCap] = useState<string | null>(null);
  const [capValue, setCapValue] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/guide/schedules');
      const json = await res.json();
      setSchedules(json?.data || []);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    load();
  }, []);

  const now = new Date();
  const filtered = schedules.filter((s) => {
    if (filter === 'upcoming') return new Date(s.date) >= now;
    if (filter === 'past') return new Date(s.date) < now;
    return true;
  });

  async function toggleActive(id: string, currentStatus: string) {
    const isActive = currentStatus === 'cancelled' || currentStatus === 'full' ? true : false;
    // Optimistic update
    setSchedules((prev) =>
      prev.map((s) => s.id === id ? { ...s, status: isActive ? 'open' : 'cancelled' } : s)
    );
    const res = await fetch(`/api/guide/schedules/${id}`, {
      method: 'PATCH',
      headers: csrfHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      load(); // Revert on error
      const json = await res.json().catch(() => ({}));
      alert(json?.error?.message || '操作失敗');
    }
  }

  async function updateCapacity(id: string) {
    const newCap = Number(capValue);
    if (isNaN(newCap) || newCap < 1) { alert('請輸入有效數字'); return; }
    const res = await fetch(`/api/guide/schedules/${id}`, {
      method: 'PATCH',
      headers: csrfHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ maxCapacity: newCap }),
    });
    const json = await res.json();
    if (res.ok) {
      setEditingCap(null);
      load();
    } else {
      alert(json?.error?.message || '更新失敗');
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800 }}>📅 場次管理</h1>
      <div style={{ margin: '0 0 12px', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: '#92400e', fontWeight: 700 }}>
          Legacy 固定場次管理（activity_schedules）
        </p>
        <p style={{ margin: '0 0 6px', fontSize: 12, color: '#78350f' }}>
          狀態說明：開放 / 額滿 / 已關閉（open/full/cancelled）。這個頁面只會調整既有固定場次的開關與容量，屬於舊制快照/備援流程，不會建立 V2 導遊可售時段規則。
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#78350f' }}>
          若你目前使用 V2 模式，請到
          <a href="/guide/availability" style={{ marginLeft: 4, color: '#7c3aed', fontWeight: 700 }}>
            /guide/availability
          </a>
          管理正式的可售時段來源（source of truth）。
        </p>
      </div>

      {/* Filter Tabs */}
      <div role="tablist" aria-label="場次篩選" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['upcoming', 'all', 'past'] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: filter === f ? '#7c3aed' : '#f3f4f6',
              color: filter === f ? '#fff' : '#6b7280',
            }}
          >
            {{ upcoming: '即將出發', all: '全部', past: '已結束' }[f]}
          </button>
        ))}
      </div>

      {(() => {
        const columns: ResponsiveColumn<Schedule>[] = [
          {
            key: 'tour', header: '行程', mobilePriority: 'title',
            cell: (s) => <span style={{ fontWeight: 600 }}>{s.tourTitle}</span>,
          },
          { key: 'plan', header: '方案', cell: (s) => <span style={{ color: '#6b7280' }}>{s.planName}</span> },
          {
            key: 'date', header: '日期',
            cell: (s) => (
              <span style={{ fontSize: 13 }}>
                {new Date(s.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' })}
                <br />
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  {new Date(s.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  {s.endAt ? ` - ${new Date(s.endAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </span>
            ),
          },
          {
            key: 'capacity', header: '已訂/容量',
            cell: (s) => (
              editingCap === s.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{s.bookedCount}/</span>
                  <input
                    value={capValue}
                    onChange={(e) => setCapValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') updateCapacity(s.id); if (e.key === 'Escape') setEditingCap(null); }}
                    autoFocus
                    type="number"
                    min={s.bookedCount}
                    style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #7c3aed', fontSize: 14, textAlign: 'center' }}
                  />
                  <button
                    onClick={() => updateCapacity(s.id)}
                    title="儲存"
                    style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setEditingCap(null)}
                    title="取消"
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{s.bookedCount}</span>
                    <span style={{ color: '#9ca3af' }}>/{s.capacity}</span>
                  </span>
                  <button
                    onClick={() => { setEditingCap(s.id); setCapValue(String(s.capacity)); }}
                    title="修改上限人數"
                    style={{ padding: '3px 7px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  >
                    ✏️ 改
                  </button>
                </div>
              )
            ),
          },
          {
            key: 'status', header: '狀態', align: 'right', mobilePriority: 'subtitle',
            cell: (s) => <StatusPill status={s.status} />,
          },
          {
            key: 'action', header: '操作', align: 'right',
            cell: (s) => (
              <button
                onClick={() => toggleActive(s.id, s.status)}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: s.status === 'open' ? '#fef2f2' : '#dcfce7',
                  color: s.status === 'open' ? '#dc2626' : '#16a34a',
                }}
              >
                {s.status === 'open' ? '關閉' : '開啟'}
              </button>
            ),
          },
        ];
        return (
          // ResponsiveTable's internal <Th> already renders scope="col" so the
          // a11y improvement from PR #1055 is preserved automatically.
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
            <ResponsiveTable<Schedule>
              columns={columns}
              rows={filtered}
              getRowKey={(s) => s.id}
              loading={loading}
              emptyMessage="無場次資料"
            />
          </div>
        );
      })()}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: '#dcfce7', text: '#16a34a', label: '開放' },
    full: { bg: '#fef3c7', text: '#d97706', label: '額滿' },
    cancelled: { bg: '#fee2e2', text: '#dc2626', label: '已關閉' },
  };
  const c = map[status] || { bg: '#f3f4f6', text: '#6b7280', label: status };
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, background: c.bg, color: c.text, fontSize: 12, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}
