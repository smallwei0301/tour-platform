'use client';

import { useEffect, useState } from 'react';

import { csrfHeaders } from '../lib/csrf-client';

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
}

/**
 * Reusable "綁定 LINE / Telegram" button. GET on mount to show status; POST on
 * click to mint a one-time code + deep link the user taps to finish binding.
 * Backend self-skips when flags are off; this is purely the console affordance.
 */
export default function NotificationBindingButton({ endpoint, channel, title, description, accent = '#7c3aed' }: Props) {
  const [bound, setBound] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BindingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelName = channel === 'line' ? 'LINE' : 'Telegram';

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (active && j?.ok) setBound(!!j.data?.bound); })
      .catch(() => {});
    return () => { active = false; };
  }, [endpoint]);

  async function bind() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: csrfHeaders({ 'content-type': 'application/json' }) });
      const j = await res.json();
      if (!res.ok || !j?.ok) {
        setError('產生綁定連結失敗，請稍後再試。');
        return;
      }
      setResult({ code: j.data.code, deepLink: j.data.deepLink ?? null, instruction: j.data.instruction });
    } catch {
      setError('網路錯誤，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid={`binding-${channel}`}
      style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{title}</div>
          {description && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{description}</div>}
        </div>
        <span
          data-testid={`binding-${channel}-status`}
          style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: bound ? '#16a34a' : '#b45309' }}
        >
          {bound === null ? '—' : bound ? '已綁定 ✓' : '未綁定'}
        </span>
      </div>

      <button
        type="button"
        data-testid={`binding-${channel}-btn`}
        onClick={bind}
        disabled={loading}
        style={{ alignSelf: 'flex-start', padding: '9px 16px', background: accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
      >
        {loading ? '產生中…' : bound ? `重新綁定 ${channelName}` : `綁定 ${channelName}`}
      </button>

      {error && <p style={{ color: 'crimson', fontSize: 12, margin: 0 }}>{error}</p>}

      {result && (
        <div
          data-testid={`binding-${channel}-result`}
          style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {result.instruction && <p style={{ margin: 0, fontSize: 12, color: '#374151' }}>{result.instruction}</p>}
          {result.deepLink ? (
            <a
              data-testid={`binding-${channel}-link`}
              href={result.deepLink}
              target="_blank"
              rel="noreferrer"
              style={{ alignSelf: 'flex-start', padding: '8px 14px', background: '#111827', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}
            >
              開啟 {channelName} 完成綁定
            </a>
          ) : (
            <code data-testid={`binding-${channel}-code`} style={{ fontSize: 13, fontWeight: 700 }}>{result.code}</code>
          )}
        </div>
      )}
    </div>
  );
}
