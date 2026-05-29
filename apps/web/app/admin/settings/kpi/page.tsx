'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, EmptyState } from '../../../../src/components/admin/ui';
import { ResponsiveTable, type ResponsiveColumn } from '../../../../src/components/admin/responsive';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

export default function AdminKpiSettingsPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  async function loadAll() {
    const [cfgRes, hisRes] = await Promise.all([
      fetch('/api/admin/settings/kpi', { cache: 'no-store' }),
      fetch('/api/admin/settings/kpi/history', { cache: 'no-store' }),
    ]);
    setCfg((await cfgRes.json()).data || null);
    setHistory((await hisRes.json()).data || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/kpi', { method: 'PATCH', headers: csrfHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ ...cfg, actor: 'admin', note }) });
      setCfg((await res.json()).data || cfg);
      setNote('');
      await loadAll();
    } finally { setSaving(false); }
  }

  async function revert(versionId: string) {
    setSaving(true);
    try {
      await fetch('/api/admin/settings/kpi/revert', { method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ versionId, actor: 'admin' }) });
      await loadAll();
    } finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginTop: 4, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 14 };

  if (!cfg) return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="KPI 計算設定" />
      <div style={{ padding: 32, color: '#9ca3af', textAlign: 'center' }}>載入中…</div>
    </div>
  );

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="KPI 計算設定" subtitle="抽成率、金流費率、健康訂單判準（含版本回滾）" />

      <div className="admin-split-grid admin-page" style={{ gap: 20 }}>
        {/* Settings Form */}
        <Card data-guide="kpi-form" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#111' }}>目前設定</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af' }}>最後更新：{cfg.updatedAt || '-'}</p>

          <label style={labelStyle}>抽成率 commissionRate（0~1）</label>
          <input type="number" step="0.001" value={cfg.commissionRate ?? 0.15}
            onChange={e => setCfg({...cfg, commissionRate: Number(e.target.value)})} style={inputStyle} />

          <label style={labelStyle}>金流費率 paymentFeeRate（0~1）</label>
          <input type="number" step="0.001" value={cfg.paymentFeeRate ?? 0.035}
            onChange={e => setCfg({...cfg, paymentFeeRate: Number(e.target.value)})} style={inputStyle} />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>paymentFeeRate 僅用於平台內部損益試算；金流手續費由平台吸收，不影響導遊 85% 實拿。</p>

          <label style={labelStyle}>導遊分潤率 guidePayoutRate（0~1）</label>
          <input type="number" step="0.001" value={(cfg as any).guidePayoutRate ?? 0.85}
            onChange={e => setCfg({...cfg, guidePayoutRate: Number(e.target.value)} as any)} style={inputStyle} />
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>用於訂單管理「導遊成本」欄位計算（旅客實付金額扣除已退款部分後 × 導遊分潤率）</p>

          <label style={labelStyle}>健康訂單最低貢獻 healthyMinContributionTwd</label>
          <input type="number" step="1" value={cfg.healthyMinContributionTwd ?? 1}
            onChange={e => setCfg({...cfg, healthyMinContributionTwd: Number(e.target.value)})} style={inputStyle} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!cfg.healthyAllowException}
              onChange={e => setCfg({...cfg, healthyAllowException: e.target.checked})}
              style={{ width: 16, height: 16, accentColor: 'var(--tp-primary)' }} />
            健康訂單允許 exception（僅看貢獻門檻）
          </label>

          <label style={labelStyle}>變更說明</label>
          <input value={note} onChange={e => setNote(e.target.value)} style={inputStyle} placeholder="例：Q2 佣金策略調整" />

          <button onClick={save} disabled={saving}
            style={{ marginTop: 20, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--tp-primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? '儲存中…' : '儲存設定'}
          </button>
        </Card>

        {/* History */}
        <Card data-guide="kpi-history">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>版本歷史</h3>
          </div>
          {history.length === 0 ? <EmptyState message="目前無版本歷史" /> : (
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <ResponsiveTable
                columns={[
                  {
                    key: 'version', header: 'Version', mobilePriority: 'title',
                    cell: (h: any) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{String(h.versionId).slice(0, 10)}</span>,
                  },
                  {
                    key: 'action', header: 'Action', mobilePriority: 'subtitle',
                    cell: (h: any) => <span style={{ fontSize: 12 }}>{h.action}</span>,
                  },
                  { key: 'actor', header: '誰', mobileLabel: '誰', cell: (h: any) => <span style={{ fontSize: 12 }}>{h.actor || '-'}</span> },
                  {
                    key: 'createdAt', header: '時間', mobileLabel: '時間',
                    cell: (h: any) => <span style={{ fontSize: 12, color: '#6b7280' }}>{h.createdAt ? new Date(h.createdAt).toLocaleDateString('zh-TW') : '-'}</span>,
                  },
                  { key: 'note', header: '備註', mobileLabel: '備註', cell: (h: any) => <span style={{ fontSize: 12, color: '#9ca3af' }}>{h.note || '-'}</span> },
                  {
                    key: 'revert', header: '', mobileLabel: '操作',
                    cell: (h: any) => (
                      <button onClick={() => revert(h.versionId)} disabled={saving}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
                        回滾
                      </button>
                    ),
                  },
                ] as ResponsiveColumn<any>[]}
                rows={history}
                getRowKey={(h: any) => h.versionId}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
