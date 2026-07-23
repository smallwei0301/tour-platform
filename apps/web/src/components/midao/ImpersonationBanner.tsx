'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

const MARKER_COOKIE = 'guide_impersonation';

function hasMarkerCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .some((cookie) => cookie.startsWith(`${MARKER_COOKIE}=`) && !cookie.startsWith(`${MARKER_COOKIE}=;`));
}

export function ImpersonationBanner() {
  const [visible, setVisible] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    setVisible(hasMarkerCookie());
  }, []);

  async function endImpersonation() {
    if (ending) return;
    setEnding(true);
    setError('');
    try {
      const response = await fetch('/api/guide/impersonation', {
        method: 'DELETE',
        headers: csrfHeaders(),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('END_IMPERSONATION_FAILED');
      document.cookie = `${MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      window.location.href = '/admin/guides';
    } catch {
      setError('結束代入失敗，請再試一次');
      setEnding(false);
    }
  }

  if (!visible) return null;
  return (
    <div
      data-testid="guide-impersonation-banner"
      role="status"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        flexWrap: 'wrap', background: '#7c3aed', color: '#fff', padding: '8px 16px',
        fontSize: 13, fontWeight: 600, textAlign: 'center',
      }}
    >
      <span>🛡️ 管理員代入模式：您正以此導遊身分操作導遊後台</span>
      <button
        type="button"
        onClick={endImpersonation}
        disabled={ending}
        style={{
          padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12,
          fontWeight: 700, cursor: ending ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {ending ? '結束中…' : '結束代入，返回管理後台'}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
