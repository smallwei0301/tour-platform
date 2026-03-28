'use client';

import { useEffect, useState } from 'react';

export default function AdminKpiSettingsPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings/kpi', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setCfg(j.data || null));
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/kpi', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      const j = await res.json();
      setCfg(j.data || cfg);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <main style={{ padding: 24 }}>載入中…</main>;

  return (
    <main style={{ padding: 24 }}>
      <h1>KPI 計算設定</h1>
      <p style={{ color: '#666' }}>抽成率 / 金流費率 / 健康訂單判準</p>

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

      <button onClick={save} disabled={saving} style={{ marginTop: 10 }}>{saving ? '儲存中…' : '儲存設定'}</button>
      <p style={{ color: '#666', marginTop: 8 }}>最後更新：{cfg.updatedAt || '-'}</p>
    </main>
  );
}
