'use client';

import { useEffect, useRef, useState } from 'react';

interface LineLiffEntryClientProps {
  activityId: string;
  correlationId?: string;
  plan?: string;
  date?: string;
  timezone?: string;
}

/**
 * LIFF entry (#302b): initialises LIFF, verifies the idToken server-side
 * (binding the lineUserId), then continues into the shared Booking V2 flow with
 * source=line continuity. Any LIFF/verify failure degrades gracefully to the
 * same booking path — we never block the traveler from booking.
 */
export default function LineLiffEntryClient({
  activityId,
  correlationId,
  plan,
  date,
  timezone,
}: LineLiffEntryClientProps) {
  const [phase, setPhase] = useState<'init' | 'redirecting' | 'error'>('init');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    function continueToBooking() {
      if (cancelled) return;
      setPhase('redirecting');
      const params = new URLSearchParams();
      if (plan) params.set('plan', plan);
      if (date) params.set('date', date);
      if (timezone) params.set('timezone', timezone);
      params.set('source', 'line');
      params.set('sourceChannel', 'line');
      if (correlationId) params.set('correlationId', correlationId);
      window.location.replace(`/booking/${encodeURIComponent(activityId)}?${params.toString()}`);
    }

    (async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId || !activityId) {
        continueToBooking();
        return;
      }
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return; // LINE redirects back; effect re-runs after login.
        }
        const idToken = liff.getIDToken();
        if (idToken) {
          await fetch('/api/line/auth/verify', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }).catch(() => {
            // Binding is best-effort; booking continues regardless.
          });
        }
      } catch {
        if (!cancelled) setPhase('error');
      } finally {
        continueToBooking();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, correlationId, plan, date, timezone]);

  return (
    <main
      data-testid="line-liff-entry"
      style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
    >
      <p style={{ color: '#5b5b5b' }}>
        {phase === 'error' ? '正在帶你前往預約頁…' : '正在透過 LINE 驗證身分…'}
      </p>
    </main>
  );
}
