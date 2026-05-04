'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type Schedule = {
  id: string;
  activityId: string;
  tourTitle: string;
  planName: string;
  date: string;
  capacity: number;
  bookedCount: number;
  status: string;
  guideNote: string | null;
};

type Filter = 'all' | 'upcoming' | 'past';

function statusClass(status: string) {
  if (status === 'open') return 'success';
  if (status === 'full') return 'warning';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    load();
  }, []);

  const now = new Date();
  const filtered = schedules.filter((schedule) => {
    if (filter === 'upcoming') return new Date(schedule.date) >= now;
    if (filter === 'past') return new Date(schedule.date) < now;
    return true;
  });

  async function toggleActive(id: string, currentStatus: string) {
    const isActive = currentStatus === 'cancelled' || currentStatus === 'full';
    setSchedules((prev) => prev.map((schedule) => (schedule.id === id ? { ...schedule, status: isActive ? 'open' : 'cancelled' } : schedule)));
    const res = await fetch(`/api/guide/schedules/${id}`, {
      method: 'PATCH',
      headers: csrfHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      load();
      const json = await res.json().catch(() => ({}));
      alert(json?.error?.message || '操作失敗');
    }
  }

  async function updateCapacity(id: string) {
    const newCap = Number(capValue);
    if (Number.isNaN(newCap) || newCap < 1) {
      alert('請輸入有效數字');
      return;
    }
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
    <div className="tp-guide-grid">
      <section className="tp-guide-hero">
        <p className="tp-guide-kicker">guide schedules</p>
        <h1>場次開關、容量調整與近期出團節奏，都在這裡。</h1>
        <p>
          保留 `/api/guide/schedules` 與 PATCH 邏輯，只把場次管理收進同一套 MIDAO guide shell。
          你可以切換 upcoming / all / past，也能直接改容量、關閉或重新開放場次。
        </p>
      </section>

      <section className="tp-guide-panel">
        <div className="tp-guide-actions-row" style={{ marginTop: 0 }}>
          {(['upcoming', 'all', 'past'] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? 'tp-btn tp-btn-primary' : 'tp-btn tp-btn-ghost'}
              onClick={() => setFilter(item)}
            >
              {{ upcoming: '即將出發', all: '全部', past: '已結束' }[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="tp-guide-panel">
        {loading ? (
          <div className="tp-guide-empty">載入場次中…</div>
        ) : filtered.length === 0 ? (
          <div className="tp-guide-empty">目前沒有符合條件的場次。</div>
        ) : (
          <div className="tp-guide-table-shell">
            <table className="tp-guide-table">
              <thead>
                <tr>
                  <th>行程</th>
                  <th>方案</th>
                  <th>日期</th>
                  <th>已訂 / 容量</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((schedule) => (
                  <tr key={schedule.id}>
                    <td>
                      <strong>{schedule.tourTitle}</strong>
                      {schedule.guideNote && <div className="tp-guide-meta">{schedule.guideNote}</div>}
                    </td>
                    <td>{schedule.planName}</td>
                    <td>
                      {new Date(schedule.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' })}
                      <div className="tp-guide-meta">
                        {new Date(schedule.date).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>
                      {editingCap === schedule.id ? (
                        <div className="tp-guide-actions-row" style={{ marginTop: 0 }}>
                          <input
                            className="tp-guide-input"
                            value={capValue}
                            type="number"
                            min={schedule.bookedCount}
                            onChange={(e) => setCapValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') updateCapacity(schedule.id);
                              if (e.key === 'Escape') setEditingCap(null);
                            }}
                            autoFocus
                            style={{ maxWidth: 96 }}
                          />
                          <button type="button" className="tp-btn tp-btn-primary" onClick={() => updateCapacity(schedule.id)}>
                            儲存
                          </button>
                          <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setEditingCap(null)}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="tp-guide-actions-row" style={{ marginTop: 0 }}>
                          <span>{schedule.bookedCount} / {schedule.capacity}</span>
                          <button
                            type="button"
                            className="tp-btn tp-btn-ghost"
                            onClick={() => {
                              setEditingCap(schedule.id);
                              setCapValue(String(schedule.capacity));
                            }}
                          >
                            修改容量
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`tp-guide-status ${statusClass(schedule.status)}`}>
                        {schedule.status === 'open' ? '開放' : schedule.status === 'full' ? '額滿' : schedule.status === 'cancelled' ? '已關閉' : schedule.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className={schedule.status === 'open' ? 'tp-btn tp-btn-ghost' : 'tp-btn tp-btn-primary'} onClick={() => toggleActive(schedule.id, schedule.status)}>
                        {schedule.status === 'open' ? '關閉' : '開啟'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
