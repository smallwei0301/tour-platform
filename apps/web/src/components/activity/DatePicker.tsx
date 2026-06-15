'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface Schedule {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
}

interface DatePickerProps {
  schedules: Schedule[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  price?: number;
}

interface DayInfo {
  dateKey: string;
  day: number;
  available: boolean;
  remaining: number;
  price?: number;
  hasSchedule?: boolean;
  isPast?: boolean;
}

function toDateKey(rawStartAt: string): string | null {
  const isoLikeMatch = rawStartAt.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoLikeMatch) return isoLikeMatch[1];
  const parsed = new Date(rawStartAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function buildAvailMap(schedules: Schedule[]): Map<string, { available: boolean; remaining: number }> {
  const map = new Map<string, { available: boolean; remaining: number }>();
  for (const s of schedules) {
    const startAt = s.startAt || s.start_at;
    if (!startAt) continue;
    const dateKey = toDateKey(startAt);
    if (!dateKey) continue;
    const capacity = Number(s.capacity || 0);
    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
    const remaining = capacity - bookedCount;
    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
    const available = status === 'open' && remaining > 0;
    const ex = map.get(dateKey);
    if (!ex) {
      map.set(dateKey, { available, remaining });
    } else {
      map.set(dateKey, { available: ex.available || available, remaining: ex.remaining + remaining });
    }
  }
  return map;
}

function buildMonthDays(year: number, month: number, availMap: Map<string, { available: boolean; remaining: number }>, price?: number): (DayInfo | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells: (DayInfo | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayDate = new Date(dateKey);
    const isPast = dayDate < today;
    const info = availMap.get(dateKey);
    const available = !isPast && !!info?.available;
    cells.push({ dateKey, day: d, available, remaining: info?.remaining ?? 0, price, hasSchedule: !!info, isPast });
  }
  return cells;
}

// Generate next-30-days pill dates — show ALL days, unavailable if no schedule
function buildNext30Days(availMap: Map<string, { available: boolean; remaining: number }>) {
  const pills = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateKey = d.toISOString().slice(0, 10);
    const info = availMap.get(dateKey);
    pills.push({
      dateKey,
      month: d.getMonth() + 1,
      day: d.getDate(),
      weekDay: WEEK_DAYS[d.getDay()],
      available: !!info?.available,
      remaining: info?.remaining ?? 0,
      hasSchedule: !!info,
      isFull: info && !info.available,
    });
  }
  return pills; // show all 30 days
}

// CalendarModal
function CalendarModal({
  schedules,
  selectedDate,
  onSelect,
  onClose,
  price,
}: {
  schedules: Schedule[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
  onClose: () => void;
  price?: number;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement;

    // Focus the modal panel so it can receive keyboard events immediately
    calendarRef.current?.focus();

    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const modal = calendarRef.current;
        if (!modal) return;
        const focusable = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if focus is on first focusable (or the modal div itself), wrap to last
          if (document.activeElement === first || document.activeElement === modal) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if focus is on last focusable (or the modal div itself), wrap to first
          if (document.activeElement === last || document.activeElement === modal) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (trigger as HTMLElement)?.focus();
    };
  }, [onClose]);

  const availMap = useMemo(() => buildAvailMap(schedules), [schedules]);
  const cells = useMemo(() => buildMonthDays(viewYear, viewMonth, availMap, price), [viewYear, viewMonth, availMap, price]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <div className="kkd-cal-overlay" onClick={onClose}>
      <div ref={calendarRef} className="kkd-cal-modal" role="dialog" aria-modal="true" aria-label="選擇日期" aria-labelledby="calendar-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="kkd-cal-header">
          <button className="kkd-cal-nav" onClick={prevMonth} aria-label="上個月">‹</button>
          <span id="calendar-title" className="kkd-cal-title">{viewYear} 年 {MONTH_NAMES[viewMonth]}</span>
          <button className="kkd-cal-nav" onClick={nextMonth} aria-label="下個月">›</button>
          <button className="kkd-cal-close" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <div className="kkd-cal-weekdays">
          {WEEK_DAYS.map(w => <span key={w} className="kkd-cal-weekday">{w}</span>)}
        </div>

        <div className="kkd-cal-grid">
          {cells.map((cell, i) => {
            if (!cell) return <span key={`empty-${i}`} />;
            const isSelected = selectedDate === cell.dateKey;
            const isSun = new Date(cell.dateKey).getDay() === 0;
            const isSat = new Date(cell.dateKey).getDay() === 6;
            const [y, m, d] = cell.dateKey.split('-');
            // 未來的不可預約日期一律視為「額滿」；過去的日期維持「不可預約」。
            const showFull = !cell.available && !cell.isPast;
            const ariaLabel = `${y}年${Number(m)}月${Number(d)}日，${cell.available ? `可預約，剩餘 ${cell.remaining} 位` : (showFull ? '已額滿' : '不可預約')}`;
            return (
              <button
                key={cell.dateKey}
                disabled={!cell.available}
                aria-label={ariaLabel}
                onClick={() => { onSelect(cell.dateKey); onClose(); }}
                className={[
                  'kkd-cal-day',
                  cell.available ? 'available' : 'unavailable',
                  isSelected ? 'selected' : '',
                  isSun ? 'sun' : '',
                  isSat ? 'sat' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="kkd-cal-day-num">{cell.day}</span>
                {cell.available && price && (
                  <span className="kkd-cal-day-price">
                    {(price / 1000).toFixed(1)}k
                  </span>
                )}
                {showFull && (
                  <span className="kkd-cal-day-full">額滿</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="kkd-cal-legend">
          <span className="kkd-cal-legend-item available">● 可預約</span>
          <span className="kkd-cal-legend-item unavailable">● 額滿／不可預約</span>
        </div>

        {selectedDate && (
          <div className="kkd-cal-selected-summary">
            已選：{selectedDate.slice(5).replace('-', '/')}（{WEEK_DAYS[new Date(selectedDate).getDay()]}）
          </div>
        )}
      </div>
    </div>
  );
}

export function DatePicker({ schedules, selectedDate, onSelect, price }: DatePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const availMap = useMemo(() => buildAvailMap(schedules), [schedules]);
  const pills = useMemo(() => buildNext30Days(availMap), [availMap]);

  if (pills.length === 0) {
    return (
      <div>
        <p style={{ color: 'var(--tp-muted)', fontSize: 14 }}>目前尚無可預約場次，請稍後再查詢。</p>
        <button className="kkd-more-dates-btn" onClick={() => setShowCalendar(true)}>
          查看更多日期 ›
        </button>
        {showCalendar && (
          <CalendarModal
            schedules={schedules}
            selectedDate={selectedDate}
            onSelect={onSelect}
            onClose={() => setShowCalendar(false)}
            price={price}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ overflow: 'hidden', width: '100%' }}>
      <div className="tp-date-picker-scroll">
        {pills.map((p) => {
          const isSelected = selectedDate === p.dateKey;
          // 任何不可預約的日期（已額滿或無場次）對旅客一律呈現「額滿」，
          // 不再用「—」區分無場次／額滿——兩者對旅客都是「此日不可預約」。
          const disabled = !p.available;
          return (
            <button
              key={p.dateKey}
              onClick={() => !disabled && onSelect(p.dateKey)}
              disabled={disabled}
              className={[
                'tp-date-pill',
                isSelected ? 'selected' : '',
                disabled ? 'disabled' : '',
                disabled ? 'full' : '',
              ].filter(Boolean).join(' ')}
              title={disabled ? '此日期已額滿' : `剩餘 ${p.remaining} 位`}
            >
              <span className="tp-date-pill-month">{p.month}/{p.day}</span>
              <span className="tp-date-pill-week">週{p.weekDay}</span>
              {disabled && <span className="tp-date-pill-full">額滿</span>}
            </button>
          );
        })}
      </div>

      <button className="kkd-more-dates-btn" onClick={() => setShowCalendar(true)}>
        查看更多日期 ›
      </button>

      {showCalendar && (
        <CalendarModal
          schedules={schedules}
          selectedDate={selectedDate}
          onSelect={onSelect}
          onClose={() => setShowCalendar(false)}
          price={price}
        />
      )}
    </div>
  );
}
