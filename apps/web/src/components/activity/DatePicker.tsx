'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

// 純資料：用於月曆運算（getDay()/月份索引），顯示用文字一律改走 i18n（見 t('weekdays')/t('months')）。
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

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
    cells.push({ dateKey, day: d, available, remaining: info?.remaining ?? 0, price });
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
  const t = useTranslations('datePicker');
  const weekdayLabels = t.raw('weekdays') as string[];
  const monthLabels = t.raw('months') as string[];
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
      <div ref={calendarRef} className="kkd-cal-modal" role="dialog" aria-modal="true" aria-label={t('calendarLabel')} aria-labelledby="calendar-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="kkd-cal-header">
          <button className="kkd-cal-nav" onClick={prevMonth} aria-label={t('prevMonth')}>‹</button>
          <span id="calendar-title" className="kkd-cal-title">{t('calendarTitle', { year: viewYear, month: monthLabels[viewMonth] })}</span>
          <button className="kkd-cal-nav" onClick={nextMonth} aria-label={t('nextMonth')}>›</button>
          <button className="kkd-cal-close" onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        <div className="kkd-cal-weekdays">
          {weekdayLabels.map((w, wi) => <span key={wi} className="kkd-cal-weekday">{w}</span>)}
        </div>

        <div className="kkd-cal-grid">
          {cells.map((cell, i) => {
            if (!cell) return <span key={`empty-${i}`} />;
            const isSelected = selectedDate === cell.dateKey;
            const isSun = new Date(cell.dateKey).getDay() === 0;
            const isSat = new Date(cell.dateKey).getDay() === 6;
            const [y, m, d] = cell.dateKey.split('-');
            const ariaLabel = cell.available
              ? t('ariaDayAvailable', { year: y, month: Number(m), day: Number(d), remaining: cell.remaining })
              : cell.remaining === 0 && cell.hasSchedule
                ? t('ariaDayFull', { year: y, month: Number(m), day: Number(d) })
                : t('ariaDayUnavailable', { year: y, month: Number(m), day: Number(d) });
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
                {!cell.available && cell.remaining === 0 && cell.hasSchedule && (
                  <span className="kkd-cal-day-full">{t('dayFull')}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="kkd-cal-legend">
          <span className="kkd-cal-legend-item available">{t('legendAvailable')}</span>
          <span className="kkd-cal-legend-item unavailable">{t('legendUnavailable')}</span>
        </div>

        {selectedDate && (
          <div className="kkd-cal-selected-summary">
            {t('selectedSummary', { date: selectedDate.slice(5).replace('-', '/'), weekday: weekdayLabels[new Date(selectedDate).getDay()] })}
          </div>
        )}
      </div>
    </div>
  );
}

export function DatePicker({ schedules, selectedDate, onSelect, price }: DatePickerProps) {
  const t = useTranslations('datePicker');
  const weekdayLabels = t.raw('weekdays') as string[];
  const [showCalendar, setShowCalendar] = useState(false);
  const availMap = useMemo(() => buildAvailMap(schedules), [schedules]);
  const pills = useMemo(() => buildNext30Days(availMap), [availMap]);

  if (pills.length === 0) {
    return (
      <div>
        <p style={{ color: 'var(--tp-muted)', fontSize: 14 }}>{t('noSchedules')}</p>
        <button className="kkd-more-dates-btn" onClick={() => setShowCalendar(true)}>
          {t('moreDates')}
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
          const isFull = p.hasSchedule && !p.available;
          const noSchedule = !p.hasSchedule;
          const disabled = isFull || noSchedule;
          return (
            <button
              key={p.dateKey}
              onClick={() => !disabled && onSelect(p.dateKey)}
              disabled={disabled}
              className={[
                'tp-date-pill',
                isSelected ? 'selected' : '',
                disabled ? 'disabled' : '',
                isFull ? 'full' : '',
              ].filter(Boolean).join(' ')}
              title={isFull ? t('titleFull') : noSchedule ? t('titleNoSchedule') : t('titleRemaining', { n: p.remaining })}
            >
              <span className="tp-date-pill-month">{p.month}/{p.day}</span>
              <span className="tp-date-pill-week">{t('weekPrefix', { weekday: weekdayLabels[new Date(p.dateKey).getDay()] })}</span>
              {isFull && <span className="tp-date-pill-full">{t('pillFull')}</span>}
              {noSchedule && <span className="tp-date-pill-na">—</span>}
            </button>
          );
        })}
      </div>

      <button className="kkd-more-dates-btn" onClick={() => setShowCalendar(true)}>
        {t('moreDates')}
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
