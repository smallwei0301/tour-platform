'use client';

import { useEffect, useState } from 'react';

type Schedule = {
  id: string; activityId: string; tourTitle: string; planName: string; date: string;
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

  useEffect(() => { load(); }, []);

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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['upcoming', 'all', 'past'] as Filter[]).map((f) => (
          <button
            key={f}
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

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>無場次資料</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 12px' }}>行程</th>
                <th>方案</th>
                <th>日期</th>
                <th>已訂/容量</th>
                <th>狀態</th>
                <th style={{ width: 100 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.tourTitle}</td>
                  <td style={{ color: '#6b7280' }}>{s.planName}</td>
                  <td style={{ fontSize: 13 }}>
                    {new Date(s.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' })}
                    <br />
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>
                      {new Date(s.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{s.bookedCount}</span>
                    <span style={{ color: '#9ca3af' }}>/</span>
                    {editingCap === s.id ? (
                      <span>
                        <input
                          value={capValue}
                          onChange={(e) => setCapValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && updateCapacity(s.id)}
                          onBlur={() => setEditingCap(null)}
                          autoFocus
                          style={{ width: 50, padding: '2px 6px', borderRadius: 4, border: '1px solid #7c3aed', fontSize: 14, textAlign: 'center' }}
                        />
                      </span>
                    ) : (
                      <span
                        onClick={() => { setEditingCap(s.id); setCapValue(String(s.capacity)); }}
                        style={{ cursor: 'pointer', borderBottom: '1px dashed #9ca3af' }}
                        title="點擊修改容量"
                      >
                        {s.capacity}
                      </span>
                    )}
                  </td>
                  <td>
                    <StatusPill status={s.status} />
                  </td>
                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
