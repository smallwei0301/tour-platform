'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function AdminSessionBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (pathname === '/admin/login' || pathname === '/admin/unauthorized') {
      setLoading(false);
      return;
    }

    fetch('/api/admin/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setSession(j?.data || null))
      .finally(() => setLoading(false));
  }, [pathname]);

  const timeLeftLabel = useMemo(() => {
    if (!session?.expiresAt) return '';
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    if (ms <= 0) return '已過期';
    const hours = Math.floor(ms / 1000 / 60 / 60);
    if (hours < 24) return `${hours} 小時內到期`;
    const days = Math.floor(hours / 24);
    return `${days} 天後到期`;
  }, [session]);

  async function logout() {
    await fetch('/api/admin/auth/session', { method: 'DELETE' });
    router.push('/admin/login');
  }

  if (pathname === '/admin/login' || pathname === '/admin/unauthorized') return null;
  if (loading) return null;
  if (!session?.authorized) return null;

  const nearExpiry = session?.expiresAt ? (new Date(session.expiresAt).getTime() - Date.now()) < 24 * 60 * 60 * 1000 : false;

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', background: nearExpiry ? '#fff7ed' : '#f8fafc', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13, color: '#334155' }}>
        Admin 已登入{session.email ? `：${session.email}` : ''} · Session {timeLeftLabel || '有效'}
        {nearExpiry && <span style={{ color: '#b45309', marginLeft: 6 }}>⚠️ 即將到期，建議重新登入</span>}
      </div>
      <button onClick={logout} style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px', background: '#fff' }}>
        登出
      </button>
    </div>
  );
}
