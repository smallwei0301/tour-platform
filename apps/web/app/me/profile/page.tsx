'use client';

/**
 * /me/profile — 旅客個人資料與通知偏好（#1387）。
 * 深綠主題（與會員中心一致）。email 由 Supabase auth 管理（唯讀）；
 * 交易類通知（訂單/付款/退款）不可關閉。暱稱（顯示名稱）＋區域為公開顯示用。
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { readMeCache, writeMeCache } from '../../../src/lib/use-me-resource';
import { listRegionOptions } from '../../../src/lib/region-slugs.mjs';
import NotificationBindingButton from '../../../src/components/NotificationBindingButton';
import { MemberTabs } from '../../../src/components/me/MemberTabs';
import { useClientLocale } from '../../../src/i18n/use-client-locale';
import { getClientNamespace } from '../../../src/i18n/client-nav-messages';

const REGION_OPTIONS = listRegionOptions();

type ProfileData = {
  email?: string;
  displayName?: string;
  phone?: string;
  region?: string;
  marketingEmailOptIn?: boolean;
};

export default function MeProfilePage() {
  const router = useRouter();
  const locale = useClientLocale();
  const m = getClientNamespace(locale, 'profile');
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
    // CSRF token 先取（儲存時需要），與 profile 載入並行。
    void fetch('/api/me/csrf', { cache: 'no-store' });

    const applyToForm = (d: ProfileData) => {
      setEmail(d.email || '');
      setDisplayName(d.displayName || '');
      setPhone(d.phone || '');
      setRegion(d.region || '');
      setMarketingOptIn(d.marketingEmailOptIn !== false);
    };

    // 有快取 → 立即回填（切回分頁瞬開），背景靜默更新快取但不覆蓋表單（避免蓋掉編輯中的值）。
    const cached = readMeCache<ProfileData>('/api/me/profile');
    if (cached) {
      applyToForm(cached);
      setLoading(false);
    }

    (async () => {
      try {
        const res = await fetch('/api/me/profile', { cache: 'no-store' });
        if (res.status === 401) {
          router.replace(`/login?next=${encodeURIComponent('/me/profile')}`);
          return;
        }
        const j = await res.json();
        if (j?.data) {
          writeMeCache('/api/me/profile', j.data as ProfileData);
          if (!cached) applyToForm(j.data as ProfileData); // 僅首次（無快取）寫入表單
        }
      } catch {
        if (!cached) setErr(m.loadFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, m.loadFailed]);

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
      if (!res.ok || j.error) throw new Error(j.error?.message || m.saveFailed);
      // 更新快取，切回個人資料分頁顯示最新值。
      if (j?.data) writeMeCache('/api/me/profile', j.data as ProfileData);
      setSaved(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : m.saveFailedRetry);
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
        <p style={{ color: 'var(--tp-muted)' }}>{m.loading}</p>
      </main>
    );
  }

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle}>{m.title}</h1>
      <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 20px' }}>{m.subtitle}</p>
      <MemberTabs />

      <form onSubmit={handleSave} className="tp-card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{m.emailLabel}</label>
          <input value={email} readOnly disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-display-name" style={labelStyle}>{m.displayNameLabel}</label>
          <input
            id="profile-display-name"
            data-testid="profile-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            placeholder={m.displayNamePlaceholder}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-region" style={labelStyle}>{m.regionLabel}</label>
          <select
            id="profile-region"
            data-testid="profile-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            style={inputStyle}
          >
            <option value="">{m.regionUnspecified}</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.slug} value={r.slug}>{r.displayName}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="profile-phone" style={labelStyle}>{m.phoneLabel}</label>
          <input
            id="profile-phone"
            data-testid="profile-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={m.phonePlaceholder}
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
            {m.marketingLabel}
          </label>
        </div>
        <p style={{ fontSize: 12, color: 'var(--tp-muted)', marginBottom: 16 }}>
          {m.marketingHelper}
        </p>

        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="me-notification-binding">
          <label style={{ ...labelStyle, marginBottom: 0 }}>{m.notificationHeading}</label>
          <NotificationBindingButton
            endpoint="/api/me/line-binding"
            channel="line"
            title={m.lineTitle}
            description={m.lineDesc}
            accent="#06c755"
            tone="dark"
            locale={locale}
          />
          <NotificationBindingButton
            endpoint="/api/me/telegram-binding"
            channel="telegram"
            title={m.telegramTitle}
            description={m.telegramDesc}
            accent="#229ED9"
            tone="dark"
            locale={locale}
          />
        </div>
        {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        {saved && <p data-testid="profile-saved" style={{ color: '#34d399', fontSize: 13, marginBottom: 12 }}>{m.saved}</p>}
        <button
          type="submit"
          data-testid="profile-save-btn"
          disabled={saving}
          style={{ padding: '11px 20px', background: '#a8511f', color: '#f8efdc', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {saving ? m.saving : m.save}
        </button>
      </form>
    </main>
  );
}
