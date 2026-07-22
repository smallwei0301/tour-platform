'use client';

// midao2 週可用時間預設 modal：7 列（一→日）× 三格 checkbox，儲存整組 PUT。

import React, { useEffect, useState } from 'react';
import { ResponsiveModal } from '../../../../src/components/admin/responsive';
import { C, Btn, Spinner, ErrorState, apiGet, apiSend } from '../ui';

type Period = 'morning' | 'afternoon' | 'evening';
type WeekdayRow = { weekday: number; morning: boolean; afternoon: boolean; evening: boolean };

const PERIODS: Period[] = ['morning', 'afternoon', 'evening'];
const PERIOD_LABEL: Record<Period, string> = { morning: '上午', afternoon: '下午', evening: '晚上' };
// 顯示序 一→日；資料層 weekday 慣例 0=Sun…6=Sat。
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };

export default function WeeklyDefaultsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
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
    apiGet('/api/v2/guide/midao/availability/defaults')
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
  }, [open]);

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
      await apiSend('/api/v2/guide/midao/availability/defaults', 'PUT', { weekdays });
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
          {saveError && <div style={{ color: C.RED, fontSize: 13 }}>{saveError}</div>}
        </div>
      )}
    </ResponsiveModal>
  );
}
