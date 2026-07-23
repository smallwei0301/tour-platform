'use client';

// midao2 行事曆：月導覽 → 月格點色 → 當日明細 → 當日可用時間（三格開關＋自訂時段）→ 週預設 modal。

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, Card, Badge, Btn, Spinner, ErrorState, apiGet, apiSend, Icon } from '../ui';
import { buildMonthGrid } from '../../../../src/lib/midao/midao-calendar-grid.mjs';
import { periodLabel } from '../../../../src/lib/midao/midao-copy-templates.mjs';
import WeeklyDefaultsModal from './WeeklyDefaultsModal';

type Period = 'morning' | 'afternoon' | 'evening';
type CustomSlot = { start: string; end: string; isOpen: boolean };
type DayAvailability = { morning: boolean; afternoon: boolean; evening: boolean; custom: CustomSlot[] };
type CalendarItem = {
  type: 'midao_request' | 'booking'; id: string; travelerName: string | null; title: string | null;
  status: string; timeRange: string | null; participantsCount: number;
};
type CalendarDay = { date: string; availability: DayAvailability; hasPending: boolean; hasConfirmed: boolean; items: CalendarItem[] };

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
const PERIODS: Period[] = ['morning', 'afternoon', 'evening'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const monthOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function shiftMonth(m: string, delta: number): string {
  const [y, mm] = m.split('-').map(Number);
  const total = y * 12 + (mm - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

function defaultSelectedDate(m: string): string {
  const now = new Date();
  const curMonth = monthOf(now);
  return m === curMonth ? `${curMonth}-${pad2(now.getDate())}` : `${m}-01`;
}

function dayHeading(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日・星期${WEEKDAY_NAMES[d.getUTCDay()]}`;
}

// 樂觀更新單一日期的 availability 欄位（共用於三格開關/custom 新增刪除）。
function patchDayAvailability(days: CalendarDay[], date: string, patch: Partial<DayAvailability>): CalendarDay[] {
  return days.map((d) => (d.date === date ? { ...d, availability: { ...d.availability, ...patch } } : d));
}

export default function Midao2CalendarPage() {
  const router = useRouter();
  const [month, setMonth] = useState<string>(() => monthOf(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => defaultSelectedDate(month));
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [customAdding, setCustomAdding] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  async function refetch() {
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet(`/api/v2/guide/midao/calendar?month=${month}`);
      setDays(Array.isArray(d?.days) ? d.days : []);
    } catch (err: any) {
      setError(err?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet(`/api/v2/guide/midao/calendar?month=${month}`)
      .then((d) => { if (!cancelled) setDays(Array.isArray(d?.days) ? d.days : []); })
      .catch((err) => { if (!cancelled) setError(err?.message || '載入失敗'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function goPrev() {
    const m = shiftMonth(month, -1);
    setMonth(m);
    setSelectedDate(defaultSelectedDate(m));
  }
  function goNext() {
    const m = shiftMonth(month, 1);
    setMonth(m);
    setSelectedDate(defaultSelectedDate(m));
  }
  function goToday() {
    const m = monthOf(new Date());
    setMonth(m);
    setSelectedDate(defaultSelectedDate(m));
  }

  const selectedDay = days.find((d) => d.date === selectedDate) || null;
  const grid = buildMonthGrid(days as any[]);

  // 樂觀更新 + PUT days/{date}；失敗回滾＋錯誤列。
  async function patchDay(patch: Record<string, unknown>, prevAvail: Partial<DayAvailability>) {
    setAvailError(null);
    setSaving(true);
    try {
      await apiSend(`/api/v2/guide/midao/availability/days/${selectedDate}`, 'PUT', patch);
    } catch (err: any) {
      setDays((prev) => patchDayAvailability(prev, selectedDate, prevAvail));
      setAvailError(err?.message || '更新失敗');
    } finally {
      setSaving(false);
    }
  }

  function togglePeriod(period: Period) {
    if (!selectedDay || saving) return;
    const prevValue = selectedDay.availability[period];
    setDays((prev) => patchDayAvailability(prev, selectedDate, { [period]: !prevValue }));
    patchDay({ [period]: !prevValue }, { [period]: prevValue });
  }

  function removeCustom(idx: number) {
    if (!selectedDay || saving) return;
    const prevCustom = selectedDay.availability.custom;
    const nextCustom = prevCustom.filter((_, i) => i !== idx);
    setDays((prev) => patchDayAvailability(prev, selectedDate, { custom: nextCustom }));
    patchDay({ custom: nextCustom }, { custom: prevCustom });
  }

  function confirmAddCustom() {
    if (!selectedDay || saving) return;
    if (!customStart || !customEnd || customStart >= customEnd) {
      setCustomError('開始時間需早於結束時間');
      return;
    }
    const prevCustom = selectedDay.availability.custom;
    const nextCustom = [...prevCustom, { start: customStart, end: customEnd, isOpen: true }];
    setDays((prev) => patchDayAvailability(prev, selectedDate, { custom: nextCustom }));
    setCustomAdding(false);
    setCustomStart('');
    setCustomEnd('');
    setCustomError(null);
    patchDay({ custom: nextCustom }, { custom: prevCustom });
  }

  if (loading && days.length === 0) return <Spinner />;
  if (error) return <ErrorState text={error} onRetry={refetch} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>行事曆</h1>
        <Btn kind="secondary" onClick={() => setShowDefaults(true)} data-testid="midao2-cal-defaults-btn">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="availability-settings" size={18} />
            設定可用時間
          </span>
        </Btn>
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button type="button" data-testid="midao2-cal-prev" onClick={goPrev}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.TEXT, display: 'flex' }}>
            <Icon name="chevron-left" size={20} />
          </button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{month.slice(0, 4)} 年 {Number(month.slice(5, 7))} 月</div>
          <button type="button" data-testid="midao2-cal-next" onClick={goNext}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.TEXT, display: 'flex' }}>
            <Icon name="chevron-right" size={20} />
          </button>
        </div>
        <button type="button" data-testid="midao2-cal-today" onClick={goToday}
          style={{ alignSelf: 'center', border: `1px solid ${C.BORDER}`, background: C.CARD, borderRadius: 999, padding: '4px 14px', fontSize: 13, cursor: 'pointer', color: C.TEXT }}>
          今天
        </button>

        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: C.MUTED, flexWrap: 'wrap' }}>
          <span>🟠 待確認</span>
          <span>🟢 已確認</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 4, borderRadius: 2, background: C.ACCENT_SOFT, border: `1px solid ${C.ACCENT}` }} />可接案
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAY_HEADERS.map((h, i) => (
            <div key={h} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: i === 6 ? C.RED : C.MUTED }}>{h}</div>
          ))}
          {grid.flatMap((week, wi) =>
            week.map((day: CalendarDay | null, di: number) => {
              if (!day) return <div key={`empty-${wi}-${di}`} />;
              const selected = day.date === selectedDate;
              const anyOpen = day.availability?.morning || day.availability?.afternoon || day.availability?.evening;
              return (
                <button
                  key={day.date} type="button" data-testid={`midao2-cal-day-${day.date}`}
                  onClick={() => setSelectedDate(day.date)}
                  style={{
                    aspectRatio: '1', border: selected ? `2px solid ${C.ACCENT}` : `1px solid ${C.BORDER}`, borderRadius: 8,
                    background: C.CARD, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, cursor: 'pointer', padding: 2,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: di === 6 ? C.RED : C.TEXT }}>{Number(day.date.slice(8, 10))}</span>
                  {day.hasPending ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.ORANGE }} />
                      <span style={{ fontSize: 6, color: C.ORANGE }}>待確認</span>
                    </span>
                  ) : day.hasConfirmed ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.GREEN }} />
                      <span style={{ fontSize: 6, color: C.GREEN }}>已確認</span>
                    </span>
                  ) : anyOpen ? (
                    <span style={{ width: 16, height: 3, borderRadius: 2, background: C.ACCENT_SOFT, border: `1px solid ${C.ACCENT}` }} />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </Card>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{dayHeading(selectedDate)}</div>

        {selectedDay && selectedDay.items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {selectedDay.items.map((item) => {
              const clickable = item.type === 'midao_request';
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={clickable ? () => router.push(`/midao2/requests/${item.id}`) : undefined}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0', borderBottom: `1px solid ${C.BORDER}`, cursor: clickable ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {clickable ? <Badge status={item.status} /> : (
                      <span style={{ background: C.BORDER, color: C.MUTED, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>站內訂單</span>
                    )}
                    {item.travelerName && <span style={{ fontWeight: 700, fontSize: 14 }}>{item.travelerName}</span>}
                    {clickable && item.title && <span style={{ color: C.MUTED, fontSize: 13 }}>{item.title}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.MUTED }}>{item.timeRange ?? ''}・{item.participantsCount} 人</div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: C.MUTED }}>點選時段即可開放或關閉</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {PERIODS.map((period) => {
              const open = !!selectedDay?.availability?.[period];
              return (
                <button
                  key={period} type="button" data-testid={`midao2-cal-period-${period}`}
                  disabled={!selectedDay || saving} onClick={() => togglePeriod(period)}
                  style={{
                    flex: 1, borderRadius: 10, border: `1px solid ${open ? C.ACCENT : C.BORDER}`,
                    background: open ? C.ACCENT_SOFT : C.BG, color: open ? C.ACCENT : C.MUTED,
                    padding: '10px 4px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {periodLabel(period)}
                    <Icon name={open ? 'check' : 'close'} size={open ? 16 : 14} />
                  </span>
                </button>
              );
            })}
          </div>
          {availError && <div style={{ color: C.RED, fontSize: 13 }}>{availError}</div>}

          {selectedDay?.availability?.custom?.map((c, idx) => (
            <div key={`${c.start}-${c.end}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span>{c.start}–{c.end}</span>
              <button type="button" onClick={() => removeCustom(idx)} disabled={saving}
                style={{ background: 'transparent', border: 'none', color: C.RED, cursor: 'pointer', display: 'flex' }}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}

          {customAdding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  style={{ padding: 6, borderRadius: 8, border: `1px solid ${C.BORDER}` }} />
                <span>–</span>
                <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  style={{ padding: 6, borderRadius: 8, border: `1px solid ${C.BORDER}` }} />
                <button type="button" data-testid="midao2-cal-custom-confirm" onClick={confirmAddCustom} disabled={saving}
                  style={{ background: C.ACCENT, color: '#ffffff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                  確認
                </button>
              </div>
              {customError && <div style={{ color: C.RED, fontSize: 13 }}>{customError}</div>}
            </div>
          ) : (
            <button
              type="button" data-testid="midao2-cal-custom-add"
              onClick={() => { setCustomAdding(true); setCustomError(null); }}
              disabled={!selectedDay}
              style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: C.ACCENT, cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Icon name="plus" size={14} />
              自訂時段
            </button>
          )}
        </div>
      </Card>

      <WeeklyDefaultsModal open={showDefaults} onClose={() => setShowDefaults(false)} onSaved={refetch} />
    </div>
  );
}
