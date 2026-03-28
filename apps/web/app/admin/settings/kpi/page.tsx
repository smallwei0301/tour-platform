'use client';

import { useEffect, useState } from 'react';

export default function AdminKpiSettingsPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  async function loadAll() {
    const [cfgRes, hisRes] = await Promise.all([
      fetch('/api/admin/settings/kpi', { cache: 'no-store' }),
      fetch('/api/admin/settings/kpi/history', { cache: 'no-store' })
    ]);
    const cfgJson = await cfgRes.json();
    const hisJson = await hisRes.json();
    setCfg(cfgJson.data || null);
    setHistory(hisJson.data || []);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/kpi', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...cfg, actor: 'admin', note })
      });
      const j = await res.json();
      setCfg(j.data || cfg);
      setNote('');
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function revert(versionId: string) {
    if (!versionId) return;
    setSaving(true);
    try {
      await fetch('/api/admin/settings/kpi/revert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId, actor: 'admin' })
      });
      await loadAll();
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <main style={{ padding: 24 }}>載入中…</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1>KPI 計算設定</h1>
      <p style={{ color: '#666' }}>抽成率 / 金流費率 / 健康訂單判準（含版本審計與回滾）</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>目前設定</h3>
          <label style={{ display: 'block', marginTop: 8 }}>
            抽成率 commissionRate（0~1）
            <input type="number" step="0.001" value={cfg.commissionRate ?? 0.15} onChange={(e) => setCfg({ ...cfg, commissionRate: Number(e.target.value) })} style={{ width: '100%' }} />
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            金流費率 paymentFeeRate（0~1）
            <input type="number" step="0.001" value={cfg.paymentFeeRate ?? 0.035} onChange={(e) => setCfg({ ...cfg, paymentFeeRate: Number(e.target.value) })} style={{ width: '100%' }} />
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            健康訂單最低貢獻 healthyMinContributionTwd
            <input type="number" step="1" value={cfg.healthyMinContributionTwd ?? 1} onChange={(e) => setCfg({ ...cfg, healthyMinContributionTwd: Number(e.target.value) })} style={{ width: '100%' }} />
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            <input type="checkbox" checked={!!cfg.healthyAllowException} onChange={(e) => setCfg({ ...cfg, healthyAllowException: e.target.checked })} />
            健康訂單允許 exception（true 表示只看貢獻門檻）
          </label>

          <label style={{ display: 'block', marginTop: 8 }}>
            變更說明（note）
            <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%' }} placeholder="例：Q2 佣金策略調整" />
          </label>

          <button onClick={save} disabled={saving} style={{ marginTop: 10 }}>{saving ? '儲存中…' : '儲存設定'}</button>
          <p style={{ color: '#666', marginTop: 8 }}>最後更新：{cfg.updatedAt || '-'}</p>
        </section>

        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>版本歷史（最近 50 筆）</h3>
          {history.length === 0 ? (
            <p style={{ color: '#666' }}>目前無紀錄</p>
          ) : (
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              <table cellPadding={6} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th align="left">Version</th>
                    <th align="left">Action</th>
                    <th align="left">Who</th>
                    <th align="left">When</th>
                    <th align="left">Note</th>
                    <th align="left">Ops</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.versionId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td>{h.versionId}</td>
                      <td>{h.action}</td>
                      <td>{h.actor || '-'}</td>
                      <td>{h.createdAt ? new Date(h.createdAt).toLocaleString('zh-TW') : '-'}</td>
                      <td>{h.note || '-'}</td>
                      <td>
                        <button onClick={() => revert(h.versionId)} disabled={saving}>回滾</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
