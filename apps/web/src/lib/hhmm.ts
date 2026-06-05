// Issue #1213: tiny "HH:MM + minutes" helper used by the admin schedule-
// create modal to seed `endHH` from `startHH + plan.duration_minutes`.
//
// Same-day clip: a schedule UI works on a single calendar day, so 23:59 is
// the saturation point. Anything beyond that returns '23:59'. Invalid
// input (NaN, malformed `HH:MM`) returns the original string so the modal
// doesn't blank out the operator's field on a typo mid-fill.

export function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || !Number.isFinite(minutes)) return hhmm;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return hhmm;

  const total = h * 60 + mm + Math.trunc(minutes);
  if (total < 0) return '00:00';
  if (total >= 24 * 60) return '23:59';

  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}
