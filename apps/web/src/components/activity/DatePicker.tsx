'use client';

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

interface Schedule {
  startAt?: string;
  start_at?: string;
  capacity: number;
  bookedCount?: number;
  booked_count?: number;
  status?: string;
  id?: string;
}

interface DatePill {
  dateKey: string;   // YYYY-MM-DD
  month: number;
  day: number;
  weekDay: string;
  available: boolean;
  remaining: number;
}

interface DatePickerProps {
  schedules: Schedule[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

function buildDatePills(schedules: Schedule[]): DatePill[] {
  const map = new Map<string, { available: boolean; remaining: number }>();

  for (const s of schedules) {
    const startAt = s.startAt || s.start_at;
    if (!startAt) continue;

    const d = new Date(startAt);
    const dateKey = d.toISOString().slice(0, 10);
    const capacity = Number(s.capacity || 0);
    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
    const remaining = capacity - bookedCount;
    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
    const available = status === 'open' && remaining > 0;

    // Merge: if any schedule on this date is available, mark available
    const existing = map.get(dateKey);
    if (!existing) {
      map.set(dateKey, { available, remaining });
    } else {
      map.set(dateKey, {
        available: existing.available || available,
        remaining: existing.remaining + remaining,
      });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, { available, remaining }]) => {
      const d = new Date(dateKey + 'T00:00:00');
      return {
        dateKey,
        month: d.getMonth() + 1,
        day: d.getDate(),
        weekDay: WEEK_DAYS[d.getDay()],
        available,
        remaining,
      };
    });
}

export function DatePicker({ schedules, selectedDate, onSelect }: DatePickerProps) {
  const pills = buildDatePills(schedules);

  if (pills.length === 0) {
    return (
      <p style={{ color: 'var(--tp-muted)', fontSize: 14 }}>目前尚無可預約場次，請稍後再查詢。</p>
    );
  }

  return (
    <div className="tp-date-picker-scroll">
      {pills.map((p) => {
        const isSelected = selectedDate === p.dateKey;
        return (
          <button
            key={p.dateKey}
            onClick={() => p.available && onSelect(p.dateKey)}
            disabled={!p.available}
            className={`tp-date-pill${isSelected ? ' selected' : ''}${!p.available ? ' disabled' : ''}`}
            title={
              !p.available
                ? '此日期無可預約場次'
                : `剩餘 ${p.remaining} 位`
            }
          >
            <span className="tp-date-pill-month">{p.month}月{p.day}日</span>
            <span className="tp-date-pill-week">（週{p.weekDay}）</span>
            {!p.available && (
              <span className="tp-date-pill-full">額滿</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
