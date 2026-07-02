'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { ResponsiveModal, FormGrid } from '../../../../../src/components/admin/responsive';
import { GuideSearch } from '../../../../../src/components/admin/GuideSearch';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';
import { GalleryReorder } from '../../../../../src/components/admin/GalleryReorder';
import { buildActivityHref, normalizeRegionSlug } from '../../../../../src/lib/activity-url';
import { normalizeSocialProofQuotes } from '../../../../../src/lib/social-proof-quotes.mjs';
import { REGION_REGISTRY } from '../../../../../src/lib/region-slugs.mjs';
// 四大分類下拉：與 badge／篩選同源（category-tags.mjs），三處編輯器共用不重複定義。
import { CATEGORY_OPTIONS as CATEGORIES } from '../../../../../src/lib/category-tags.mjs';

type SocialProofQuoteRow = { author: string; rating: number; text: string; photos?: string[] };
import { addMinutesToHHMM } from '../../../../../src/lib/hhmm';

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


// 地區清單與 slug 對照以 region-slugs.mjs 的 REGION_REGISTRY 為單一真實來源，
// 涵蓋全台 18 縣市（過去硬編 8 個且 slug 對照另寫一份，易 drift／漏對應）。
const REGIONS: string[] = Object.values(REGION_REGISTRY).map(r => r.dbValue);
const REGION_SLUG_MAP: Record<string, string> = Object.fromEntries(
  Object.values(REGION_REGISTRY).map(r => [r.dbValue, r.slug]),
);
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
                  : ' '}
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
function ScheduleSection({ activityId }: { activityId: string }) {
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
  // 附加地區（複選）：行程除主要地區外也涵蓋的其他縣市，用於多地區篩選曝光。
  const [additionalRegions,  setAdditionalRegions]  = useState<string[]>([]);
  const [category,           setCategory]           = useState('');
  const [priceTwd,           setPriceTwd]           = useState('');
  const [durationMinutes,    setDurationMinutes]    = useState('');
  // #297 人數限制（最少／最多人數）以「方案」為唯一真實來源（旅客下單與導遊後台
  // 皆讀方案層級），活動層級輸入已移除；改於「方案管理」各方案設定。
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
  const [socialProofQuotes,  setSocialProofQuotes]  = useState<SocialProofQuoteRow[]>([]);
  const [faq,                setFaq]                = useState<Array<{q:string;a:string}>>([]);
  const [status,             setStatus]             = useState('draft');
  // 方案改由「方案管理」(V2) 維護；此頁只在「JSON 匯入」帶入 V2 方案時，暫存一次性
  // insert-only 匯入用（送出後清空）。舊版 activities.plans 已停用（#admin-plan-revert）。
  const [importedPlans,      setImportedPlans]      = useState<Array<Record<string, unknown>> | null>(null);
  const [ratingAvg,          setRatingAvg]          = useState('');
  const [activitySlug,       setActivitySlug]       = useState('');
  const [importErrors,       setImportErrors]       = useState<string[]>([]);
  const [importDiff,         setImportDiff]         = useState<Array<{field:string;before:string;after:string}>>([]);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activityId) return;
    setLoading(true);
    fetch(`/api/admin/activities/${activityId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => {
        const d = json.data;
        if (!d) { setError('行程不存在'); setLoading(false); return; }
        setTitle(d.title || '');
        setActivitySlug(d.slug || activityId);
        setGuideSlug(d.guideSlug || '');
        setRegion(d.region || '');
        setAdditionalRegions(Array.isArray(d.regions) ? d.regions.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0) : []);
        setCategory(d.category || '');
        setPriceTwd(String(d.priceTwd || ''));
        setDurationMinutes(String(d.durationMinutes || ''));
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
        setSocialProofQuotes(normalizeSocialProofQuotes(d.socialProofQuotes));
        setFaq(d.faq || []);
        setRatingAvg(d.ratingAvg != null ? String(d.ratingAvg) : '');
        setStatus(d.status || 'draft');
        setLoading(false);
      })
      .catch(() => { setError('載入失敗'); setLoading(false); });
  }, [activityId]);

  function summarize(v: any) {
    if (Array.isArray(v)) return `${v.length} 項`;
    if (v == null || v === '') return '（空）';
    return String(v).slice(0, 50);
  }

  function validateImport(d: any) {
    const errors: string[] = [];
    if (!d || typeof d !== 'object' || Array.isArray(d)) errors.push('根層必須是 JSON 物件');
    if (!d.title || typeof d.title !== 'string') errors.push('title 必填，且必須是字串');
    if (!d.region || typeof d.region !== 'string') errors.push('region 必填，且必須是字串');
    if (!d.category || typeof d.category !== 'string') errors.push('category 必填，且必須是字串');
    if (d.priceTwd == null || Number.isNaN(Number(d.priceTwd))) errors.push('priceTwd 必填，且必須是數字');
    if (d.guideSlug != null && typeof d.guideSlug !== 'string') errors.push('guideSlug 必須是字串');
    for (const key of ['imageUrls','inclusions','exclusions','notices','refundRules','goodFor','socialProofQuotes']) {
      if (d[key] != null && !Array.isArray(d[key])) errors.push(`${key} 必須是陣列`);
    }
    if (d.faq != null && !Array.isArray(d.faq)) errors.push('faq 必須是陣列');
    if (d.activityPlans != null && !Array.isArray(d.activityPlans)) errors.push('activityPlans 必須是陣列');
    return errors;
  }

  function buildImportDiff(d: any) {
    return [
      ['title', title, d.title || ''],
      ['guideSlug', guideSlug, d.guideSlug || ''],
      ['region', region, d.region || ''],
      ['category', category, d.category || ''],
      ['priceTwd', priceTwd, String(d.priceTwd || '')],
      ['tagline', tagline, d.tagline || ''],
      ['shortDescription', shortDescription, d.shortDescription || ''],
      ['coverImageUrl', coverImageUrl, d.coverImageUrl || ''],
      ['imageUrls', imageUrls, Array.isArray(d.imageUrls) ? d.imageUrls : []],
      ['activityPlans（V2 方案，匯入後於「方案管理」維護）', importedPlans ?? [], Array.isArray(d.activityPlans) ? d.activityPlans : []],
      ['faq', faq, Array.isArray(d.faq) ? d.faq : []],
    ].filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
     .map(([field, before, after]) => ({ field: String(field), before: summarize(before), after: summarize(after) }));
  }

  function applyImportedActivity(d: any) {
    setTitle(d.title || '');
    setGuideSlug(d.guideSlug || '');
    setRegion(d.region || '');
    setAdditionalRegions(Array.isArray(d.regions) ? d.regions.filter((r: unknown): r is string => typeof r === 'string' && r.length > 0) : []);
    setCategory(d.category || '');
    setPriceTwd(String(d.priceTwd || ''));
    setDurationMinutes(String(d.durationMinutes || ''));
    setMeetingPoint(d.meetingPoint || '');
    setMeetingPointMapUrl(d.meetingPointMapUrl || '');
    setCoverImageUrl(d.coverImageUrl || '');
    setImageUrls(Array.isArray(d.imageUrls) ? d.imageUrls : []);
    setDescription(d.description || '');
    setShortDescription(d.shortDescription || '');
    setTagline(d.tagline || '');
    setInclusions((d.inclusions || []).join('\n'));
    setExclusions((d.exclusions || []).join('\n'));
    setNotices((d.notices || []).join('\n'));
    setRefundRules((d.refundRules || []).join('\n'));
    setSafetyNotice(d.safetyNotice || '');
    setGoodFor((d.goodFor || []).join('\n'));
    setSocialProofQuotes(normalizeSocialProofQuotes(d.socialProofQuotes));
    setFaq(Array.isArray(d.faq) ? d.faq : []);
    // V2 方案：匯入時只暫存，儲存時 insert-only 建立尚不存在的方案（不覆蓋既有）。
    setImportedPlans(Array.isArray(d.activityPlans) && d.activityPlans.length ? d.activityPlans : null);
    setSuccess('✅ 已從 JSON 匯入內容；方案將於儲存時「只新增不覆蓋」建立，後續請至「方案管理」維護');
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || '{}'));
        const errors = validateImport(json);
        setImportErrors(errors);
        setImportDiff(errors.length ? [] : buildImportDiff(json));
        if (errors.length) {
          setError('匯入失敗：JSON 欄位格式不正確');
          return;
        }
        applyImportedActivity(json);
      } catch {
        setImportErrors(['檔案不是有效 JSON，請重新檢查逗號、括號與引號']);
        setImportDiff([]);
        setError('匯入失敗：請上傳有效的 JSON 樣板');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function downloadTemplate() {
    // #1531+: 「下載 JSON 樣板」匯出「當前正在編輯的這個行程」的所有文案設定，
    //  而非固定的柴山範例，方便操作者複製、備份或微調後再匯入。
    //  匯出 shape 與 applyImportedActivity 讀取的 shape 一致，確保下載後可原樣重新匯入。
    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
    const template = {
      _instructions: {
        version: 'C - 匯出當前行程設定（可直接重新匯入）',
        note: '此檔為目前編輯中行程的文案設定快照，可直接匯入。_instructions 只做欄位說明，不會寫入資料庫。',
        how_to_use: [
          '1. 複製這份檔案後修改內容',
          '2. 保留欄位名稱不變，只改值',
          '3. 圖片欄位可填真實 URL，也可留空後改用後台上傳',
          '4. activityPlans[] 為 V2 方案（每人／每團計價）。匯入時「只新增不覆蓋」既有方案，之後請至後台「📋 方案管理」維護',
          '5. planItinerary[].imageUrl 是方案介紹步驟的圖片，可填 URL 或後台上傳',
          '6. 匯入後請檢查 diff 預覽，確認後再按儲存'
        ],
        title: '行程名稱。對應後台「行程名稱」。',
        guideSlug: '導遊 slug。對應後台「導遊」，例如 andy-lee。',
        region: '中文地區名稱。對應後台「地區」，例如 高雄市。',
        category: '類別代碼：mountain / river / culture / ecology。',
        priceTwd: '基礎售價（每人 TWD）。對應後台「價格/人」。',
        durationMinutes: '整體活動分鐘數。對應後台「行程時長（分鐘）」。',
        meetingPoint: '集合地點文字。',
        meetingPointMapUrl: 'Google Maps 或其他地圖 URL。',
        coverImageUrl: '封面圖片 URL。也可改用後台上傳。',
        imageUrls: '活動照片 URL 陣列。每個元素一張圖，對應 Gallery，可改用後台上傳。',
        tagline: '一句話副標。',
        shortDescription: '短描述。',
        description: '完整描述。',
        inclusions: '包含項目陣列。',
        exclusions: '不包含項目陣列。',
        notices: '注意事項陣列。',
        refundRules: '退款規則陣列。',
        safetyNotice: '安全說明。',
        goodFor: '適合對象陣列。',
        socialProofQuotes: '社群口碑語錄陣列。',
        faq: 'FAQ 陣列，格式 [{ q, a }]。',
        activityPlans: 'V2 方案陣列；對應後台「📋 方案管理」。匯入時「只新增不覆蓋」既有方案；後續一律於「方案管理」維護。',
        activityPlans_fields: {
          name: '方案名稱（必填）。',
          slug: '方案英文代碼（選填，未填會由名稱自動產生）。',
          priceType: '計價方式：per_person 每人 / per_group 每團。',
          basePrice: '方案基本售價（整數 TWD）。',
          durationMinutes: '方案時長（整數分鐘，至少 15）。',
          bookingType: '預約方式：scheduled 排程 / request 申請 / instant 即時。',
          minParticipants: '最低成團人數。',
          maxParticipants: '方案最多人數。',
          highlights: '方案亮點陣列。',
          detailsLinkText: '查看詳情連結文字。',
          bookingBtnText: '預約按鈕文字。',
          language: '導覽語言。',
          earliestDeparture: '最早可出發日 YYYY-MM-DD。',
          confirmByDays: '最晚幾天前回覆訂單結果。',
          freeCancelDays: '幾天前可免費取消。',
          planInclusions: '方案費用包含項目。',
          planExclusions: '方案費用不包含項目。',
          planItinerary: '方案「詳細行程」站點時間表，格式 [{ icon, title, duration, description, imageUrl? }]。',
          meetingPointName: '集合地點名稱。',
          meetingAddress: '集合地點地址。',
          experiencePointName: '體驗地點名稱。',
          experienceAddress: '體驗地點地址。',
          planNotices: '方案購買須知陣列。',
          planRefundRules: '方案取消政策陣列。'
        }
      },
      // ↓↓↓ 以下皆為「當前編輯中行程」的即時值（含尚未儲存的修改） ↓↓↓
      title: title.trim(),
      guideSlug: guideSlug || undefined,
      region,
      category,
      priceTwd: priceTwd !== '' ? Number(priceTwd) : 0,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      meetingPoint,
      meetingPointMapUrl,
      coverImageUrl,
      imageUrls,
      tagline,
      shortDescription,
      description,
      inclusions: toArray(inclusions),
      exclusions: toArray(exclusions),
      notices: toArray(notices),
      refundRules: toArray(refundRules),
      safetyNotice,
      goodFor: toArray(goodFor),
      socialProofQuotes: socialProofQuotes
        .map(q => ({ author: q.author.trim(), rating: q.rating, text: q.text.trim(), photos: (q.photos ?? []).filter(Boolean).slice(0, QUOTE_PHOTO_MAX) }))
        .filter(q => q.text.length > 0),
      faq,
      // 方案改由「方案管理」維護，此頁不再持有方案值；提供一筆 V2 範例方案作為匯入起點。
      // 匯入時只會「新增尚不存在的方案」，不會覆蓋既有方案。
      activityPlans: [
        {
          name: '範例方案（每人計價）',
          priceType: 'per_person',
          basePrice: priceTwd !== '' ? Number(priceTwd) : 0,
          durationMinutes: durationMinutes ? Number(durationMinutes) : 60,
          bookingType: 'scheduled',
          minParticipants: 1,
          maxParticipants: 10,
          highlights: [],
          planInclusions: [],
          planExclusions: [],
          planItinerary: [{ icon: '📍', title: '第一站', duration: '', description: '', imageUrl: '' }],
          planNotices: [],
          planRefundRules: [],
        },
      ],
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    // 檔名帶上當前行程 slug／ID，避免不同行程下載後互相覆蓋
    const fileSlug = (activitySlug || activityId || 'activity').replace(/[^a-zA-Z0-9_-]/g, '-');
    a.href = url; a.download = `activity-${fileSlug}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    const toArray = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/admin/activities/${activityId}`, {
        method: 'PUT',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: title.trim(), guideSlug: guideSlug || undefined,
          region,
          regionSlug: normalizeRegionSlug(region, REGION_SLUG_MAP[region]),
          // 附加地區（複選）：排除與主要地區重複者，後端會再正規化去重一次。
          regions: additionalRegions.filter(r => r !== region),
          category,
          priceTwd: Number(priceTwd),
          durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
          // #297 不再送活動層級人數限制：以方案層級為準（payload 省略時 updateActivityDb 保留既有值）
          meetingPoint, meetingPointMapUrl, coverImageUrl,
          description, shortDescription, tagline,
          inclusions: toArray(inclusions), exclusions: toArray(exclusions),
          notices: toArray(notices), refundRules: toArray(refundRules),
          safetyNotice: safetyNotice.trim() || undefined,
          goodFor: toArray(goodFor),
          // 社群口碑語錄：結構化（人名／星數／內容），空內容項目過濾掉
          socialProofQuotes: socialProofQuotes
            .map(q => ({ author: q.author.trim(), rating: q.rating, text: q.text.trim(), photos: (q.photos ?? []).filter(Boolean).slice(0, QUOTE_PHOTO_MAX) }))
            .filter(q => q.text.length > 0),
          faq,
          imageUrls,
          ratingAvg: ratingAvg !== '' ? Number(ratingAvg) : null,
          // reviewCount 已移除手動輸入：由後端以「口碑語錄 + 已核准評論」自動對齊
          // V2 方案 insert-only 匯入：僅在本次由 JSON 帶入方案時送出，後端只新增不覆蓋
          // 既有方案（活動層級 itinerary 與舊 plans 已停寫；方案唯一來源＝方案管理）。
          ...(importedPlans && importedPlans.length ? { activityPlans: importedPlans } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccess('✅ 儲存成功');
        setImportedPlans(null); // 一次性匯入完成即清空，避免重複送
      } else {
        setError(json.error?.message || '更新失敗');
      }
    } catch { setError('網路錯誤'); }
    finally { setSaving(false); }
  }

  // ── 社群口碑語錄（結構化）編輯 ──
  function addQuote() {
    setSocialProofQuotes(prev => [...prev, { author: '', rating: 5, text: '', photos: [] }]);
  }
  function updateQuote(index: number, patch: Partial<SocialProofQuoteRow>) {
    setSocialProofQuotes(prev => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }
  function removeQuote(index: number) {
    setSocialProofQuotes(prev => prev.filter((_, i) => i !== index));
  }

  // 暖場評論照片上傳：與旅客評價照片共用 review-photos 桶（admin upload-image type=review，
  // 不限比例），最多 5 張。上傳後把 public URL append 進該則口碑的 photos。
  const QUOTE_PHOTO_MAX = 5;
  const [quotePhotoUploading, setQuotePhotoUploading] = useState<number | null>(null);
  async function uploadQuotePhotos(index: number, startCount: number, files: File[]) {
    if (files.length === 0) return;
    const remaining = QUOTE_PHOTO_MAX - startCount;
    if (remaining <= 0) return;
    setQuotePhotoUploading(index);
    try {
      for (const file of files.slice(0, remaining)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('type', 'review');
        fd.append('slug', activitySlug || activityId);
        const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, {
          method: 'POST',
          headers: csrfHeaders(),
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(j.error?.message || '照片上傳失敗');
        setSocialProofQuotes(prev => prev.map((q, i) => {
          if (i !== index) return q;
          const photos = [...(q.photos ?? [])];
          if (photos.length < QUOTE_PHOTO_MAX) photos.push(j.data.url);
          return { ...q, photos };
        }));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '照片上傳失敗');
    } finally {
      setQuotePhotoUploading(null);
    }
  }
  function removeQuotePhoto(index: number, url: string) {
    setSocialProofQuotes(prev => prev.map((q, i) => (
      i === index ? { ...q, photos: (q.photos ?? []).filter(u => u !== url) } : q
    )));
  }

  async function handleStatusChange(newStatus: string) {
    setStatusBusy(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/activities/${activityId}/status`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setStatus(newStatus);
        setSuccess(`✅ 狀態已更新為「${STATUS_BADGE[newStatus]?.label || newStatus}」`);
      } else if (json.error?.code === 'BOOKING_READINESS_FAILED') {
        const details: Array<{ messageZh?: string; code?: string }> = json.error?.details ?? [];
        const detailLines = details.length > 0
          ? details.map((d: { messageZh?: string; code?: string }) => d.messageZh || d.code || '').filter(Boolean).join('\n')
          : '';
        setError(`${json.error.message}${detailLines ? `\n\n發現以下問題：\n${detailLines}` : ''}`);
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
            <a
              href={`/admin/activities/${activityId}/plans`}
              style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #10b981', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
            >
              📋 方案管理
            </a>
            {status === 'published' && activitySlug && REGION_SLUG_MAP[region] && (
              <a
                href={buildActivityHref({ slug: activitySlug, region, regionSlug: REGION_SLUG_MAP[region] })}
                target="_blank"
                rel="noreferrer"
                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}
              >
                🔗 查看前台
              </a>
            )}
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

      <div className="admin-page" style={{ maxWidth: 800 }}>
        {error   && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>❌ {error}</div>}
        {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{success}</div>}

        {/* ── 基本資料表單 ── */}
        <Card style={{ padding: 28 }}>
          <form onSubmit={handleSave}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])}
              />
              <button type="button" onClick={() => importInputRef.current?.click()} style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬆️ 匯入 JSON 建立內容
              </button>
              <button type="button" onClick={downloadTemplate} title="匯出目前編輯中行程的所有文案設定（含尚未儲存的修改）" style={{ background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬇️ 下載目前行程 JSON
              </button>
            </div>
            {importErrors.length > 0 && (
              <div style={{ background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>JSON 驗證錯誤</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {importErrors.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </div>
            )}
            {importDiff.length > 0 && (
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>匯入預覽 diff</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {importDiff.map((row, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) 1fr 1fr', gap: 8 }}>
                      <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{row.field}</div>
                      <div style={{ color: '#6b7280', wordBreak: 'break-word' }}>原：{row.before}</div>
                      <div style={{ color: '#166534', wordBreak: 'break-word' }}>新：{row.after}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 style={sectionTitle}>📝 基本資訊</h3>

            <label htmlFor="activity-edit-title" style={labelStyle}>
              行程名稱 *
              <input id="activity-edit-title" type="text" value={title} onChange={e => setTitle(e.target.value)} style={fieldStyle} required aria-required="true" />
            </label>

            <div style={labelStyle}>
              <span style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 14 }}>導遊</span>
              <GuideSearch
                value={guideSlug}
                onChange={(slug) => setGuideSlug(slug)}
                style={{ marginTop: 0 }}
              />
            </div>

            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                主要地區
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
            </FormGrid>

            {/* 附加地區（複選）：行程也涵蓋的其他縣市；主要地區決定 URL/SEO，附加地區讓行程在多個地區篩選中出現。 */}
            <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, margin: 0 }}>
              <legend style={{ ...labelStyle, padding: '0 6px' }}>附加地區（複選）</legend>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
                除主要地區外，這個行程還涵蓋哪些縣市？可複選；旅客用任一地區篩選時都會看到此行程。主要地區不需重複勾選。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
                {REGIONS.filter(r => r !== region).map(r => {
                  const checked = additionalRegions.includes(r);
                  return (
                    <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 400, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        value={r}
                        checked={checked}
                        onChange={e => {
                          setAdditionalRegions(prev =>
                            e.target.checked ? [...prev, r] : prev.filter(x => x !== r),
                          );
                        }}
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
            </fieldset>

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
            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} min={0} style={fieldStyle} required aria-required="true" />
              </label>
              <label style={labelStyle}>
                行程時長（分鐘）
                <input type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min={0} style={fieldStyle} />
              </label>
            </FormGrid>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>
              👥 人數限制（最少／最多人數）改於「方案管理」各方案設定 — 旅客下單與導遊後台皆以方案的人數限制為準。
            </p>

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
            {/* CSRF contract: ImageUpload performs FormData POST to upload-image with headers: csrfHeaders() (no content-type). */}
            <label style={{ ...labelStyle, marginBottom: 8 }}>封面圖</label>
            <ImageUpload
              activityId={activityId}
              activitySlug={title.toLowerCase().replace(/\s+/g, '-') || activityId}
              type="cover"
              currentUrl={coverImageUrl}
              onUpload={setCoverImageUrl}
            />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label htmlFor="activity-edit-cover-image-url" style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上封面圖 URL</label>
              <input
                id="activity-edit-cover-image-url"
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
            <div style={{ marginTop: 12 }}>
              <GalleryReorder urls={imageUrls} onChange={setImageUrls} />
            </div>
            <details style={{ marginTop: 12, marginBottom: 16 }}>
              <summary style={{ fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>進階：直接編輯活動照片 URL（每行一張）</summary>
              <label htmlFor="activity-edit-gallery-urls" style={{ ...labelStyle, marginTop: 8, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>每行一張，順序即顯示順序</label>
              <textarea
                id="activity-edit-gallery-urls"
                value={imageUrls.join('\n')}
                onChange={e => setImageUrls(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}
                rows={3}
                style={{ ...fieldStyle, fontSize: 13 }}
                placeholder={'https://example.com/a.webp\nhttps://example.com/b.webp'}
              />
            </details>

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
              <textarea value={refundRules} onChange={e => setRefundRules(e.target.value)} rows={3} style={fieldStyle} placeholder={'出團 168 小時前（含）取消：100%退款\n出團前 超過 72 小時且少於 168 小時取消：70%退款\n出團前 72 小時內（含）取消：不退款'} />
            </label>
            <label style={labelStyle}>
              安全說明
              <textarea value={safetyNotice} onChange={e => setSafetyNotice(e.target.value)} rows={2} style={fieldStyle} placeholder="請確保攜帶個人藥品，行程含輕度步行" />
            </label>
            <label style={labelStyle}>
              適合對象（每行一項）
              <textarea value={goodFor} onChange={e => setGoodFor(e.target.value)} rows={3} style={fieldStyle} placeholder={'喜愛歷史文化\n家庭親子旅遊\n銀髮族友善'} />
            </label>
            <div style={labelStyle}>
              社群口碑語錄（可編輯人名、星數、評價內容）
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                {socialProofQuotes.length === 0 && (
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>尚無口碑語錄，點下方按鈕新增。</span>
                )}
                {socialProofQuotes.map((q, i) => (
                  <div
                    key={i}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
                  >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={q.author}
                        onChange={e => updateQuote(i, { author: e.target.value })}
                        placeholder="人名（留空顯示「旅客回饋」）"
                        aria-label="評論人名"
                        style={{ ...fieldStyle, flex: '1 1 180px', margin: 0 }}
                      />
                      <select
                        value={q.rating}
                        onChange={e => updateQuote(i, { rating: Number(e.target.value) })}
                        aria-label="評論星數"
                        style={{ ...fieldStyle, flex: '0 0 130px', margin: 0 }}
                      >
                        {[5, 4, 3, 2, 1].map(n => (
                          <option key={n} value={n}>{'★'.repeat(n)}（{n}）</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeQuote(i)}
                        style={{ flex: '0 0 auto', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}
                      >
                        刪除
                      </button>
                    </div>
                    <textarea
                      value={q.text}
                      onChange={e => updateQuote(i, { text: e.target.value })}
                      rows={2}
                      placeholder="評價內容"
                      aria-label="評價內容"
                      style={{ ...fieldStyle, margin: 0 }}
                    />
                    {/* 暖場評論照片（選填，最多 5 張，與旅客評價照片同樣式：手機可橫向滑動） */}
                    <div>
                      <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                        照片（選填，最多 {QUOTE_PHOTO_MAX} 張）
                      </span>
                      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory' }}>
                        {(q.photos ?? []).map((url) => (
                          <div key={url} style={{ position: 'relative', flex: '0 0 auto', scrollSnapAlign: 'start' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="暖場評論照片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
                            <button
                              type="button"
                              onClick={() => removeQuotePhoto(i, url)}
                              aria-label="移除照片"
                              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(17,24,39,0.85)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}
                            >×</button>
                          </div>
                        ))}
                        {(q.photos ?? []).length < QUOTE_PHOTO_MAX && (
                          <label style={{ flex: '0 0 auto', width: 72, height: 72, borderRadius: 6, border: '1px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: quotePhotoUploading === i ? 'default' : 'pointer', color: '#6b7280', fontSize: 11, gap: 2, scrollSnapAlign: 'start' }}>
                            <span style={{ fontSize: 18, lineHeight: 1 }}>{quotePhotoUploading === i ? '…' : '+'}</span>
                            <span>{quotePhotoUploading === i ? '上傳中' : '新增'}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              disabled={quotePhotoUploading === i}
                              onChange={e => {
                                const files = Array.from(e.target.files ?? []);
                                e.target.value = '';
                                uploadQuotePhotos(i, (q.photos ?? []).length, files);
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addQuote}
                  style={{ alignSelf: 'flex-start', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}
                >
                  ＋ 新增一則口碑
                </button>
              </div>
            </div>

            <h3 style={sectionTitle}>⭐ 評分信任信號</h3>
            <FormGrid cols={2} gap={16}>
              <label style={labelStyle}>
                初始評分（0–5）
                <input
                  type="number" step="0.1" min="0" max="5"
                  value={ratingAvg}
                  onChange={e => setRatingAvg(e.target.value)}
                  style={fieldStyle}
                  placeholder="例：4.8"
                />
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>留空＝自動以「口碑語錄星數＋已核准旅客評論」平均計算</span>
              </label>
              <div style={labelStyle}>
                目前評論數（自動對齊）
                <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', background: '#f9fafb', color: '#374151' }}>
                  {socialProofQuotes.length} 則口碑語錄＋已核准旅客評論
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>評論數已改為自動對齊（口碑語錄＋已核准評論），無需手動輸入</span>
              </div>
            </FormGrid>

            <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
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

        {/* ── 方案一律於「方案管理」(V2) 維護 ── */}
        <Card style={{ marginTop: 24, padding: 20, border: '1px solid #86efac', background: '#f0fdf4' }}>
          <h3 style={{ ...sectionTitle, marginTop: 0, marginBottom: 10 }}>📋 方案管理</h3>
          <p style={{ color: '#166534', margin: '0 0 8px', lineHeight: 1.7 }}>
            方案（計價方式、時長、預約方式、詳細行程等）一律在「方案管理」維護，本頁不再編輯方案。
          </p>
          <p style={{ color: '#166534', margin: '0 0 16px', lineHeight: 1.7 }}>
            前台「詳細行程」由旅客所選方案的行程介紹（方案管理 → 方案詳情 → 行程介紹）呈現。
          </p>
          <a
            href={`/admin/activities/${activityId}/plans`}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 280,
              boxSizing: 'border-box',
              textAlign: 'center',
              background: '#16a34a',
              color: '#fff',
              textDecoration: 'none',
              padding: '12px 16px',
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            前往「方案管理」
          </a>
        </Card>

        {/* ── FAQ Editor ── */}
        <Card style={{ marginTop: 24, padding: 20 }}>
          <h3 style={{ ...sectionTitle, marginTop: 0 }}>❓ 常見問題</h3>
          {faq.map((item, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={item.q} onChange={e => { const f=[...faq]; f[i]={...f[i],q:e.target.value}; setFaq(f); }}
                  style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="問題" />
                <button type="button" aria-label="移除常見問題" onClick={() => setFaq(faq.filter((_,j)=>j!==i))}
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
                method: 'PUT', headers: csrfHeaders({ 'Content-Type': 'application/json' }),
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
        <ScheduleSection activityId={activityId} />
      </div>
    </>
  );
}
