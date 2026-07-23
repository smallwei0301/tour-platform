'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

type VerifiedImpersonation = { active: boolean; guideName: string };

export function ImpersonationBanner() {
  const [impersonation, setImpersonation] = useState<VerifiedImpersonation | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    void fetch('/api/guide/impersonation', { method: 'GET', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (json?.data?.active === true && typeof json?.data?.guideName === 'string') {
          setImpersonation({ active: true, guideName: json.data.guideName });
        }
      })
      .catch(() => undefined);
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
      window.location.href = '/admin/guides';
    } catch {
      setError('結束代入失敗，請再試一次');
      setEnding(false);
    }
  }

  if (!impersonation?.active) return null;
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
      <span>🛡️ 管理員代入模式：正以「{impersonation.guideName}」身分操作導遊後台</span>
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
