'use client';

/**
 * /me/profile — 旅客個人資料與通知偏好（#1387）。
 * 深綠主題（與會員中心一致）。email 由 Supabase auth 管理（唯讀）；
 * 交易類通知（訂單/付款/退款）不可關閉。暱稱（顯示名稱）＋區域為公開顯示用。
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { listRegionOptions } from '../../../src/lib/region-slugs.mjs';
import NotificationBindingButton from '../../../src/components/NotificationBindingButton';
import { MemberTabs } from '../../../src/components/me/MemberTabs';

const REGION_OPTIONS = listRegionOptions();

export default function MeProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
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
          setRegion(j.data.region || '');
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
        body: JSON.stringify({ displayName, phone, region, marketingEmailOptIn: marketingOptIn }),
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

  const pageStyle: React.CSSProperties = { paddingTop: 32, paddingBottom: 56, minHeight: '70vh' };
  const titleStyle: React.CSSProperties = {
    fontFamily: 'var(--tp-serif)', fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700,
    color: 'var(--tp-text)', margin: '0 0 4px', letterSpacing: '0.02em',
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--tp-text)', display: 'block', marginBottom: 6 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 8,
    fontSize: 14, boxSizing: 'border-box', background: 'rgba(244,236,216,0.06)', color: 'var(--tp-text)',
  };

  if (loading) {
    return (
      <main className="tp-container" style={{ ...pageStyle, textAlign: 'center', paddingTop: 80 }}>
        <p style={{ color: 'var(--tp-muted)' }}>載入中⋯</p>
      </main>
    );
  }

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle}>個人資料</h1>
      <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 20px' }}>設定公開顯示的暱稱與區域，以及通知偏好。</p>
      <MemberTabs />

      <form onSubmit={handleSave} className="tp-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email（由登入帳號管理，無法於此修改）</label>
          <input value={email} readOnly disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-display-name" style={labelStyle}>暱稱（顯示名稱）</label>
          <input
            id="profile-display-name"
            data-testid="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder="評論與訂單聯絡人預設顯示名稱"
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-region" style={labelStyle}>區域</label>
          <select
            id="profile-region"
            data-testid="profile-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={inputStyle}
          >
            <option value="">不指定</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.displayName}</option>
            ))}
          </select>
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
        <p style={{ fontSize: 12, color: 'var(--tp-muted)', marginBottom: 16 }}>
          交易類通知（訂單成立、付款、退款進度）為服務必要通知，不受此開關影響。
        </p>

        <div style={{ marginBottom: 16 }} data-testid="me-notification-binding">
          <label style={{ ...labelStyle, marginBottom: 6 }}>Telegram 訂單通知（可選）</label>
          <NotificationBindingButton
            endpoint="/api/me/telegram-binding"
            channel="telegram"
            title="Telegram 通知"
            description="綁定後，訂單成立／付款／取消／退款也會傳到你的 Telegram。"
            accent="#229ED9"
            tone="dark"
          />
        </div>
        {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        {saved && <p data-testid="profile-saved" style={{ color: '#34d399', fontSize: 13, marginBottom: 12 }}>已儲存 ✓</p>}
        <button
          type="submit"
          data-testid="profile-save-btn"
          disabled={saving}
          style={{ padding: '11px 20px', background: '#a8511f', color: '#f8efdc', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? '儲存中…' : '儲存'}
        </button>
      </form>
    </main>
  );
}
