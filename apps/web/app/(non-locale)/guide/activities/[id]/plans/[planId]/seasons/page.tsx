'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../../../../../../src/lib/csrf-client';

type Season = {
  id: string;
  name: string;
  start_month: number;
  start_day: number;
  end_month: number;
  end_day: number;
};

const fieldStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };
const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 16 };

const EMPTY_FORM = { name: '', start_month: '1', start_day: '1', end_month: '12', end_day: '31' };

export default function GuidePlanSeasonsPage() {
  const params = useParams();
  const router = useRouter();
  const activityId = String(params?.id || '');
  const planId = String(params?.planId || '');

  const [isYearRound, setIsYearRound] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const base = `/api/guide/activities/${activityId}/plans/${planId}/seasons`;

  const load = useCallback(() => {
    setLoading(true);
    fetch(base, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) { setIsYearRound(!!j.data.isYearRound); setSeasons(j.data.seasons || []); }
        else setError(j.error?.message || '載入失敗');
      })
      .catch(() => setError('載入失敗'))
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    load();
  }, [load]);

  async function toggleYearRound(next: boolean) {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(base, {
        method: 'PUT',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ isYearRound: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '更新失敗');
      setIsYearRound(next);
      setNotice('已更新（即時生效）');
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗');
    } finally {
      setBusy(false);
    }
  }

  async function addSeason() {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          name: form.name,
          start_month: Number(form.start_month), start_day: Number(form.start_day),
          end_month: Number(form.end_month), end_day: Number(form.end_day),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '新增失敗');
      setForm(EMPTY_FORM);
      setNotice('已新增季節窗口（即時生效）');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setBusy(false);
    }
  }

  async function removeSeason(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE', headers: csrfHeaders() });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '移除失敗');
      setNotice('已移除季節窗口（即時生效）');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '移除失敗');
    } finally {
      setBusy(false);
    }
  }

  const monthDayOptions = (max: number) => Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <button onClick={() => router.push(`/guide/activities/${activityId}/plans/${planId}`)} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', marginBottom: 12, fontSize: 14 }}>
        ‹ 返回方案編輯
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>季節供應</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        設定此方案在一年中哪些日期可被預約。此頁的調整<strong>即時生效、不需審核</strong>（與時間管理相同）。
      </p>

      {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16 }} role="alert">{error}</div>}
      {notice && <div style={{ background: '#dcfce7', color: '#166534', padding: 12, borderRadius: 8, marginBottom: 16 }}>{notice}</div>}

      {loading ? (
        <p style={{ color: '#64748b' }}>載入中…</p>
      ) : (
        <>
          <section style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>全年供應</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>開啟後忽略下方季節窗口，全年皆可預約。</div>
            </div>
            <button
              role="switch"
              aria-checked={isYearRound}
              disabled={busy}
              onClick={() => toggleYearRound(!isYearRound)}
              style={{
                width: 56, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
                background: isYearRound ? '#7c3aed' : '#cbd5e1', position: 'relative', transition: 'background .15s',
              }}
            >
              <span style={{ position: 'absolute', top: 3, left: isYearRound ? 29 : 3, width: 24, height: 24, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
            </button>
          </section>

          {!isYearRound && (
            <>
              <section style={sectionStyle}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>可預約季節窗口</div>
                {seasons.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: 14 }}>尚未設定任何季節窗口。未設定且非全年供應時，此方案不會開放預約。</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {seasons.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span style={{ color: '#475569', fontSize: 13, marginLeft: 10 }}>
                            {s.start_month}/{s.start_day} – {s.end_month}/{s.end_day}
                          </span>
                        </div>
                        <button onClick={() => removeSeason(s.id)} disabled={busy} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 13 }}>
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={sectionStyle}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>新增季節窗口</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>名稱</label>
                  <input style={{ ...fieldStyle, width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：賞鯨季" />
                </div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>開始（月/日）</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select style={fieldStyle} value={form.start_month} onChange={(e) => setForm({ ...form, start_month: e.target.value })} aria-label="開始月">
                        {monthDayOptions(12).map((m) => <option key={m} value={m}>{m} 月</option>)}
                      </select>
                      <select style={fieldStyle} value={form.start_day} onChange={(e) => setForm({ ...form, start_day: e.target.value })} aria-label="開始日">
                        {monthDayOptions(31).map((d) => <option key={d} value={d}>{d} 日</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>結束（月/日）</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select style={fieldStyle} value={form.end_month} onChange={(e) => setForm({ ...form, end_month: e.target.value })} aria-label="結束月">
                        {monthDayOptions(12).map((m) => <option key={m} value={m}>{m} 月</option>)}
                      </select>
                      <select style={fieldStyle} value={form.end_day} onChange={(e) => setForm({ ...form, end_day: e.target.value })} aria-label="結束日">
                        {monthDayOptions(31).map((d) => <option key={d} value={d}>{d} 日</option>)}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={addSeason}
                    disabled={busy || !form.name.trim()}
                    style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontSize: 14 }}
                  >
                    新增
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
