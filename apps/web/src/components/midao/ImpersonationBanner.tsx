'use client';

import { useEffect, useState } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

export type VerifiedImpersonation = { guideName: string };

interface ImpersonationBannerProps {
  impersonation?: VerifiedImpersonation | null;
}

export function ImpersonationBanner({ impersonation: initialImpersonation }: ImpersonationBannerProps = {}) {
  const shouldVerifyOnMount = initialImpersonation === undefined;
  const [impersonation, setImpersonation] = useState<VerifiedImpersonation | null>(initialImpersonation ?? null);
  const [hydrated, setHydrated] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!shouldVerifyOnMount) return;
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    void fetch('/api/guide/impersonation', { method: 'GET', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (json?.data?.active === true && typeof json?.data?.guideName === 'string') {
          setImpersonation({ guideName: json.data.guideName });
        }
      })
      .catch(() => undefined);
  }, [shouldVerifyOnMount]);

  async function endImpersonation() {
    if (ending || !hydrated) return;
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

  if (!impersonation) return null;
  return (
    <div
      className="midao-impersonation-banner"
      data-testid={shouldVerifyOnMount ? 'guide-impersonation-banner' : 'midao-impersonation-banner'}
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
        disabled={ending || !hydrated}
        style={{
          padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12,
          fontWeight: 700, cursor: ending || !hydrated ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {ending ? '結束中…' : '結束代入，返回管理後台'}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
