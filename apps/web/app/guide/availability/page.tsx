'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type AvailabilityRule = {
  id: string;
  guide_id: string;
  activity_plan_id: string | null;
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  activity_plans?: { id: string; name: string } | null;
};

type BlackoutDate = {
  id: string;
  guide_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  source: 'manual' | 'system';
};

type PreviewSlot = {
  startAt: string;
  endAt: string;
  isAvailable: boolean;
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export default function GuideAvailabilityPage() {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([]);
  const [previewSlots, setPreviewSlots] = useState<PreviewSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AvailabilityRule | null>(null);
  const [editingBlackout, setEditingBlackout] = useState<BlackoutDate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ruleForm, setRuleForm] = useState({
    weekday: 1,
    start_time_local: '09:00',
    end_time_local: '17:00',
    timezone: 'Asia/Taipei',
    slot_interval_minutes: 60,
    buffer_before_minutes: 15,
    buffer_after_minutes: 15,
    is_active: true,
  });
  const [blackoutForm, setBlackoutForm] = useState({
    starts_at: '',
    ends_at: '',
    reason: '',
  });
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [previewDateFrom, setPreviewDateFrom] = useState(today);
  const [previewDateTo, setPreviewDateTo] = useState(nextWeek);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, blackoutsRes] = await Promise.all([
        fetch('/api/guide/availability-rules'),
        fetch('/api/guide/blackout-dates'),
      ]);
      const rulesJson = await rulesRes.json();
      const blackoutsJson = await blackoutsRes.json();
      if (rulesJson.ok) setRules(rulesJson.data?.rules || []);
      if (blackoutsJson.ok) setBlackouts(blackoutsJson.data?.blackouts || []);
    } finally {
      setLoading(false);
    }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/guide/availability-preview?dateFrom=${previewDateFrom}&dateTo=${previewDateTo}&timezone=Asia/Taipei`);
      const json = await res.json();
      if (json.ok) setPreviewSlots(json.data?.slots || []);
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    void loadData();
    void loadPreview();
  }, []);

  const openRuleModal = (rule?: AvailabilityRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        weekday: rule.weekday,
        start_time_local: rule.start_time_local,
        end_time_local: rule.end_time_local,
        timezone: rule.timezone,
        slot_interval_minutes: rule.slot_interval_minutes,
        buffer_before_minutes: rule.buffer_before_minutes,
        buffer_after_minutes: rule.buffer_after_minutes,
        is_active: rule.is_active,
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        weekday: 1,
        start_time_local: '09:00',
        end_time_local: '17:00',
        timezone: 'Asia/Taipei',
        slot_interval_minutes: 60,
        buffer_before_minutes: 15,
        buffer_after_minutes: 15,
        is_active: true,
      });
    }
    setError('');
    setShowRuleModal(true);
  };

  const saveRule = async () => {
    setSaving(true);
    setError('');
    try {
      const url = editingRule ? `/api/guide/availability-rules/${editingRule.id}` : '/api/guide/availability-rules';
      const method = editingRule ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(ruleForm),
      });
      const json = await res.json();
      if (json.ok) {
        setShowRuleModal(false);
        await loadData();
        await loadPreview();
      } else {
        setError(json.error?.message || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('確定要刪除此時段規則嗎？')) return;
    await fetch(`/api/guide/availability-rules/${ruleId}`, { method: 'DELETE', headers: csrfHeaders() });
    await loadData();
    await loadPreview();
  };

  const openBlackoutModal = (blackout?: BlackoutDate) => {
    if (blackout) {
      setEditingBlackout(blackout);
      setBlackoutForm({
        starts_at: new Date(blackout.starts_at).toISOString().slice(0, 16),
        ends_at: new Date(blackout.ends_at).toISOString().slice(0, 16),
        reason: blackout.reason || '',
      });
    } else {
      setEditingBlackout(null);
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      setBlackoutForm({
        starts_at: now.toISOString().slice(0, 16),
        ends_at: tomorrow.toISOString().slice(0, 16),
        reason: '',
      });
    }
    setError('');
    setShowBlackoutModal(true);
  };

  const saveBlackout = async () => {
    setSaving(true);
    setError('');
    try {
      const url = editingBlackout ? `/api/guide/blackout-dates/${editingBlackout.id}` : '/api/guide/blackout-dates';
      const method = editingBlackout ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          starts_at: new Date(blackoutForm.starts_at).toISOString(),
          ends_at: new Date(blackoutForm.ends_at).toISOString(),
          reason: blackoutForm.reason || null,
          source: 'manual',
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setShowBlackoutModal(false);
        await loadData();
        await loadPreview();
      } else {
        setError(json.error?.message || '儲存失敗');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteBlackout = async (blackoutId: string) => {
    if (!confirm('確定要刪除此休假時段嗎？')) return;
    await fetch(`/api/guide/blackout-dates/${blackoutId}`, { method: 'DELETE', headers: csrfHeaders() });
    await loadData();
    await loadPreview();
  };

  const rulesByWeekday = rules.reduce((acc, rule) => {
    if (!acc[rule.weekday]) acc[rule.weekday] = [];
    acc[rule.weekday].push(rule);
    return acc;
  }, {} as Record<number, AvailabilityRule[]>);

  const slotsByDate = previewSlots.reduce((acc, slot) => {
    const date = slot.startAt.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, PreviewSlot[]>);

  return (
    <div className="tp-guide-grid">
      <section className="tp-guide-hero">
        <p className="tp-guide-kicker">guide availability</p>
        <h1>把可帶團的時間規則，收成一眼看懂的排班台。</h1>
        <p>
          這頁保留原本時段規則、休假黑名單與 preview API 行為，只把整個時間管理改成與 guide shell 一致的配置。
        </p>
      </section>

      {showRuleModal && (
        <div className="tp-guide-overlay" onClick={() => setShowRuleModal(false)}>
          <div className="tp-guide-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-guide-modal-head">
              <div>
                <p className="tp-guide-kicker">rule editor</p>
                <h2 style={{ marginBottom: 6 }}>{editingRule ? '編輯時段規則' : '新增時段規則'}</h2>
              </div>
              <button type="button" className="tp-guide-action-btn" onClick={() => setShowRuleModal(false)}>關閉</button>
            </div>
            <div className="tp-guide-form">
              <div className="tp-guide-field">
                <label>星期</label>
                <select className="tp-guide-select" value={ruleForm.weekday} onChange={(e) => setRuleForm({ ...ruleForm, weekday: Number(e.target.value) })}>
                  {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                </select>
              </div>
              <div className="tp-guide-form-row">
                <div className="tp-guide-field">
                  <label>開始時間</label>
                  <input className="tp-guide-input" type="time" value={ruleForm.start_time_local} onChange={(e) => setRuleForm({ ...ruleForm, start_time_local: e.target.value })} />
                </div>
                <div className="tp-guide-field">
                  <label>結束時間</label>
                  <input className="tp-guide-input" type="time" value={ruleForm.end_time_local} onChange={(e) => setRuleForm({ ...ruleForm, end_time_local: e.target.value })} />
                </div>
              </div>
              <div className="tp-guide-form-row">
                <div className="tp-guide-field">
                  <label>時段間隔（分鐘）</label>
                  <input className="tp-guide-input" type="number" min={15} step={15} value={ruleForm.slot_interval_minutes} onChange={(e) => setRuleForm({ ...ruleForm, slot_interval_minutes: Number(e.target.value) })} />
                </div>
                <div className="tp-guide-field">
                  <label>緩衝時間（分鐘）</label>
                  <input className="tp-guide-input" type="number" min={0} step={5} value={ruleForm.buffer_before_minutes} onChange={(e) => setRuleForm({ ...ruleForm, buffer_before_minutes: Number(e.target.value), buffer_after_minutes: Number(e.target.value) })} />
                </div>
              </div>
              <label className="tp-guide-choice" style={{ justifyContent: 'flex-start' }}>
                <input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })} />
                啟用此規則
              </label>
              {error && <div className="tp-guide-status danger">⚠️ {error}</div>}
              <div className="tp-guide-actions-row">
                <button type="button" className="tp-btn tp-btn-primary" onClick={saveRule} disabled={saving}>{saving ? '儲存中…' : '儲存規則'}</button>
                <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowRuleModal(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBlackoutModal && (
        <div className="tp-guide-overlay" onClick={() => setShowBlackoutModal(false)}>
          <div className="tp-guide-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-guide-modal-head">
              <div>
                <p className="tp-guide-kicker">blackout editor</p>
                <h2 style={{ marginBottom: 6 }}>{editingBlackout ? '編輯休假時段' : '新增休假時段'}</h2>
              </div>
              <button type="button" className="tp-guide-action-btn" onClick={() => setShowBlackoutModal(false)}>關閉</button>
            </div>
            <div className="tp-guide-form">
              <div className="tp-guide-field">
                <label>開始時間</label>
                <input className="tp-guide-input" type="datetime-local" value={blackoutForm.starts_at} onChange={(e) => setBlackoutForm({ ...blackoutForm, starts_at: e.target.value })} />
              </div>
              <div className="tp-guide-field">
                <label>結束時間</label>
                <input className="tp-guide-input" type="datetime-local" value={blackoutForm.ends_at} onChange={(e) => setBlackoutForm({ ...blackoutForm, ends_at: e.target.value })} />
              </div>
              <div className="tp-guide-field">
                <label>原因（選填）</label>
                <input className="tp-guide-input" type="text" value={blackoutForm.reason} onChange={(e) => setBlackoutForm({ ...blackoutForm, reason: e.target.value })} placeholder="例：私人行程" />
              </div>
              {error && <div className="tp-guide-status danger">⚠️ {error}</div>}
              <div className="tp-guide-actions-row">
                <button type="button" className="tp-btn tp-btn-primary" onClick={saveBlackout} disabled={saving}>{saving ? '儲存中…' : editingBlackout ? '更新休假' : '新增休假'}</button>
                <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowBlackoutModal(false)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="tp-guide-empty">載入時間管理資料中…</div>
      ) : (
        <>
          <section className="tp-guide-panel">
            <div className="tp-guide-data-top">
              <div>
                <h2>每週可預約時段</h2>
                <div className="tp-guide-meta">設定每週固定可接單的日期與時段。</div>
              </div>
              <button type="button" className="tp-btn tp-btn-primary" onClick={() => openRuleModal()}>+ 新增時段</button>
            </div>
            <div className="tp-guide-grid cols-3" style={{ marginTop: 18 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <div key={day} className="tp-guide-data-card">
                  <strong style={{ color: day === 0 || day === 6 ? '#b42318' : undefined }}>{WEEKDAY_LABELS[day]}</strong>
                  <div className="tp-guide-card-list" style={{ marginTop: 12 }}>
                    {rulesByWeekday[day]?.length ? rulesByWeekday[day].map((rule) => (
                      <div key={rule.id} className="tp-guide-banner">
                        <div className="tp-guide-meta">{rule.start_time_local} - {rule.end_time_local}</div>
                        <div className="tp-guide-meta">間隔 {rule.slot_interval_minutes} 分鐘 · 緩衝 {rule.buffer_before_minutes} 分鐘</div>
                        <div className="tp-guide-actions-row">
                          <button type="button" className="tp-btn tp-btn-ghost" onClick={() => openRuleModal(rule)}>編輯</button>
                          <button type="button" className="tp-btn tp-btn-ghost" onClick={() => deleteRule(rule.id)}>刪除</button>
                        </div>
                      </div>
                    )) : <div className="tp-guide-empty">無時段</div>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="tp-guide-grid cols-2" style={{ alignItems: 'start' }}>
            <div className="tp-guide-panel">
              <div className="tp-guide-data-top">
                <div>
                  <h2>休假 / 不可預約時段</h2>
                  <div className="tp-guide-meta">設定特定日期不可接單的時間區間。</div>
                </div>
                <button type="button" className="tp-btn tp-btn-primary" onClick={() => openBlackoutModal()}>+ 新增休假</button>
              </div>
              <div className="tp-guide-card-list" style={{ marginTop: 18 }}>
                {blackouts.length ? blackouts.map((item) => (
                  <article key={item.id} className="tp-guide-data-card">
                    <div className="tp-guide-data-top">
                      <div>
                        <strong>{new Date(item.starts_at).toLocaleString('zh-TW')} → {new Date(item.ends_at).toLocaleString('zh-TW')}</strong>
                        {item.reason && <div className="tp-guide-meta">{item.reason}</div>}
                      </div>
                      <span className={`tp-guide-status ${item.source === 'manual' ? 'warning' : 'neutral'}`}>{item.source === 'manual' ? '手動設定' : '系統設定'}</span>
                    </div>
                    <div className="tp-guide-actions-row">
                      <button type="button" className="tp-btn tp-btn-ghost" onClick={() => openBlackoutModal(item)}>編輯</button>
                      <button type="button" className="tp-btn tp-btn-ghost" onClick={() => deleteBlackout(item.id)}>刪除</button>
                    </div>
                  </article>
                )) : <div className="tp-guide-empty">尚無休假設定</div>}
              </div>
            </div>

            <div className="tp-guide-panel">
              <div className="tp-guide-data-top">
                <div>
                  <h2>時段預覽</h2>
                  <div className="tp-guide-meta">檢查系統根據規則產生的可預約時間。</div>
                </div>
                <div className="tp-guide-actions-row" style={{ marginTop: 0 }}>
                  <input className="tp-guide-input" type="date" value={previewDateFrom} onChange={(e) => setPreviewDateFrom(e.target.value)} style={{ maxWidth: 160 }} />
                  <input className="tp-guide-input" type="date" value={previewDateTo} onChange={(e) => setPreviewDateTo(e.target.value)} style={{ maxWidth: 160 }} />
                  <button type="button" className="tp-btn tp-btn-primary" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? '更新中…' : '更新預覽'}</button>
                </div>
              </div>
              <div className="tp-guide-card-list" style={{ marginTop: 18 }}>
                {previewSlots.length ? Object.entries(slotsByDate).map(([date, slots]) => {
                  const dayOfWeek = new Date(date).getDay();
                  return (
                    <article key={date} className="tp-guide-data-card">
                      <strong>{date}（週{WEEKDAYS[dayOfWeek]}）</strong>
                      <div className="tp-guide-actions-row">
                        {slots.map((slot, idx) => (
                          <span key={idx} className={`tp-guide-status ${slot.isAvailable ? 'success' : 'neutral'}`}>
                            {new Date(slot.startAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                }) : <div className="tp-guide-empty">此期間無可用時段</div>}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
