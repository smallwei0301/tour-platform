'use client';

/**
 * /me/profile — 旅客個人資料與通知偏好（#1387，最小版）。
 * email 由 Supabase auth 管理（唯讀）；交易類通知（訂單/付款/退款）不可關閉。
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';
import { csrfHeaders } from '../../../src/lib/csrf-client';

export default function MeProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent('/me/profile')}`);
        return;
      }
      void fetch('/api/me/csrf', { cache: 'no-store' });
      try {
        const res = await fetch('/api/me/profile', { cache: 'no-store' });
        const j = await res.json();
        if (j?.data) {
          setEmail(j.data.email || data.user.email || '');
          setDisplayName(j.data.displayName || '');
          setPhone(j.data.phone || '');
          setMarketingOptIn(j.data.marketingEmailOptIn !== false);
        }
      } catch {
        setErr('載入失敗，請重新整理');
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ displayName, phone, marketingEmailOptIn: marketingOptIn }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '儲存失敗');
      setSaved(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px' }}><p>載入中⋯</p></main>;
  }

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' };

  return (
    <main style={{ maxWidth: 560, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>個人資料</h1>
      <form onSubmit={handleSave} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email（由登入帳號管理，無法於此修改）</label>
          <input value={email} readOnly disabled style={{ ...inputStyle, background: '#f9fafb', color: '#6b7280' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-display-name" style={labelStyle}>顯示名稱</label>
          <input
            id="profile-display-name"
            data-testid="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="訂單聯絡人預設姓名"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-phone" style={labelStyle}>聯絡電話</label>
          <input
            id="profile-phone"
            data-testid="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
            inputMode="tel"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            id="profile-marketing"
            data-testid="profile-marketing"
            checked={marketingOptIn}
            onChange={(e) => setMarketingOptIn(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="profile-marketing" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
            接收優惠與行程推薦通知
          </label>
        </div>
        <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
          交易類通知（訂單成立、付款、退款進度）為服務必要通知，不受此開關影響。
        </p>
        {err && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        {saved && <p data-testid="profile-saved" style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>已儲存 ✓</p>}
        <button
          type="submit"
          data-testid="profile-save-btn"
          disabled={saving}
          style={{ padding: '11px 20px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
      </form>
    </main>
  );
}
