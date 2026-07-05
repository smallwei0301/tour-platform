'use client';

// 場次管理區塊（#1615 第二批）：自 app/admin/activities/[id]/edit/page.tsx 原樣拆出，
// 純結構搬移、零行為變更。包含「批次新增場次」Modal 與場次列表（inline 編輯／刪除）。
import { useEffect, useState, useCallback } from 'react';
import { csrfHeaders } from '../../../lib/csrf-client';
import { Card } from '../ui';
import { ResponsiveModal, FormGrid } from '../responsive';
import { addMinutesToHHMM } from '../../../lib/hhmm';
import { fieldStyle, labelStyle } from './form-styles';

// ── V2 方案型別（schedule modal 專用）─────────────────────
interface V2ActivityPlan {
  id: string;
  name: string;
  status: string;
  booking_type: string;
  base_price: number;
  // Capacity / participation defaults — issue #1196 precedence:
  // these are the canonical defaults; a schedule may override them
  // per-date when needed.
  min_participants?: number;
  max_participants?: number;
  // Issue #1213 — same precedence story for duration. The schedule's endAt
  // is computed from startAt + duration_minutes when a plan is picked; the
  // operator can still type over endHH after the seed.
  duration_minutes?: number;
}

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
}: { onClose: () => void; onAdded: () => void; activityId: string; availablePlans: V2ActivityPlan[] }) {
  const DEFAULT_START_HH = '09:00';
  const [selectedDates,   setSelectedDates]   = useState<string[]>([]);
  const [startHH,         setStartHH]         = useState(DEFAULT_START_HH);
  // Issue #1196: capacity/min defaults come from the selected V2 plan. When
  // exactly one plan is available it auto-applies, so we seed straight from
  // it; otherwise the seeded values get overwritten the moment the user
  // picks a plan (see useEffect below).
  // Issue #1213 adds duration_minutes to the same precedence — endHH is
  // seeded from `startHH + plan.duration_minutes` when the plan is known.
  const initialPlan = availablePlans.length === 1 ? availablePlans[0] : undefined;
  const initialEndHH = initialPlan?.duration_minutes
    ? addMinutesToHHMM(DEFAULT_START_HH, initialPlan.duration_minutes)
    : '13:00';
  const [endHH,           setEndHH]           = useState(initialEndHH);
  const [capacity,        setCapacity]        = useState(
    initialPlan?.max_participants ? String(initialPlan.max_participants) : '10',
  );
  const [minParticipants, setMinParticipants] = useState(
    initialPlan?.min_participants ? String(initialPlan.min_participants) : '1',
  );
  const [planId,          setPlanId]          = useState(initialPlan?.id ?? '');
  const [saving,          setSaving]          = useState(false);
  const [progress,        setProgress]        = useState('');
  const [err,             setErr]             = useState('');

  // When the operator switches the plan dropdown (≥2 plans), re-seed:
  //   - capacity / min participants (#1196)
  //   - endHH from `startHH + duration_minutes` (#1213, option A — plan
  //     drives endHH; later edits to startHH alone don't re-derive endHH
  //     since the operator may have intentionally tuned it).
  // Operators can still type over any of these fields.
  const selectedPlan = availablePlans.find((p) => p.id === planId);
  useEffect(() => {
    if (!selectedPlan) return;
    if (selectedPlan.max_participants) setCapacity(String(selectedPlan.max_participants));
    if (selectedPlan.min_participants) setMinParticipants(String(selectedPlan.min_participants));
    if (selectedPlan.duration_minutes) {
      setEndHH(addMinutesToHHMM(startHH, selectedPlan.duration_minutes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  // 固定場次只適用「排程預約」方案;即時／申請預約走導遊動態可預約規則,
  // 不該建立固定場次(會看不到又無效)。選到這類方案時擋下並提示。
  const planNotScheduled = Boolean(
    selectedPlan && selectedPlan.booking_type && selectedPlan.booking_type !== 'scheduled',
  );

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
    // Require explicit plan selection when ≥2 active plans
    if (availablePlans.length >= 2 && !planId) return setErr('方案有多個，請選擇適用方案');
    if (planNotScheduled) return setErr('固定場次僅適用「排程預約」方案。即時／申請預約請改用導遊可預約時段規則。');
    setSaving(true); setErr(''); setProgress('');

    let ok = 0; let fail = 0;
    let lastErrMsg = '';
    for (let i = 0; i < selectedDates.length; i++) {
      const date = selectedDates[i];
      setProgress(`新增中 ${i + 1}/${selectedDates.length}⋯`);
      try {
        const startAt = `${date}T${startHH}:00+08:00`;
        const endAt   = `${date}T${endHH}:00+08:00`;
        const res = await fetch(`/api/v2/admin/activities/${activityId}/schedules`, {
          method: 'POST',
          headers: csrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            startAt, endAt,
            capacity: Number(capacity),
            minParticipants: Number(minParticipants) || 1,
            planId: planId || null,
            status: 'open',
          }),
        });
        const json = await res.json();
        if (json.ok) {
          ok++;
        } else {
          fail++;
          lastErrMsg = json.error?.message || '新增失敗';
        }
      } catch { fail++; }
    }

    setSaving(false); setProgress('');
    if (fail > 0) {
      setErr(lastErrMsg
        ? `⚠️ ${ok} 筆成功，${fail} 筆失敗：${lastErrMsg}`
        : `⚠️ ${ok} 筆成功，${fail} 筆失敗（可能重複）`
      );
    }
    onAdded();
    if (fail === 0) onClose();
  }

  const days = buildDateGrid();

  return (
    <ResponsiveModal open={true} onClose={onClose} size="md" title="📅 批次新增場次">
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
          可同時選擇多個日期，一次建立多筆場次
        </p>

        {/* ── Availability Precedence Helper ── */}
        <div
          data-testid="admin-availability-precedence-helper"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#f9fafb',
            fontSize: 12,
            color: '#374151',
            lineHeight: 1.8,
          }}
        >
          <span style={{ fontWeight: 700 }}>可預約狀態優先順序：</span>
          <span style={{ marginLeft: 6 }}>
            方案狀態（未啟用）&gt; 開放季節（季節外）&gt; 時段規則（規則外）&gt; 黑名單/衝突（封鎖）&gt; 可預約
          </span>
          <div style={{ marginTop: 4, color: '#6b7280' }}>
            場次可訂狀態由上述優先順序決定。activity_schedules 與指定日期場次不會略過導遊／資源衝突；如遇既有預約衝突，請改到導遊時間管理預覽後使用「例外開放此場」，並留下原因與備註。
          </div>
        </div>

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

          {/* 方案選擇（V2 activity_plans）
              ─ 0 plans: blocking message, no dropdown, submit disabled
              ─ 1 plan:  auto-apply display, no 全部方案 option
              ─ ≥2 plans: required selection, no 全部方案 option            */}
          {availablePlans.length === 0 ? (
            <div style={{
              background: '#fef9c3', color: '#78350f',
              border: '1px solid #fde68a',
              padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16,
            }}>
              此活動沒有可用的 V2 方案，請先到方案管理建立並啟用方案。
            </div>
          ) : availablePlans.length === 1 ? (
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>適用方案</span>
              <div style={{
                background: '#f0fdf4', color: '#166534',
                border: '1px solid #bbf7d0',
                padding: '8px 12px', borderRadius: 8, fontSize: 13,
              }}>
                {/* Issue #1213: surface base_price next to the name so
                    operators can sanity-check which plan they're booking
                    to — especially helpful when names are similar. */}
                將自動套用：{availablePlans[0].name}
                {Number.isFinite(availablePlans[0].base_price) && (
                  <span style={{ marginLeft: 6, color: '#15803d' }}>
                    （每人 NT$ {availablePlans[0].base_price.toLocaleString()}）
                  </span>
                )}
              </div>
            </div>
          ) : (
            <label style={labelStyle}>
              適用方案
              <select value={planId} onChange={e => setPlanId(e.target.value)} style={fieldStyle}>
                <option value="">— 請選擇方案 —</option>
                {availablePlans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {/* Issue #1213: echo the chosen plan's price so the operator
                  can verify they picked the right one. Empty span keeps
                  the layout from jumping. */}
              <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#6b7280', minHeight: 16 }}>
                {selectedPlan && Number.isFinite(selectedPlan.base_price)
                  ? `每人 NT$ ${selectedPlan.base_price.toLocaleString()}`
                  : ' '}
              </span>
            </label>
          )}

          {planNotScheduled && (
            <div
              data-testid="schedule-booking-type-warning"
              style={{
                background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
                padding: '10px 14px', borderRadius: 8, fontSize: 13, margin: '0 0 16px', lineHeight: 1.8,
              }}
            >
              固定場次僅適用「<strong>排程預約</strong>」方案。此方案為「{selectedPlan?.booking_type === 'request' ? '申請預約' : '即時預約'}」，請改用導遊「時間管理」的可預約時段規則，不需建立固定場次。
            </div>
          )}

          <FormGrid cols={2} gap={12}>
            <label style={labelStyle}>
              開始時間
              <input type="time" value={startHH} onChange={e => setStartHH(e.target.value)} style={fieldStyle} />
            </label>
            <label style={labelStyle}>
              結束時間
              <input type="time" value={endHH} onChange={e => setEndHH(e.target.value)} style={fieldStyle} />
            </label>
          </FormGrid>

          <FormGrid cols={2} gap={12}>
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
          </FormGrid>
          {/* Issue #1196: explain field precedence — plan provides defaults,
              schedule can override per-date. */}
          <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
            容量預設取自方案<span style={{ fontWeight: 600 }}>{selectedPlan ? `「${selectedPlan.name}」` : ''}</span>的最多人數；如需單日不同容量或最低成團，在此調整即會覆蓋該日場次設定，導遊亦可於後台「場次管理」調整例外容量。
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {progress && <span style={{ fontSize: 13, color: '#16a34a' }}>{progress}</span>}
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              取消
            </button>
            <button type="submit" disabled={saving || selectedDates.length === 0 || availablePlans.length === 0 || planNotScheduled}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'var(--tp-primary, #16a34a)', color: '#fff',
                fontWeight: 700, fontSize: 14,
                cursor: (saving || selectedDates.length === 0 || availablePlans.length === 0 || planNotScheduled) ? 'not-allowed' : 'pointer',
                opacity: (saving || selectedDates.length === 0 || availablePlans.length === 0 || planNotScheduled) ? 0.6 : 1,
              }}>
              {saving ? progress || '新增中⋯' : `確認新增 ${selectedDates.length > 0 ? `(${selectedDates.length} 天)` : ''}`}
            </button>
          </div>
        </form>
    </ResponsiveModal>
  );
}

// ── 場次管理 Section ─────────────────────────────────────
export function ScheduleSection({ activityId }: { activityId: string }) {
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [loading,   setLoading]         = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editCap,   setEditCap]         = useState('');
  const [editSt,    setEditSt]          = useState('');
  const [schedErr,  setSchedErr]        = useState('');
  const [schedOk,   setSchedOk]         = useState('');

  // V2 plans fetch — used exclusively for the schedule modal dropdown.
  // 方案一律於「方案管理」(V2) 維護；本頁不再有 legacy plans 編輯流程。
  const [v2Plans, setV2Plans] = useState<V2ActivityPlan[]>([]);
  useEffect(() => {
    fetch(`/api/v2/admin/activities/${activityId}/plans`)
      .then(r => r.json())
      .then(d => {
        if (d?.data?.plans) setV2Plans(d.data.plans);
      })
      .catch(() => {});
  }, [activityId]);
  const activePlans = v2Plans.filter(p => p.status === 'active');

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
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
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
      const res = await fetch(`/api/admin/schedules/${id}`, { method: 'DELETE', headers: csrfHeaders() });
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
                  <th key={h} scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
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
                        ? (v2Plans.find(p => p.id === s.planId)?.name || s.planId)
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
                          aria-label="容量"
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
          availablePlans={activePlans}
          onClose={() => setShowModal(false)}
          onAdded={() => { load(); setSchedOk('✅ 場次新增成功'); }}
        />
      )}
    </Card>
  );
}
