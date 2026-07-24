'use client';

import { useState } from 'react';
import { csrfHeaders } from '../../../lib/csrf-client';

export interface VerifiedImpersonation {
  guideName: string;
}

interface MidaoImpersonationBannerProps {
  impersonation: VerifiedImpersonation | null;
}

export function MidaoImpersonationBanner({ impersonation }: MidaoImpersonationBannerProps) {
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  if (!impersonation) return null;

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
      window.location.assign('/admin/guides');
    } catch {
      setError('結束代入失敗，請再試一次');
      setEnding(false);
    }
  }

  return (
    <div className="midao-impersonation-banner" data-testid="midao-impersonation-banner" role="status">
      <span>管理員代入模式：正以「{impersonation.guideName}」身分操作</span>
      <button type="button" disabled={ending} onClick={endImpersonation}>
        {ending ? '結束中…' : '結束代入'}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
