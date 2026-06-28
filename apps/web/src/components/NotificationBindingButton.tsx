'use client';

import { useCallback, useEffect, useState } from 'react';

import { csrfHeaders } from '../lib/csrf-client';
import type { AppLocale } from '../i18n/routing';
import { getClientNamespace } from '../i18n/client-nav-messages';

interface BindingResult {
  code: string;
  deepLink: string | null;
  instruction?: string;
}

interface Props {
  /** Endpoint exposing GET (status) + POST (mint code). */
  endpoint: string;
  channel: 'line' | 'telegram';
  title: string;
  description?: string;
  accent?: string;
  /**
   * 卡片配色基調：'light'（預設，給白底的導遊後台）／'dark'（給深綠的旅客會員中心）。
   * dark 套用主題 token，標題與說明文字才不會在深底上糊掉。
   */
  tone?: 'light' | 'dark';
  /**
   * UI 文案語言（#multilingual）。預設 'zh-Hant' — 導遊後台不傳即維持繁中（零變動）；
   * 旅客 /me/profile 傳入 useClientLocale() 後內部狀態／按鈕文字跟著切英文。
   */
  locale?: AppLocale;
}

const PALETTE = {
  light: { border: '#e5e7eb', title: '#111', desc: '#6b7280', resultBg: '#f9fafb', resultBorder: '#e5e7eb', instruction: '#374151' },
  dark: { border: 'var(--tp-border)', title: 'var(--tp-text)', desc: 'rgba(237,228,203,0.82)', resultBg: 'var(--tp-tint)', resultBorder: 'var(--tp-border)', instruction: 'var(--tp-text)' },
} as const;

/**
 * Reusable "綁定 LINE / Telegram" button. GET on mount to show status; POST on
 * click to mint a one-time code + deep link the user taps to finish binding.
 * Backend self-skips when flags are off; this is purely the console affordance.
 */
export default function NotificationBindingButton({ endpoint, channel, title, description, accent = '#7c3aed', tone = 'light', locale = 'zh-Hant' }: Props) {
  const c = PALETTE[tone];
  const t = getClientNamespace(locale, 'notificationBinding');
  const [bound, setBound] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [result, setResult] = useState<BindingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelName = channel === 'line' ? 'LINE' : 'Telegram';

  // Binding completes out-of-band (the user finishes inside the LINE/Telegram
  // app), so the on-mount status goes stale. Re-fetch on mount, when the window
  // regains focus, and on an explicit "我已完成" recheck.
  const refreshStatus = useCallback(async (): Promise<boolean | null> => {
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) {
        const next = !!j.data?.bound;
        setBound(next);
        return next;
      }
    } catch {
      // leave previous status untouched on transient errors
    }
    return null;
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    void refreshStatus().then(() => { if (!active) return; });
    const onFocus = () => { void refreshStatus(); };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshStatus]);

  async function recheck() {
    setRechecking(true);
    const next = await refreshStatus();
    // Once confirmed bound, collapse the minted code/link — it is single-use.
    if (next) setResult(null);
    setRechecking(false);
  }

  async function bind() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }) });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        setError(t.mintFailed);
        return;
      }
      setResult({ code: j.data.code, deepLink: j.data.deepLink ?? null, instruction: j.data.instruction });
    } catch {
      setError(t.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid={`binding-${channel}`}
      style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.title }}>{title}</div>
          {description && <div style={{ fontSize: 12, color: c.desc, marginTop: 2 }}>{description}</div>}
        </div>
        <span
          data-testid={`binding-${channel}-status`}
          style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: bound ? '#16a34a' : '#b45309' }}
        >
          {bound === null ? '—' : bound ? t.statusBound : t.statusUnbound}
        </span>
      </div>

      <button
        type="button"
        data-testid={`binding-${channel}-btn`}
        onClick={bind}
        disabled={loading}
        style={{ alignSelf: 'flex-start', padding: '9px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
      >
        {loading ? t.generating : bound ? t.rebind.replace('{channel}', channelName) : t.bind.replace('{channel}', channelName)}
      </button>

      {error && <p style={{ color: 'crimson', fontSize: 12, margin: 0 }}>{error}</p>}

      {result && (
        <div
          data-testid={`binding-${channel}-result`}
          style={{ background: c.resultBg, border: `1px solid ${c.resultBorder}`, borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {result.instruction && <p style={{ margin: 0, fontSize: 12, color: c.instruction }}>{result.instruction}</p>}
          {result.deepLink ? (
            <a
              data-testid={`binding-${channel}-link`}
              href={result.deepLink}
              target="_blank"
              rel="noreferrer"
              style={{ alignSelf: 'flex-start', padding: '8px 14px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >
              {t.openToComplete.replace('{channel}', channelName)}
            </a>
          ) : (
            <code data-testid={`binding-${channel}-code`} style={{ fontSize: 13, fontWeight: 700, color: c.instruction }}>{result.code}</code>
          )}
          <button
            type="button"
            data-testid={`binding-${channel}-recheck`}
            onClick={recheck}
            disabled={rechecking}
            style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'transparent', color: accent, border: `1px solid ${accent}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: rechecking ? 0.6 : 1 }}
          >
            {rechecking ? t.rechecking : t.recheckDone}
          </button>
        </div>
      )}
    </div>
  );
}
