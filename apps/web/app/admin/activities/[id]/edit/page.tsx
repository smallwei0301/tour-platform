'use client';
import Image from 'next/image';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import { Card, PageHeader, Badge } from '../../../../../src/components/admin/ui';
import { ResponsiveModal, FormGrid } from '../../../../../src/components/admin/responsive';
import { GuideSearch } from '../../../../../src/components/admin/GuideSearch';
import { ImageUpload } from '../../../../../src/components/admin/ImageUpload';
import { buildActivityHref, normalizeRegionSlug } from '../../../../../src/lib/activity-url';
import { normalizeSocialProofQuotes } from '../../../../../src/lib/social-proof-quotes.mjs';

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

// ── Legacy 方案型別 ────────────────────────────────────────
interface PlanConfig {
  id: string;
  label: string;
  duration: string;
  priceMultiplier: number;
  price?: number;
  highlights: string[];
  detailsLinkText: string;
  bookingBtnText: string;
  // 方案詳情
  language?: string;
  earliestDeparture?: string;
  confirmByDays?: number;
  freeCancelDays?: number;
  planInclusions?: string[];
  planExclusions?: string[];
  planItinerary?: Array<{ text: string; imageUrl?: string }>;
  meetingPointName?: string;
  meetingAddress?: string;
  experiencePointName?: string;
  experienceAddress?: string;
  planNotices?: string[];
  planRefundRules?: string[];
}

const DEFAULT_PLANS: PlanConfig[] = [
  {
    id: 'half-day',
    label: 'A. 半日行程',
    duration: '約 4 小時',
    priceMultiplier: 1,
    highlights: ['最早出發前 1 天可預訂', '免費取消（168 小時前（含））', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
  {
    id: 'full-day',
    label: 'B. 全日行程',
    duration: '約 8 小時',
    priceMultiplier: 1.6,
    highlights: ['午餐含餐（在地餐廳）', '免費取消（168 小時前（含））', '實名認證導遊帶領', '電子憑證，出發前確認即可'],
    detailsLinkText: '查看方案詳情 ›',
    bookingBtnText: '立即預約',
  },
];

const REGIONS = ['台北市', '高雄市', '花蓮縣', '台南市', '台中市', '南投縣', '宜蘭縣', '屏東縣'];
const REGION_SLUG_MAP: Record<string, string> = {
  '台北市': 'taipei', '高雄市': 'kaohsiung', '花蓮縣': 'hualien',
  '台南市': 'tainan', '台中市': 'taichung', '南投縣': 'nantou',
  '宜蘭縣': 'yilan',  '屏東縣': 'pingtung',
};
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
            預設取自方案<span style={{ fontWeight: 600 }}>{selectedPlan ? `「${selectedPlan.name}」` : ''}</span>；如需單日不同容量或最低成團，在此調整即會覆蓋該日場次的設定。
          </p>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {progress && <span style={{ fontSize: 13, color: '#16a34a' }}>{progress}</span>}
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 }}>
              取消
            </button>
            <button type="submit" disabled={saving || selectedDates.length === 0 || availablePlans.length === 0}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: 'var(--tp-primary, #16a34a)', color: '#fff',
                fontWeight: 700, fontSize: 14,
                cursor: (saving || selectedDates.length === 0 || availablePlans.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (saving || selectedDates.length === 0 || availablePlans.length === 0) ? 0.6 : 1,
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
  // Does NOT affect the legacy plans/DEFAULT_PLANS JSONB flow.
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
  const [socialProofQuotes,  setSocialProofQuotes]  = useState<SocialProofQuoteRow[]>([]);
  const [faq,                setFaq]                = useState<Array<{q:string;a:string}>>([]);
  const [itinerary,          setItinerary]          = useState<Array<{step:number;title:string;description:string;duration:string;icon:string}>>([]);
  const [status,             setStatus]             = useState('draft');
  const [plans,              setPlans]              = useState<PlanConfig[]>(DEFAULT_PLANS);
  // #917: only send `plans` on save when they are real (loaded from DB or imported),
  // never the DEFAULT_PLANS placeholder — otherwise saving a plan-less activity would
  // persist the placeholder into activities.plans JSONB.
  const [plansTouched,       setPlansTouched]       = useState(false);
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
        setSocialProofQuotes(normalizeSocialProofQuotes(d.socialProofQuotes));
        setFaq(d.faq || []);
        setItinerary(d.itinerary || []);
        setRatingAvg(d.ratingAvg != null ? String(d.ratingAvg) : '');
        setStatus(d.status || 'draft');
        // plans: use DB value if exists, otherwise default
        if (d.plans && Array.isArray(d.plans) && d.plans.length > 0) {
          setPlans(d.plans);
          setPlansTouched(true); // real plans loaded → safe to round-trip on save
        } else {
          setPlans(DEFAULT_PLANS);
        }
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
    if (d.itinerary != null && !Array.isArray(d.itinerary)) errors.push('itinerary 必須是陣列');
    if (d.plans != null && !Array.isArray(d.plans)) errors.push('plans 必須是陣列');
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
      ['plans', plans, Array.isArray(d.plans) ? d.plans : []],
      ['faq', faq, Array.isArray(d.faq) ? d.faq : []],
      ['itinerary', itinerary, Array.isArray(d.itinerary) ? d.itinerary : []],
    ].filter(([, before, after]) => JSON.stringify(before) !== JSON.stringify(after))
     .map(([field, before, after]) => ({ field: String(field), before: summarize(before), after: summarize(after) }));
  }

  function applyImportedActivity(d: any) {
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
    setItinerary(Array.isArray(d.itinerary) ? d.itinerary : []);
    if (Array.isArray(d.plans) && d.plans.length) {
      setPlans(d.plans);
      setPlansTouched(true); // #917: imported plans must persist to 方案管理 on save
    } else {
      setPlans(DEFAULT_PLANS);
    }
    setSuccess('✅ 已從 JSON 樣板匯入內容，請確認後再儲存');
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
    const template = {
      _instructions: {
        version: 'B - 說明版 JSON 樣板（內容豐富版）',
        note: '此檔可直接匯入。_instructions 只做欄位說明，不會寫入資料庫。',
        how_to_use: [
          '1. 複製這份檔案後修改內容',
          '2. 保留欄位名稱不變，只改值',
          '3. 圖片欄位可填真實 URL，也可留空後改用後台上傳',
          '4. plans[] 對應後台「📋 方案管理」，展開「▸ 方案詳情內容」即可編輯',
          '5. planItinerary[].imageUrl 是方案介紹步驟的圖片，可填 URL 或後台上傳',
          '6. 匯入後請檢查 diff 預覽，確認後再按儲存'
        ],
        title: '行程名稱。對應後台「行程名稱」。',
        guideSlug: '導遊 slug。對應後台「導遊」，例如 andy-lee。',
        region: '中文地區名稱。對應後台「地區」，例如 高雄市。',
        category: '類別代碼：outdoor / culture / food / nature。',
        priceTwd: '基礎售價（每人 TWD）。對應後台「價格/人」。',
        durationMinutes: '整體活動分鐘數。對應後台「行程時長（分鐘）」。',
        minParticipants: '最少成團人數。',
        maxParticipants: '最多可報名人數。',
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
        itinerary: '詳細行程時間表陣列，格式 [{ step, title, description, duration, icon }]。',
        plans: '方案管理陣列；對應後台「📋 方案管理」與其中的「方案詳情內容」。',
        plans_fields: {
          id: '方案唯一 ID，例如 half-day。',
          label: '方案名稱。',
          duration: '方案顯示時長文字。',
          priceMultiplier: '相對基礎價格倍數。',
          price: '方案固定售價（選填，若填寫則優先顯示）。',
          highlights: '方案亮點陣列。',
          detailsLinkText: '查看詳情連結文字。',
          bookingBtnText: '預約按鈕文字。',
          language: '導覽語言。',
          earliestDeparture: '最早可出發日 YYYY-MM-DD。',
          confirmByDays: '最晚幾天前回覆訂單結果。',
          freeCancelDays: '幾天前可免費取消。',
          planInclusions: '方案費用包含項目。',
          planExclusions: '方案費用不包含項目。',
          planItinerary: '方案介紹陣列，格式 [{ text, imageUrl? }]，每一步可附圖片 URL。',
          meetingPointName: '集合地點名稱。',
          meetingAddress: '集合地點地址。',
          experiencePointName: '體驗地點名稱。',
          experienceAddress: '體驗地點地址。',
          planNotices: '方案購買須知陣列。',
          planRefundRules: '方案取消政策陣列。'
        }
      },
      title: '柴山秘境之旅｜龍谷、小錐麓、金瓜洞全探索',
      guideSlug: 'andy-lee',
      region: '高雄市',
      category: 'outdoor',
      priceTwd: 1800,
      durationMinutes: 270,
      minParticipants: 4,
      maxParticipants: 10,
      meetingPoint: '柴山壽山動物園停車場旁（龍門亭入口）',
      meetingPointMapUrl: 'https://www.google.com/maps/search/?api=1&query=%E9%AB%98%E9%9B%84%E5%B8%82%E9%BC%93%E5%B1%B1%E5%8D%80%E8%BF%B4%E9%BE%8D%E8%B7%AF+%E6%9F%B4%E5%B1%B1',
      coverImageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
      imageUrls: [
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80'
      ],
      tagline: '市區旁的秘境冒險，攀岩穿石、走懸崖古道、鑽洞穴，跟著 Andy Lee 探索高雄的地形秘境',
      shortDescription: '高雄柴山是臺灣唯一的市區國家自然公園，珊瑚礁石灰岩地形造就了龍谷大峽谷、小錐麓懸崖古道與金瓜洞等絕景。這趟秘境之旅由認證嚮導帶領，親身穿越一般人不知道的路線。',
      description: '柴山，高雄人的後山，也是臺灣唯一位於都會區中的國家自然公園。這裡的地質由高位珊瑚礁石灰岩組成，億萬年前的海底世界被抬升成陸地，歷經風化侵蝕後形成嶙峋石壁、峽谷與神秘洞穴。\n\n本行程由擁有豐富山野經驗的 Andy Lee 導覽，帶領你穿越龍谷大峽谷深邃的 U 字型地形，挑戰高度刺激的小錐麓懸崖古道（全長 30 公尺，路寬僅 30 公分，架設在峭壁上，宛如花蓮錐麓古道的縮小版），並進入罕見對外開放的石灰岩溶洞探索鐘乳石與石筍奇景。\n\n沿途不只地形壯觀，還有機會近距離觀察柴山獼猴群落、熱帶植被生態，以及遠眺高雄港與西子灣的絕美海港天際線。這是一段讓你在城市邊緣感受真實探險的旅程。',
      inclusions: ['認證嚮導全程帶領', '專業頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '行前安全說明與裝備指導', '電子行程確認憑證'],
      exclusions: ['個人交通（請自行抵達集合點）', '個人餐飲', '個人意外險升級（建議自行投保）'],
      notices: [
        '請穿著止滑運動鞋或登山鞋，禁止穿涼鞋或拖鞋',
        '請自備至少 1 公升飲水',
        '行程含輕度攀岩與鑽洞，需彎腰匍匐前進',
        '小錐麓路段需走懸崖岩壁，有懼高症者請事先告知',
        '雨天或土石潮濕時可能調整或取消路線，以安全為優先',
        '柴山洞穴探索需持合法申請許可，本行程已代辦申請'
      ],
      refundRules: [
        '出團 168 小時前（含）取消：100% 退款',
        '出團前 超過 72 小時且少於 168 小時取消：70% 退款',
        '出團前 72 小時內（含）取消：不退款',
        '不可抗力或主辦取消：100% 退款或 1 次免費改期'
      ],
      safetyNotice: '部分路段地形陡峭濕滑，全程請依嚮導指示行進，禁止脫隊。洞穴內光線昏暗，請確保頭燈電量充足。心臟病、嚴重膝傷、孕婦請勿參加。',
      goodFor: ['7-65 歲，有基本體能者', '喜愛地形探索與地質奇景', '想在城市近郊體驗真實探險', '攝影愛好者（石灰岩地形光影極具特色）', '熱愛自然生態觀察者'],
      socialProofQuotes: [
        '走小錐麓那段腿真的有點軟，但景色無敵！',
        '從沒想過高雄市區旁邊藏著這種峽谷地形，太衝擊了',
        'Andy 很懂柴山的每一塊石頭，解說超有深度',
        '鑽洞穴那段是整個行程的高潮，大人小孩都瘋了',
        '這種體驗 KKday 找不到，真的是隱藏版路線',
        '早上出發中午回來，CP 值超高，值得再來一次'
      ],
      faq: [
        { q: '完全沒有登山經驗的人可以參加嗎？', a: '可以，但需要有基本體能。行程有部分攀岩路段（難度低，有輔助繩），以及需要彎腰鑽過岩縫的路段。建議有基本步行能力、膝蓋健康的旅客參加，報名時如有疑慮請先告知嚮導。' },
        { q: '小朋友可以參加嗎？', a: '建議 10 歲以上、體重 30 公斤以上的孩童參加。部分洞穴路段空間較窄，小朋友通過反而更輕鬆！請家長陪同並全程配合嚮導指示。' },
        { q: '怕高或幽閉恐懼症可以參加嗎？', a: '小錐麓路段走在岩壁峭道上，有輕微懼高症者建議先告知嚮導，可依現場狀況評估跳過。洞穴路段空間寬敞，一般幽閉恐懼不會有太大影響，但嚴重者建議事先告知。' },
        { q: '柴山洞穴探索需要申請許可嗎？', a: '是的，依據壽山國家自然公園規定，進入洞穴探勘需事先申請許可。本行程已代辦所有申請手續，旅客只需跟隨嚮導，不需自行辦理。' },
        { q: '行程會遇到猴子嗎？', a: '柴山台灣獼猴族群數量龐大，沿途幾乎必定遇到！嚮導會說明如何與猴子和平共處。請勿餵食、勿直視、背包拉緊，猴子通常不會主動靠近。' },
        { q: '如果下雨或天氣不好還能出發嗎？', a: '一般下雨仍可出發（石灰岩濕潤後風化紋路更美），但大雨或颱風警報時將取消。地形濕滑時嚮導會調整路線。出發前 24 小時內會再次確認天氣狀況。' }
      ],
      itinerary: [
        { step: 1, title: '集合 & 裝備確認', description: '在壽山動物園停車場旁的龍門亭入口集合，嚮導進行裝備分發與安全說明，說明柴山地質生態背景知識，並確認每位旅客的體能與禁忌狀況。', duration: '20 分', icon: '📍' },
        { step: 2, title: '珊瑚礁岩步道入口', description: '進入柴山林道，踏上由億萬年前海底珊瑚礁抬升形成的石灰岩步道。嚮導沿途解說地質構造與柴山獼猴生態，第一個轉角通常就能見到猴群出沒。', duration: '30 分', icon: '🌿' },
        { step: 3, title: '龍谷大峽谷', description: '抵達柴山最壯觀的地形奇景「龍谷大峽谷」。兩側高聳的珊瑚礁岩壁形成深邃 U 字型峽谷，站在谷底往上看天光穿透岩縫，光影效果震撼。嚮導講解水蝕與溶蝕作用如何塑造這片地形。', duration: '30 分', icon: '🪨' },
        { step: 4, title: '小錐麓懸崖古道', description: '本行程最刺激的路段！小錐麓是龍谷末端一段建造在岩壁上的古道，全長僅 30 公尺，路寬不到 30 公分，一側是峭壁，一側是深谷。如同縮小版的花蓮錐麓古道，考驗膽量的同時也能俯瞰整個峽谷。', duration: '20 分', icon: '🧗' },
        { step: 5, title: '金瓜洞石灰岩溶洞', description: '穿越岩縫進入柴山著名的「金瓜洞」秘境。洞內由碳酸鈣長期沉澱形成的鐘乳石與石筍造型奇特，頭燈照射下金光閃閃，是柴山最神秘也最少人知道的地點。本行程已取得合法探洞許可。', duration: '35 分', icon: '🔦' },
        { step: 6, title: '山頂稜線 & 高雄港景觀台', description: '從洞穴出口沿稜線步道登上柴山頂，眺望高雄港、西子灣、旗津半島，以及晴天下延伸至台灣海峽的壯闊天際線。嚮導分享高雄城市地理與港口歷史。', duration: '30 分', icon: '🌄' },
        { step: 7, title: '木棧道回程 & 生態觀察', description: '沿著柴山木棧道緩步下山，嚮導帶領觀察熱帶海岸林植被、石灰岩地貌細節，以及再次與獼猴群落近距離觀察。行程在龍門亭解散，交通方便。', duration: '25 分', icon: '🐒' }
      ],
      plans: [
        {
          id: 'half-day-morning',
          label: 'A. 早鳥半日探秘',
          duration: '約 4.5 小時（08:00–12:30）',
          priceMultiplier: 1,
          price: 1800,
          highlights: ['晨光穿透峽谷，光影最美時段', '猴群活動最頻繁，最容易近距離觀察', '涼爽舒適，無日曬困擾', '最早出發前 1 天可預訂', '免費取消（出發 168 小時前（含））', '每場最多 10 人小團，品質有保障'],
          detailsLinkText: '查看方案詳情 ›',
          bookingBtnText: '立即預約',
          language: '中文主導 / English available',
          earliestDeparture: '2026-04-10',
          confirmByDays: 2,
          freeCancelDays: 7,
          planInclusions: ['認證嚮導全程帶領', '頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '電子憑證'],
          planExclusions: ['個人交通', '餐飲', '個人意外險升級'],
          planItinerary: [
            { text: '🔆 08:00 龍門亭入口集合，裝備分發與安全說明。嚮導介紹柴山地質歷史，解說億萬年前珊瑚礁抬升成陸地的故事。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌿 08:20 進入珊瑚礁岩步道，首段林道嚮導帶領觀察熱帶植被與石灰岩地貌，幾乎必定遇到獼猴群落（請背好包包）。', imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🪨 08:50 龍谷大峽谷。兩側十公尺高珊瑚礁岩壁夾出 U 字型深谷，晨光穿透岩縫形成絕美光柱。這是柴山最壯觀的地形秘境。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '🧗 09:20 小錐麓懸崖古道挑戰！全長 30 公尺、路寬 30 公分的岩壁棧道，一側峭壁一側深谷，是本行程膽量挑戰最高的路段。嚮導全程陪同保護。', imageUrl: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 09:40 進入金瓜洞石灰岩溶洞！穿越岩縫，頭燈照亮洞內億年鐘乳石與石筍奇景。本行程已取得合法探洞申請許可，帶你看一般遊客進不去的秘境。', imageUrl: 'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌄 10:15 登上稜線展望台，遠眺高雄港、西子灣與旗津全景。天氣晴朗時甚至能看到台灣海峽。嚮導說明高雄地理與港口歷史。', imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🐒 10:45 沿木棧道緩步下山，沿途再觀察柴山獼猴生態與植被，嚮導分享保育知識。12:30 抵達龍門亭，行程結束。', imageUrl: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=80' }
          ],
          meetingPointName: '龍門亭入口（壽山動物園停車場旁）',
          meetingAddress: '804 高雄市鼓山區萬壽路 350 號旁',
          experiencePointName: '柴山龍谷、小錐麓、金瓜洞',
          experienceAddress: '高雄市鼓山區柴山（壽山國家自然公園）',
          planNotices: ['請穿著止滑鞋', '請自備至少 1 公升飲水', '行程含輕度攀岩與鑽洞，需彎腰匍匐前進', '請勿餵食或挑釁柴山獼猴', '小錐麓有輕微高度，嚴重懼高症者請事先告知'],
          planRefundRules: ['出團 168 小時前（含）取消：100% 退款', '出團前 超過 72 小時且少於 168 小時取消：70% 退款', '出團前 72 小時內（含）取消：不退款', '不可抗力或主辦取消：100% 退款或 1 次免費改期']
        },
        {
          id: 'full-day-complete',
          label: 'B. 全日深度探秘（含午餐）',
          duration: '約 7 小時（08:00–15:00）',
          priceMultiplier: 1.7,
          price: 3000,
          highlights: ['半日行程 + 下午延伸至北峰古砲台與隱谷秘境', '探訪日治時期砲台遺址與神秘地下空間', '含嚮導帶領的在地午餐（前金鴨肉飯）', '行程最完整，適合想深度探索柴山者', '每場最多 8 人精緻小團', '贈送個人行程紀念照片 5 張'],
          detailsLinkText: '查看方案詳情 ›',
          bookingBtnText: '立即預約',
          language: '中文主導 / English available',
          earliestDeparture: '2026-04-10',
          confirmByDays: 2,
          freeCancelDays: 7,
          planInclusions: ['認證嚮導全程帶領', '頭燈（洞穴探索用）', '安全帽', '手套', '洞穴探索保險', '在地午餐（鴨肉飯 + 湯品）', '嚮導拍攝紀念照片 5 張', '電子憑證'],
          planExclusions: ['個人交通', '個人額外飲品', '個人意外險升級'],
          planItinerary: [
            { text: '🔆 08:00 龍門亭入口集合，裝備分發與安全說明。嚮導深入介紹柴山地質歷史，並帶領暖身活動。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌿 08:20 珊瑚礁岩步道，首段觀察獼猴群落與熱帶海岸林生態，嚮導解說保育現況。', imageUrl: 'https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=1200&q=80' },
            { text: '🪨 08:50 龍谷大峽谷。兩側十公尺高的珊瑚礁岩壁，U 字型峽谷空間感震撼，嚮導解說溶蝕與水蝕地形作用機制。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '🧗 09:20 小錐麓懸崖古道挑戰。30公尺窄道俯瞰深谷，嚮導全程保護，完成後拍下大合照紀念。', imageUrl: 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 09:45 金瓜洞石灰岩溶洞探索，合法取得許可入洞，頭燈照射下鐘乳石與石筍閃閃發亮，嚮導講解碳酸鈣沉澱機制。', imageUrl: 'https://images.unsplash.com/photo-1520116468816-95b69f847357?auto=format&fit=crop&w=1200&q=80' },
            { text: '🌄 10:30 登上柴山主稜線展望台，眺望高雄港、西子灣、旗津、海峽全景，嚮導介紹高雄城市地理發展。', imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🍖 12:00 下山享用嚮導精選在地午餐：前金市場鴨肉飯 + 冬瓜湯，是柴山登山者的傳統補給，也是在地味道的最佳代表。', imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80' },
            { text: '🏰 13:15 午餐後前往柴山北峰，探訪日治時期遺留的砲台遺址，嚮導講解二戰防禦工事歷史背景。砲台石拱門與地下彈藥庫都保存完整。', imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80' },
            { text: '🔦 14:00 北峰隱谷秘境，另一處鮮為人知的岩縫通道與小型溶洞，是早鳥行程不包含的獨家路線，全程嚮導帶領。', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80' },
            { text: '✅ 15:00 回到集合點，嚮導分享行程紀念照片，行程圓滿結束。', imageUrl: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1200&q=80' }
          ],
          meetingPointName: '龍門亭入口（壽山動物園停車場旁）',
          meetingAddress: '804 高雄市鼓山區萬壽路 350 號旁',
          experiencePointName: '柴山龍谷、小錐麓、金瓜洞、北峰砲台、隱谷秘境',
          experienceAddress: '高雄市鼓山區柴山（壽山國家自然公園）',
          planNotices: ['請穿著止滑運動鞋或登山鞋，禁止穿涼鞋', '請自備至少 1.5 公升飲水', '午餐有葷食（鴨肉），素食者請報名時告知，可安排替代餐食', '行程含攀岩、鑽洞與下午北峰路線，體力需求高於半日'],
          planRefundRules: ['出團 168 小時前（含）取消：100% 退款', '出團前 超過 72 小時且少於 168 小時取消：70% 退款', '出團前 72 小時內（含）取消：不退款', '不可抗力或主辦取消：100% 退款或 1 次免費改期']
        }
      ]
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'activity-chaishan-sample.json'; a.click();
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
          category,
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
          // 社群口碑語錄：結構化（人名／星數／內容），空內容項目過濾掉
          socialProofQuotes: socialProofQuotes
            .map(q => ({ author: q.author.trim(), rating: q.rating, text: q.text.trim(), photos: (q.photos ?? []).filter(Boolean).slice(0, QUOTE_PHOTO_MAX) }))
            .filter(q => q.text.length > 0),
          faq, itinerary,
          imageUrls,
          ratingAvg: ratingAvg !== '' ? Number(ratingAvg) : null,
          // reviewCount 已移除手動輸入：由後端以「口碑語錄 + 已核准評論」自動對齊
          // #917: persist plans so imported/edited plans reach 方案管理 (activity_plans).
          // Guarded by plansTouched so a plan-less activity never saves the DEFAULT_PLANS placeholder.
          ...(plansTouched ? { plans } : {}),
        }),
      });
      const json = await res.json();
      if (json.ok) setSuccess('✅ 儲存成功');
      else setError(json.error?.message || '更新失敗');
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
              <button type="button" onClick={downloadTemplate} style={{ background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                ⬇️ 下載 JSON 樣板
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
            </FormGrid>

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
            <FormGrid cols={3} gap={16}>
              <label style={labelStyle}>
                價格/人 (TWD) *
                <input type="number" value={priceTwd} onChange={e => setPriceTwd(e.target.value)} min={0} style={fieldStyle} required aria-required="true" />
              </label>
              <label style={labelStyle}>
                最少人數
                <input type="number" value={minParticipants} onChange={e => setMinParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
              <label style={labelStyle}>
                最多人數
                <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} min={1} style={fieldStyle} />
              </label>
            </FormGrid>
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
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <label htmlFor="activity-edit-gallery-urls" style={{ ...labelStyle, marginBottom: 4, fontSize: 12, color: '#6b7280' }}>或直接貼上活動照片 URL（每行一張）</label>
              <textarea
                id="activity-edit-gallery-urls"
                value={imageUrls.join('\n')}
                onChange={e => setImageUrls(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}
                rows={3}
                style={{ ...fieldStyle, fontSize: 13 }}
                placeholder={'https://example.com/a.webp\nhttps://example.com/b.webp'}
              />
              {imageUrls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {imageUrls.map((url, i) => (
                    <div key={url + i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#fff' }}>
                      <Image src={url} alt={`活動圖片 ${i + 1} 預覽`} style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, background: '#f3f4f6' }} width={96} height={64} />
                      <div style={{ flex: 1, fontSize: 12, color: '#4b5563', wordBreak: 'break-all' }}>{url}</div>
                      <button type="button" onClick={() => setImageUrls(imageUrls.filter((_, idx) => idx !== i))} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>移除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {/* ── 正式方案改由專屬頁管理 ── */}
        <Card style={{ marginTop: 24, border: '1px solid #86efac', background: '#f0fdf4' }}>
          <h3 style={{ ...sectionTitle, marginBottom: 8 }}>📋 正式方案編輯入口</h3>
          <p style={{ color: '#166534', margin: 0, lineHeight: 1.6 }}>
            正式方案（rich contract）已移至專屬頁集中管理，避免與活動主編輯頁重複維護。
          </p>
          <p style={{ color: '#166534', marginTop: 8, marginBottom: 8 }}>
            目前 legacy plans 筆數：{plans.length}
          </p>
          <p style={{ color: '#166534', marginTop: 0, marginBottom: 12 }}>
            方案欄位統一在專屬頁維護，這裡僅保留預設值/fallback 提示。
          </p>
          <a
            href={`/admin/activities/${activityId}/plans`}
            style={{
              display: 'inline-block',
              background: '#16a34a',
              color: '#fff',
              textDecoration: 'none',
              padding: '10px 14px',
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            前往「方案管理」完整編輯
          </a>
        </Card>

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
                <button type="button" aria-label="移除行程點" onClick={() => setItinerary(itinerary.filter((_,j)=>j!==i))}
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
                method: 'PUT', headers: csrfHeaders({ 'Content-Type': 'application/json' }),
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
