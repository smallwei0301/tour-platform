'use client';

// midao2 週可用時間批次工具（#1760 Stage 2 owner 決議 U-2 = W-2）。
// 這不是第二套真相：勾選的「星期幾 × U-1 段別」會被展開成該月每一天的
// canonical 單日 CAS 寫入（逐日帶 expectedRevision），沒有任何週預設 durable 表。

import React, { useEffect, useState } from 'react';
import { ResponsiveModal } from '../../../../src/components/admin/responsive';
import { C, Btn, Spinner, ErrorState, apiGet } from '../ui';
import { csrfHeaders } from '../../../../src/lib/csrf-client';
import {
  MIDAO_SEGMENTS,
  MIDAO_SEGMENT_RANGES,
  MIDAO_DEFAULT_TIMEZONE,
  weekdayOf,
  isFutureLocalDate,
} from '../../../../src/lib/midao/midao-calendar-canonical';

type Period = 'morning' | 'afternoon' | 'evening';
type WeekdayRow = { weekday: number; morning: boolean; afternoon: boolean; evening: boolean };
type DayRevision = { date: string; revision: number };

const PERIODS: Period[] = MIDAO_SEGMENTS as Period[];
// U-1 固定段別標籤（owner 不可變決議的 HH:MM 區間）。
const PERIOD_LABEL: Record<Period, string> = {
  morning: `上午 ${MIDAO_SEGMENT_RANGES.morning.startTimeLocal}–${MIDAO_SEGMENT_RANGES.morning.endTimeLocal}`,
  afternoon: `下午 ${MIDAO_SEGMENT_RANGES.afternoon.startTimeLocal}–${MIDAO_SEGMENT_RANGES.afternoon.endTimeLocal}`,
  evening: `晚上 ${MIDAO_SEGMENT_RANGES.evening.startTimeLocal}–${MIDAO_SEGMENT_RANGES.evening.endTimeLocal}`,
};
// 顯示序 一→日；資料層 weekday 慣例 0=Sun…6=Sat。
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

function newIdempotencyKey(): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return `midao2-defaults-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function WeeklyDefaultsModal({
  open,
  month,
  days,
  onClose,
  onSaved,
}: {
  open: boolean;
  month: string;
  days: DayRevision[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [weekdays, setWeekdays] = useState<WeekdayRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    apiGet(`/api/v2/guide/midao/availability/defaults?month=${month}`)
      .then((d) => {
        if (cancelled) return;
        setWeekdays(Array.isArray(d?.weekdays) ? d.weekdays : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || '載入失敗');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, month]);

  function toggle(weekday: number, period: Period) {
    setWeekdays((prev) =>
      (prev ?? []).map((w) => (w.weekday === weekday ? { ...w, [period]: !w[period] } : w)),
    );
  }

  async function handleSave() {
    if (!weekdays || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const selectedWeekdays = new Set(weekdays.map((w) => w.weekday));
      // W-2 批次只套用未來日期（後端同樣 fail-closed 略過非未來日）。
      const targetDays = days
        .filter((d) => selectedWeekdays.has(weekdayOf(d.date)))
        .filter((d) => isFutureLocalDate(d.date, MIDAO_DEFAULT_TIMEZONE))
        .map((d) => ({ date: d.date, expectedRevision: d.revision }));
      const res = await fetch('/api/v2/guide/midao/availability/defaults', {
        method: 'POST',
        headers: csrfHeaders({
          'content-type': 'application/json',
          'idempotency-key': newIdempotencyKey(),
        }),
        body: JSON.stringify({
          month,
          timezone: MIDAO_DEFAULT_TIMEZONE,
          weekdays,
          days: targetDays,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) {
        setSaveError(json?.error?.message || '儲存失敗');
        return;
      }
      const conflicts = Array.isArray(json?.data?.conflicts) ? json.data.conflicts : [];
      if (conflicts.length > 0) {
        setSaveError(`有 ${conflicts.length} 天已被其他更新覆蓋，請重新載入後再套用一次`);
        onSaved();
        return;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setSaveError(err?.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      title="設定可用時間"
      size="md"
      data-testid="midao2-defaults-modal"
      footer={
        <>
          <Btn kind="secondary" onClick={onClose}>
            取消
          </Btn>
          <Btn kind="primary" onClick={handleSave} disabled={!weekdays || saving} data-testid="midao2-defaults-save">
            儲存
          </Btn>
        </>
      }
    >
      {loading && <Spinner />}
      {error && <ErrorState text={error} />}
      {!loading && !error && weekdays && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: C.MUTED }}>
            勾選後會套用到 {month} 中尚未到來的每一個對應星期，逐日寫入可用時段（已過去的日期不會被更動）。
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px repeat(3, 1fr)',
              gap: 8,
              fontSize: 12,
              color: C.MUTED,
              fontWeight: 700,
            }}
          >
            <span />
            {PERIODS.map((p) => (
              <span key={p} style={{ textAlign: 'center' }}>
                {PERIOD_LABEL[p]}
              </span>
            ))}
          </div>
          {DISPLAY_ORDER.map((weekday) => {
            const row = weekdays.find((w) => w.weekday === weekday);
            return (
              <div
                key={weekday}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px repeat(3, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 700, color: weekday === 0 ? C.RED : C.TEXT }}>
                  {WEEKDAY_LABEL[weekday]}
                </span>
                {PERIODS.map((period) => (
                  <label
                    key={period}
                    style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`midao2-default-${weekday}-${period}`}
                      checked={!!row?.[period]}
                      onChange={() => toggle(weekday, period)}
                    />
                  </label>
                ))}
              </div>
            );
          })}
          {saveError && <div data-testid="midao2-defaults-error" style={{ color: C.RED, fontSize: 13 }}>{saveError}</div>}
        </div>
      )}
    </ResponsiveModal>
  );
}
