'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { GuideSearch } from '../../../../../src/components/admin/GuideSearch';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';

// ── 方案型別 ──────────────────────────────────────────────
interface PlanConfig {
  id: string;
  label: string;
  duration: string;
  priceMultiplier: number;
  highlights: string[];
  detailsLinkText: string;
  bookingBtnText: string;
}

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 'half-day',
    label: 'A. 半日行程',
    duration: '約 4 小時',
    priceMultiplier: 1,
    highlights: ['最早出發前 1 天可預訂', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
  {
    id: 'full-day',
    label: 'B. 全日行程',
    duration: '約 8 小時',
    priceMultiplier: 1.6,
    highlights: ['午餐含餐（在地餐廳）', '免費取消（72 小時前）', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
];

// ── 單一方案編輯 ──────────────────────────────────────────
function PlanEditor({
  plan,
  index,
  onChange,
  onRemove,
}: {
  plan: PlanConfig;
  index: number;
  onChange: (updated: PlanConfig) => void;
  onRemove: () => void;
}) {
  const update = (patch: Partial<PlanConfig>) => onChange({ ...plan, ...patch });

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16,
      background: '#fafafa',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>方案 {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: '#fee2e2', color: '#991b1b', border: 'none',
            padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          刪除方案
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          方案 ID（唯一識別，英文）
          <input
            type="text" value={plan.id}
            onChange={e => update({ id: e.target.value })}
            style={fieldStyle} placeholder="half-day"
          />
        </label>
        <label style={labelStyle}>
          方案名稱
          <input
            type="text" value={plan.label}
            onChange={e => update({ label: e.target.value })}
            style={fieldStyle} placeholder="A. 半日行程"
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          時長文字
          <input
            type="text" value={plan.duration}
            onChange={e => update({ duration: e.target.value })}
            style={fieldStyle} placeholder="約 4 小時"
          />
        </label>
        <label style={labelStyle}>
          價格倍數（相對基礎價格）
          <input
            type="number" value={plan.priceMultiplier}
            onChange={e => update({ priceMultiplier: parseFloat(e.target.value) || 1 })}
            min={0.1} step={0.1} style={fieldStyle}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={labelStyle}>
          「查看詳情」連結文字
          <input
            type="text" value={plan.detailsLinkText}
            onChange={e => update({ detailsLinkText: e.target.value })}
            style={fieldStyle} placeholder="查看方案詳情 ›"
          />
        </label>
        <label style={labelStyle}>
          預約按鈕文字
          <input
            type="text" value={plan.bookingBtnText}
            onChange={e => update({ bookingBtnText: e.target.value })}
            style={fieldStyle} placeholder="立即預約"
          />
        </label>
      </div>

      <label style={labelStyle}>
        亮點列表（每行一項）
        <textarea
          value={plan.highlights.join('\n')}
          onChange={e => update({ highlights: e.target.value.split('\n') })}
          rows={5} style={fieldStyle}
          placeholder={'最早出發前 1 天可預訂\n免費取消（72 小時前）\n實名認證導遊帶領'}
        />
      </label>
    </div>
  );
}

// ── 方案管理 Section ──────────────────────────────────────
function PlansSection({
  plans,
  activityId,
  onChange,
}: {
  plans: PlanConfig[];
  activityId: string;
  onChange: (plans: PlanConfig[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  async function savePlans() {
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans }),
      });
      const json = await res.json();
      if (json.ok) { setSaveMsg('✅ 方案已儲存'); setTimeout(() => setSaveMsg(''), 3000); }
      else setSaveMsg('❌ ' + (json.error?.message || '儲存失敗'));
    } catch { setSaveMsg('❌ 網路錯誤'); }
    finally { setSaving(false); }
  }
  function addPlan() {
    onChange([...plans, {
      id: `plan-${Date.now()}`,
      label: '',
      duration: '',
      priceMultiplier: 1,
      highlights: [],
      detailsLinkText: '查看方案詳情 ›',
      bookingBtnText: '立即預約',
    }]);
  }

  function updatePlan(index: number, updated: PlanConfig) {
    const next = [...plans];
    next[index] = updated;
    onChange(next);
  }

  function removePlan(index: number) {
    onChange(plans.filter((_, i) => i !== index));
  }

  function resetToDefault() {
    if (confirm('確定要重置為預設方案嗎？這會覆蓋目前的設定。')) {
      onChange(DEFAULT_PLANS);
    }
  }

  return (
    <Card style={{ padding: 28, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            📋 方案管理
            <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
              {plans.length} 個方案
            </span>
          </h3>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
            管理 Activities 頁面中的「選擇方案」區塊文案
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={resetToDefault}
            style={{
              background: '#f3f4f6', color: '#374151', border: 'none',
              padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}
          >
            重置預設
          </button>
          <button
            type="button"
            onClick={addPlan}
            style={{
              background: 'var(--tp-primary, #16a34a)', color: '#fff', border: 'none',
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            + 新增方案
          </button>
        </div>
      </div>

      {plans.length === 0 ? (
        <div style={{
          textAlign: 'center', color: '#9ca3af', padding: 32,
          border: '2px dashed #e5e7eb', borderRadius: 8,
        }}>
          目前無方案設定，點擊「+ 新增方案」或「重置預設」。
        </div>
      ) : (
        plans.map((plan, i) => (
          <PlanEditor
            key={plan.id + i}
            plan={plan}
            index={i}
            onChange={updated => updatePlan(i, updated)}
            onRemove={() => removePlan(i)}
          />
        ))
      )}

      {/* 儲存方案 */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={savePlans}
          disabled={saving}
          style={{
            background: '#1e40af', color: '#fff', border: 'none',
            padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? '儲存中⋯' : '💾 儲存方案設定'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.startsWith('✅') ? '#166534' : '#991b1b' }}>
            {saveMsg}
          </span>
        )}
      </div>
    </Card>
  );
}

const REGIONS = ['台北市', '高雄市', '花蓮縣', '台南市', '台中市', '南投縣', '宜蘭縣', '屏東縣'];
const CATEGORIES = [
  { value: 'outdoor', label: '戶外冒險' },
  { value: 'culture', label: '文化歷史' },
  { value: 'food',    label: '美食體驗' },
  { value: 'nature',  label: '自然生態' },
];

const fieldStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4,
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 16,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, margin: '24px 0 16px',
  paddingBottom: 8, borderBottom: '1px solid #f0f0f0',
};

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  draft:     { variant: 'warning', label: '草稿' },
  published: { variant: 'success', label: '已發佈' },
  archived:  { variant: 'default', label: '已封存' },
};

const SCHEDULE_STATUS_LABEL: Record<string, { bg: string; color: string; label: string }> = {
  open:      { bg: '#dcfce7', color: '#166534', label: '開放' },
  full:      { bg: '#fef9c3', color: '#854d0e', label: '額滿' },
  cancelled: { bg: '#fee2e2', color: '#991b1b', label: '關閉' },
};

interface Schedule {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId?: string | null;
  minParticipants?: number;
  guideNote?: string | null;
}

// ── 新增場次 Modal ──────────────────────────────────────
function AddScheduleModal({
  onClose, onAdded, activityId, availablePlans,
}: { onClose: () => void; onAdded: () => void; activityId: string; availablePlans: PlanConfig[] }) {
  const [selectedDates,   setSelectedDates]   = useState<string[]>([]);
  const [startHH,         setStartHH]         = useState('09:00');
  const [endHH,           setEndHH]           = useState('13:00');
  const [capacity,        setCapacity]        = useState('10');
  const [minParticipants, setMinParticipants] = useState('1');
  const [planId,          setPlanId]          = useState('');  // '' = 全部方案
  const [saving,          setSaving]          = useState(false);
  const [progress,        setProgress]        = useState('');
  const [err,             setErr]             = useState('');

  const today = new Date().toISOString().split('T')[0];

  function toggleDate(date: string) {
    setSelectedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date].sort()
    );
  }

  // Generate next 60 days as grid
  function buildDateGrid() {
    const days = [];
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      const mm = d.getMonth() + 1;
      const dd = d.getDate();
      const wd = WEEKDAYS[d.getDay()];
      const isSun = d.getDay() === 0;
      const isSat = d.getDay() === 6;
      days.push({ key, mm, dd, wd, isSun, isSat });
    }
    return days;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedDates.length === 0) return setErr('請選擇至少一個日期');
    setSaving(true); setErr(''); setProgress('');

    let ok = 0; let fail = 0;
    for (let i = 0; i < selectedDates.length; i++) {
      const date = selectedDates[i];
      setProgress(`新增中 ${i + 1}/${selectedDates.length}⋯`);
      try {
        const startAt = `${date}T${startHH}:00+08:00`;
        const endAt   = `${date}T${endHH}:00+08:00`;
        const res = await fetch(`/api/admin/activities/${activityId}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startAt, endAt,
            capacity: Number(capacity),
            minParticipants: Number(minParticipants) || 1,
            planId: planId || null,
            status: 'open',
          }),
        });
        const json = await res.json();
        if (json.ok) ok++; else fail++;
      } catch { fail++; }
    }

    setSaving(false); setProgress('');
    if (fail > 0) setErr(`⚠️ ${ok} 筆成功，${fail} 筆失敗（可能重複）`);
    onAdded();
    if (fail === 0) onClose();
  }

  const days = buildDateGrid();

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 560,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>📅 批次新增場次</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          可同時選擇多個日期，一次建立多筆場次
        </p>

        {err && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 日期批次選擇 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                選擇日期
                {selectedDates.length > 0 && (
                  <span style={{ marginLeft: 8, background: '#16a34a', color: '#fff', padding: '1px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                    已選 {selectedDates.length} 天
                  </span>
                )}
              </span>
              {selectedDates.length > 0 && (
                <button type="button" onClick={() => setSelectedDates([])}
                  style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                  清除全部
                </button>
              )}
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3,
              border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, maxHeight: 260, overflowY: 'auto',
            }}>
              {/* Week header */}
              {['日','一','二','三','四','五','六'].map(w => (
                <div key={w} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '2px 0', fontWeight: 600 }}>{w}</div>
              ))}
              {/* Empty cells for first week offset */}
              {(() => {
                const firstDay = new Date(days[0].key).getDay();
                return Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />);
              })()}
              {days.map(d => {
                const isSelected = selectedDates.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDate(d.key)}
                    style={{
                      padding: '4px 2px', borderRadius: 5, border: 'none',
                      background: isSelected ? '#16a34a' : 'transparent',
                      color: isSelected ? '#fff' : d.isSun ? '#ef4444' : d.isSat ? '#3b82f6' : '#374151',
                      cursor: 'pointer', fontSize: 12, fontWeight: isSelected ? 700 : 400,
                      outline: 'none',
                    }}
                  >
                    <div>{d.mm}/{d.dd}</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>週{d.wd}</div>
                  </button>
                );
              })}
            </div>

            {selectedDates.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
                已選：{selectedDates.map(d => d.slice(5).replace('-', '/')).join('、')}
              </div>
            )}
          </div>

          {/* 方案選擇 */}
          <label style={labelStyle}>
            適用方案
            <select value={planId} onChange={e => setPlanId(e.target.value)} style={fieldStyle}>
              <option value="">全部方案</option>
              {availablePlans.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              開始時間
              <input type="time" value={startHH} onChange={e => setStartHH(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              結束時間
              <input type="time" value={endHH} onChange={e => setEndHH(e.target.value)} style={fieldStyle} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              最大容量（人數）
              <input
                type="number" value={capacity} onChange={e => setCapacity(e.target.value)}
                min={1} max={100} style={fieldStyle}
              />
            </label>
            <label style={labelStyle}>
              最低成團人數
              <input
                type="number" value={minParticipants} onChange={e => setMinParticipants(e.target.value)}
                min={1} max={50} style={fieldStyle}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center' }}>
            {progress && <span style={{ fontSize: 13, color: '#16a34a' }}>{progress}</span>}
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              取消
            </button>
            <button type="submit" disabled={saving || selectedDates.length === 0}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'var(--tp-primary, #16a34a)', color: '#fff',
                fontWeight: 700, fontSize: 14,
                cursor: (saving || selectedDates.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (saving || selectedDates.length === 0) ? 0.6 : 1,
              }}>
              {saving ? progress || '新增中⋯' : `確認新增 ${selectedDates.length > 0 ? `(${selectedDates.length} 天)` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 場次管理 Section ─────────────────────────────────────
function ScheduleSection({ activityId, availablePlans }: { activityId: string; availablePlans: PlanConfig[] }) {
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [loading,   setLoading]         = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editCap,   setEditCap]         = useState('');
  const [editSt,    setEditSt]          = useState('');
  const [schedErr,  setSchedErr]        = useState('');
  const [schedOk,   setSchedOk]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/schedules`);
      const json = await res.json();
      setSchedules(json.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [activityId]);

  useEffect(() => { load(); }, [load]);

  function fmtDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  async function handleUpdate(id: string) {
    setSchedErr(''); setSchedOk('');
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity: Number(editCap), status: editSt }),
      });
      const json = await res.json();
      if (json.ok) { setSchedOk('✅ 已更新'); setEditingId(null); load(); }
      else setSchedErr(json.error?.message || '更新失敗');
    } catch { setSchedErr('網路錯誤'); }
  }

  async function handleDelete(id: string, bookedCount: number) {
    if (bookedCount > 0) {
      setSchedErr(`❌ 此場次已有 ${bookedCount} 筆訂單，無法刪除`);
      return;
    }
    if (!confirm('確認刪除此場次？')) return;
    setSchedErr(''); setSchedOk('');
    try {
      const res = await fetch(`/api/admin/schedules/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) { setSchedOk('✅ 場次已刪除'); load(); }
      else setSchedErr(json.error?.message || '刪除失敗');
    } catch { setSchedErr('網路錯誤'); }
  }

  function startEdit(s: Schedule) {
    setEditingId(s.id);
    setEditCap(String(s.capacity));
    setEditSt(s.status);
    setSchedErr(''); setSchedOk('');
  }

  return (
    <Card style={{ padding: 28, marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
          📅 場次管理
          <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
            {schedules.length} 場
          </span>
        </h3>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: 'var(--tp-primary, #16a34a)', color: '#fff',
            padding: '8px 16px', borderRadius: 8, border: 'none',
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>
          + 新增場次
        </button>
      </div>

      {schedErr && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{schedErr}</div>}
      {schedOk  && <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{schedOk}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>載入中⋯</div>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, border: '2px dashed #e5e7eb', borderRadius: 8 }}>
          尚無場次。點擊「+ 新增場次」建立第一個場次。
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['方案', '日期', '時段', '容量', '已訂 / 剩餘', '狀態', '操作'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => {
                const st = SCHEDULE_STATUS_LABEL[s.status] || SCHEDULE_STATUS_LABEL.open;
                const isEditing = editingId === s.id;
                const remaining = s.capacity - s.bookedCount;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {s.planId
                        ? (availablePlans.find(p => p.id === s.planId)?.label || s.planId)
                        : <span style={{ color: '#9ca3af' }}>全部</span>}
                    </td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(s.startAt)}</td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap', color: '#6b7280' }}>
                      {fmtTime(s.startAt)} – {fmtTime(s.endAt)}
                    </td>

                    {/* 容量（inline 編輯） */}
                    <td style={{ padding: '12px' }}>
                      {isEditing ? (
                        <input
                          type="number" value={editCap} onChange={e => setEditCap(e.target.value)}
                          min={s.bookedCount} style={{ width: 64, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                        />
                      ) : s.capacity}
                    </td>

                    {/* 已訂 / 剩餘 */}
                    <td style={{ padding: '12px', color: remaining === 0 ? '#ef4444' : remaining <= 2 ? '#f59e0b' : '#16a34a', fontWeight: 600 }}>
                      {s.bookedCount} / {remaining}
                    </td>

                    {/* 狀態（inline 編輯） */}
                    <td style={{ padding: '12px' }}>
                      {isEditing ? (
                        <select value={editSt} onChange={e => setEditSt(e.target.value)}
                          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                          <option value="open">開放</option>
                          <option value="cancelled">關閉</option>
                        </select>
                      ) : (
                        <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                          {st.label}
                        </span>
                      )}
                    </td>

                    {/* 操作 */}
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleUpdate(s.id)}
                            style={{ padding: '4px 12px', background: '#dcfce7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            儲存
                          </button>
                          <button onClick={() => setEditingId(null)}
                            style={{ padding: '4px 10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                            取消
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(s)}
                            style={{ padding: '4px 12px', background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(s.id, s.bookedCount)}
                            title={s.bookedCount > 0 ? `已有 ${s.bookedCount} 筆訂單，無法刪除` : '刪除此場次'}
                            style={{
                              padding: '4px 12px', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              background: s.bookedCount > 0 ? '#f3f4f6' : '#fee2e2',
                              color: s.bookedCount > 0 ? '#9ca3af' : '#991b1b',
                            }}>
                            刪除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddScheduleModal
          activityId={activityId}
          availablePlans={availablePlans}
          onClose={() => setShowModal(false)}
          onAdded={() => { load(); setSchedOk('✅ 場次新增成功'); }}
        />
      )}
    </Card>
  );
}

// ── 主頁面 ────────────────────────────────────────────────
export default function AdminActivityEditPage() {
  const router = useRouter();
  const params = useParams();
  const activityId = params.id as string;

  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  // Form state
  const [title,              setTitle]              = useState('');
  const [guideSlug,          setGuideSlug]          = useState('');
  const [region,             setRegion]             = useState('');
  const [category,           setCategory]           = useState('');
  const [priceTwd,           setPriceTwd]           = useState('');
  const [durationMinutes,    setDurationMinutes]    = useState('');
  const [minParticipants,    setMinParticipants]    = useState('1');
  const [maxParticipants,    setMaxParticipants]    = useState('10');
  const [meetingPoint,       setMeetingPoint]       = useState('');
  const [meetingPointMapUrl, setMeetingPointMapUrl] = useState('');
  const [coverImageUrl,      setCoverImageUrl]      = useState('');
  const [imageUrls,          setImageUrls]          = useState<string[]>([]);
  const [description,        setDescription]        = useState('');
  const [shortDescription,   setShortDescription]   = useState('');
  const [tagline,            setTagline]            = useState('');
  const [inclusions,         setInclusions]         = useState('');
  const [exclusions,         setExclusions]         = useState('');
  const [notices,            setNotices]            = useState('');
  const [refundRules,        setRefundRules]        = useState('');
  const [safetyNotice,       setSafetyNotice]       = useState('');
  const [goodFor,            setGoodFor]            = useState('');
  const [socialProofQuotes,  setSocialProofQuotes]  = useState('');
  const [faq,                setFaq]                = useState<Array<{q:string;a:string}>>([]);
  const [itinerary,          setItinerary]          = useState<Array<{step:number;title:string;description:string;duration:string;icon:string}>>([]);
  const [status,             setStatus]             = useState('draft');
  const [plans,              setPlans]              = useState<PlanConfig[]>(DEFAULT_PLANS);

  useEffect(() => {
    if (!activityId) return;
    setLoading(true);
    fetch(`/api/admin/activities/${activityId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const d = json.data;
        if (!d) { setError('行程不存在'); setLoading(false); return; }
        setTitle(d.title || '');
        setGuideSlug(d.guideSlug || '');
        setRegion(d.region || '');
        setCategory(d.category || '');
        setPriceTwd(String(d.priceTwd || ''));
        setDurationMinutes(String(d.durationMinutes || ''));
        setMinParticipants(String(d.minParticipants || 1));
        setMaxParticipants(String(d.maxParticipants || 10));
        setMeetingPoint(d.meetingPoint || '');
        setMeetingPointMapUrl(d.meetingPointMapUrl || '');
        setCoverImageUrl(d.coverImageUrl || '');
        setImageUrls(d.imageUrls || []);
        setDescription(d.description || '');
        setShortDescription(d.shortDescription || '');
        setTagline(d.tagline || '');
        setInclusions((d.inclusions || []).join('\n'));
        setExclusions((d.exclusions || []).join('\n'));
        setNotices((d.notices || []).join('\n'));
        setRefundRules((d.refundRules || []).join('\n'));
        setSafetyNotice(d.safetyNotice || '');
        setGoodFor((d.goodFor || []).join('\n'));
        setSocialProofQuotes((d.socialProofQuotes || []).join('\n'));
        setFaq(d.faq || []);
        setItinerary(d.itinerary || []);
        setStatus(d.status || 'draft');
        // plans: use DB value if exists, otherwise default
        if (d.plans && Array.isArray(d.plans) && d.plans.length > 0) {
          setPlans(d.plans);
        } else {
          setPlans(DEFAULT_PLANS);
        }
        setLoading(false);
      })
      .catch(() => { setError('載入失敗'); setLoading(false); });
  }, [activityId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), guideSlug: guideSlug || undefined,
          region, category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          minParticipants: Number(minParticipants) || 1,
          maxParticipants: Number(maxParticipants) || 10,
          meetingPoint, meetingPointMapUrl, coverImageUrl,
          description, shortDescription, tagline,
          inclusions: toArray(inclusions), exclusions: toArray(exclusions),
          notices: toArray(notices), refundRules: toArray(refundRules),
          safetyNotice: safetyNotice.trim() || undefined,
          goodFor: toArray(goodFor),
          socialProofQuotes: toArray(socialProofQuotes),
          faq, itinerary,
          plans, imageUrls,
        }),
      });
      const json = await res.json();
      if (json.ok) setSuccess('✅ 儲存成功');
      else setError(json.error?.message || '更新失敗');
    } catch { setError('網路錯誤'); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(newStatus);
        setSuccess(`✅ 狀態已更新為「${STATUS_BADGE[newStatus]?.label || newStatus}」`);
      } else {
        setError(json.error?.message || '狀態更新失敗');
      }
    } catch { setError('網路錯誤'); }
    finally { setStatusBusy(false); }
  }

  if (loading) {
    return <><PageHeader title="編輯行程" /><div style={{ padding: 28 }}>載入中⋯</div></>;
  }

  const badge = STATUS_BADGE[status] || { variant: 'default' as const, label: status };

  return (
    <>
      <PageHeader
        title="編輯行程"
        subtitle={title}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {status === 'draft' && (
              <button onClick={() => handleStatusChange('published')} disabled={statusBusy}
                style={{ background: '#dcfce7', color: '#166534', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                🚀 發佈
              </button>
            )}
            {status === 'published' && (
              <button onClick={() => handleStatusChange('archived')} disabled={statusBusy}
                style={{ background: '#fee2e2', color: '#991b1b', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                📦 下架
              </button>
            )}
            {status === 'archived' && (
              <button onClick={() => handleStatusChange('draft')} disabled={statusBusy}
                style={{ background: '#dbeafe', color: '#1e40af', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                ✏️ 轉為草稿
              </button>
            )}
          </div>
        }
      />

      <div style={{ padding: '20px 28px', maxWidth: 800 }}>
        {error   && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>❌ {error}</div>}
        {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{success}</div>}

        {/* ── 基本資料表單 ── */}
        <Card style={{ padding: 28 }}>
          <form onSubmit={handleSave}>
            <h3 style={sectionTitle}>📝 基本資訊</h3>

            <label style={labelStyle}>
              行程名稱 *
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} required />
            </label>

            <label style={labelStyle}>
              導遊
              <GuideSearch
                value={guideSlug}
                onChange={(slug) => setGuideSlug(slug)}
                style={{ marginTop: 4 }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <label style={labelStyle}>
                地區
                <select value={region} onChange={e => setRegion(e.target.value)} style={fieldStyle}>
                  <option value="">選擇地區</option>
                  {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                類別
                <select value={category} onChange={e => setCategory(e.target.value)} style={fieldStyle}>
                  <option value="">選擇類別</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
            </div>

            <label style={labelStyle}>
              Tagline
              <input type="text" value={tagline} onChange={e => setTagline(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              短描述
              <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} rows={2} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              完整描述
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} style={fieldStyle} />
            </label>

            <h3 style={sectionTitle}>💰 定價與容量</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} min={0} style={fieldStyle} required />
              </label>
              <label style={labelStyle}>
                最少人數
                <input type="number" value={minParticipants} onChange={e => setMinParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
              <label style={labelStyle}>
                最多人數
                <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
            </div>
            <label style={labelStyle}>
              行程時長（分鐘）
              <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min={0} style={fieldStyle} />
            </label>

            <h3 style={sectionTitle}>📍 集合地點</h3>
            <label style={labelStyle}>
              集合地點
              <input type="text" value={meetingPoint} onChange={e => setMeetingPoint(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              地圖 URL
              <input type="url" value={meetingPointMapUrl} onChange={e => setMeetingPointMapUrl(e.target.value)} style={fieldStyle} />
            </label>

            <h3 style={sectionTitle}>🖼️ 圖片</h3>
            <label style={{ ...labelStyle, marginBottom: 8 }}>封面圖</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="cover"
              currentUrl={coverImageUrl}
              onUpload={setCoverImageUrl}
            />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上封面圖 URL</label>
              <input
                type="url"
                value={coverImageUrl}
                onChange={e => setCoverImageUrl(e.target.value)}
                style={{ ...fieldStyle, fontSize: 13 }}
                placeholder="https://..."
              />
            </div>

            <label style={{ ...labelStyle, marginBottom: 8 }}>活動照片（Gallery）</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="gallery"
              currentUrls={imageUrls}
              onUpload={() => {}}
              onGalleryUpdate={setImageUrls}
            />

            <h3 style={sectionTitle}>📋 行程詳情</h3>
            <label style={labelStyle}>
              包含項目（每行一項）
              <textarea value={inclusions} onChange={e => setInclusions(e.target.value)} rows={4} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              不包含項目（每行一項）
              <textarea value={exclusions} onChange={e => setExclusions(e.target.value)} rows={3} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              注意事項（每行一項）
              <textarea value={notices} onChange={e => setNotices(e.target.value)} rows={3} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              退款規則（每行一項）
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} rows={3} style={fieldStyle} placeholder={'出發72小時前免費取消\n出發24小時內不退款'} />
            </label>
            <label style={labelStyle}>
              安全說明
              <textarea value={safetyNotice} onChange={e => setSafetyNotice(e.target.value)} rows={2} style={fieldStyle} placeholder="請確保攜帶個人藥品，行程含輕度步行" />
            </label>
            <label style={labelStyle}>
              適合對象（每行一項）
              <textarea value={goodFor} onChange={e => setGoodFor(e.target.value)} rows={3} style={fieldStyle} placeholder={'喜愛歷史文化\n家庭親子旅遊\n銀髮族友善'} />
            </label>
            <label style={labelStyle}>
              社群口碑語錄（每行一句）
              <textarea value={socialProofQuotes} onChange={e => setSocialProofQuotes(e.target.value)} rows={3} style={fieldStyle} placeholder={'超值行程，CP值超高！\n導遊非常專業親切'} />
            </label>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button type="submit" disabled={saving}
                style={{
                  background: 'var(--tp-primary, #16a34a)', color: '#fff',
                  padding: '12px 28px', borderRadius: 8, border: 'none',
                  fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}>
                {saving ? '儲存中⋯' : '儲存變更'}
              </button>
              <button type="button" onClick={() => router.push('/admin/activities')}
                style={{ background: '#f0f0f0', color: '#333', padding: '12px 28px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                返回列表
              </button>
            </div>
          </form>
        </Card>

        {/* ── 方案管理 ── */}
        <PlansSection plans={plans} activityId={activityId} onChange={setPlans} />

        {/* ── 行程時間表 Editor ── */}
        <Card style={{ marginTop: 24 }}>
          <h3 style={sectionTitle}>🗺 詳細行程時間表</h3>
          {itinerary.map((step, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input value={step.icon} onChange={e => { const s=[...itinerary]; s[i]={...s[i],icon:e.target.value}; setItinerary(s); }}
                  style={{ width: 48, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 20 }} placeholder="📍" />
                <input value={step.title} onChange={e => { const s=[...itinerary]; s[i]={...s[i],title:e.target.value}; setItinerary(s); }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="地點名稱" />
                <input value={step.duration} onChange={e => { const s=[...itinerary]; s[i]={...s[i],duration:e.target.value}; setItinerary(s); }}
                  style={{ width: 90, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px' }} placeholder="60分鐘" />
                <button type="button" onClick={() => setItinerary(itinerary.filter((_,j)=>j!==i))}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              <textarea value={step.description} onChange={e => { const s=[...itinerary]; s[i]={...s[i],description:e.target.value}; setItinerary(s); }}
                rows={2} style={{ ...fieldStyle, width: '100%' }} placeholder="景點描述（選填）" />
            </div>
          ))}
          <button type="button" onClick={() => setItinerary([...itinerary, { step: itinerary.length+1, title:'', description:'', duration:'', icon:'📍' }])}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%', marginBottom: 16 }}>
            + 新增行程點
          </button>
          {itinerary.length > 0 && (
            <button type="button" onClick={async () => {
              const res = await fetch(`/api/admin/activities/${activityId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itinerary }),
              });
              const json = await res.json();
              if (json.ok) alert('✅ 行程時間表已儲存');
              else alert('❌ 儲存失敗');
            }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              💾 儲存行程時間表
            </button>
          )}
        </Card>

        {/* ── FAQ Editor ── */}
        <Card style={{ marginTop: 24 }}>
          <h3 style={sectionTitle}>❓ 常見問題</h3>
          {faq.map((item, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={item.q} onChange={e => { const f=[...faq]; f[i]={...f[i],q:e.target.value}; setFaq(f); }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="問題" />
                <button type="button" onClick={() => setFaq(faq.filter((_,j)=>j!==i))}
                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              <textarea value={item.a} onChange={e => { const f=[...faq]; f[i]={...f[i],a:e.target.value}; setFaq(f); }}
                rows={2} style={{ ...fieldStyle, width: '100%' }} placeholder="回答" />
            </div>
          ))}
          <button type="button" onClick={() => setFaq([...faq, { q:'', a:'' }])}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%', marginBottom: 16 }}>
            + 新增 FAQ
          </button>
          {faq.length > 0 && (
            <button type="button" onClick={async () => {
              const res = await fetch(`/api/admin/activities/${activityId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faq }),
              });
              const json = await res.json();
              if (json.ok) alert('✅ FAQ 已儲存');
              else alert('❌ 儲存失敗');
            }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              💾 儲存 FAQ
            </button>
          )}
        </Card>

        {/* ── 場次管理 ── */}
        <ScheduleSection activityId={activityId} availablePlans={plans} />
      </div>
    </>
  );
}
