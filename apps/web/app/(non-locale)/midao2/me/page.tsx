'use client';

// midao2 我的頁面：名片 hero＋服務區域/導覽經驗（inline 編輯）＋精選服務預覽＋分享（QR/複製/預覽）＋帳號區。

import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { C, Card, Btn, Spinner, ErrorState, copyToClipboard, apiGet, apiSend, Icon } from '../ui';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

type LegacyProfile = {
  slug: string | null;
  display_name: string;
  headline: string;
  bio: string;
  languages: string[];
  regions: string[];
  region: string;
  profile_photo_url: string | null;
  hero_image_url: string | null;
};

type PublicService = { activityId: string; title: string; coverImageUrl: string | null };

async function fetchLegacyProfile(): Promise<LegacyProfile> {
  const res = await fetch('/api/guide/profile', { cache: 'no-store' });
  if (res.status === 401) {
    window.location.assign('/guide/login?next=' + encodeURIComponent('/midao2/me'));
    throw new Error('未授權，請重新登入');
  }
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json?.error?.message || '載入失敗');
  return json.data;
}

export default function Midao2MePage() {
  const [profile, setProfile] = useState<LegacyProfile | null>(null);
  const [services, setServices] = useState<PublicService[] | null>(null);
  const [publicAvailable, setPublicAvailable] = useState(false);
  const [experienceYears, setExperienceYears] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingExp, setEditingExp] = useState(false);
  const [expInput, setExpInput] = useState('0');
  const [savingExp, setSavingExp] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchLegacyProfile()
      .then(async (p) => {
        setProfile(p);
        // 年資初值：一律走 profile-extras GET，不受公開接案頁上架條件影響（公開 API 僅用於「精選服務」區塊）。
        try {
          const extras = await apiGet('/api/v2/guide/midao/profile-extras');
          setExperienceYears(extras?.experienceYears ?? 0);
        } catch {
          setExperienceYears(0);
        }
        if (p?.slug) {
          try {
            const pub = await apiGet(`/api/v2/public/midao/guides/${p.slug}`);
            setServices(Array.isArray(pub?.services) ? pub.services : []);
            setPublicAvailable(true);
          } catch {
            setServices(null);
            setPublicAvailable(false);
          }
        } else {
          setServices(null);
          setPublicAvailable(false);
        }
      })
      .catch((err) => setError(err?.message || '載入失敗'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  if (error || !profile) return <ErrorState text={error || '載入失敗'} onRetry={load} />;

  const slug = profile.slug || '';
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/g/${slug}` : '';
  const regions = profile.regions?.length ? profile.regions : (profile.region ? [profile.region] : []);

  async function saveExperience() {
    const n = Math.trunc(Number(expInput));
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      setExpError('請輸入 0–60 的整數年');
      return;
    }
    setExpError(null);
    setSavingExp(true);
    try {
      const data = await apiSend('/api/v2/guide/midao/profile-extras', 'PATCH', { experienceYears: n });
      setExperienceYears(data.experienceYears);
      setEditingExp(false);
    } catch (err: any) {
      // 存檔失敗：保留編輯狀態讓使用者重試。
      setExpError(err?.message || '儲存失敗，請重試');
    } finally {
      setSavingExp(false);
    }
  }

  async function handleShare() {
    if (!publicUrl) return;
    if (navigator.share) {
      try { await navigator.share({ url: publicUrl }); } catch { /* 使用者取消分享 */ }
    } else {
      const ok = await copyToClipboard(publicUrl);
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    }
  }

  async function handleCopy() {
    const ok = await copyToClipboard(publicUrl);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  function handleDownloadQr() {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'midao-qr.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleLogout() {
    try {
      await fetch('/api/guide/auth/session', { method: 'DELETE', headers: csrfHeaders() });
    } finally {
      window.location.assign('/guide/login');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>我的接案頁</h1>
        <Btn kind="secondary" onClick={() => window.open('/g/' + slug)} data-testid="midao2-me-preview-top">
          公開頁預覽
        </Btn>
      </div>

      <Card style={{ display: 'flex', gap: 16 }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: 16, background: C.BG, flexShrink: 0,
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {profile.profile_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_photo_url} alt={profile.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Icon name="profile" size={32} style={{ color: C.MUTED }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{profile.display_name}</div>
          {profile.headline && <div style={{ fontSize: 14, color: C.TEXT, marginTop: 2 }}>{profile.headline}</div>}
          {profile.bio && (
            <div style={{ fontSize: 13, color: C.MUTED, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.bio.split('\n')[0]}
            </div>
          )}
          {profile.languages?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {profile.languages.map((l) => (
                <span key={l} style={{ fontSize: 12, border: `1px solid ${C.ACCENT}`, color: C.ACCENT, borderRadius: 999, padding: '2px 8px' }}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="location" size={18} style={{ color: '#4F8062' }} />
          <span style={{ fontSize: 14, color: C.MUTED }}>服務區域</span>
          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500 }}>{regions.length ? regions.join('・') : '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="map" size={18} style={{ color: '#4F8062' }} />
          <span style={{ fontSize: 14, color: C.MUTED }}>導覽經驗</span>
          {editingExp ? (
            <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={expInput}
                  onChange={(e) => { setExpInput(e.target.value); setExpError(null); }}
                  style={{ width: 64, height: 32, borderRadius: 8, border: `1px solid ${C.BORDER}`, padding: '0 8px' }}
                />
                <button
                  type="button"
                  onClick={saveExperience}
                  disabled={savingExp}
                  style={{ background: 'transparent', border: 'none', color: C.ACCENT, cursor: 'pointer', fontWeight: 700 }}
                >
                  儲存
                </button>
              </div>
              {expError && (
                <span data-testid="midao2-me-exp-error" style={{ fontSize: 12, color: C.RED }}>
                  {expError}
                </span>
              )}
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500 }}>
              {experienceYears} 年
              <button
                type="button"
                data-testid="midao2-me-exp-edit"
                aria-label="編輯導覽經驗"
                onClick={() => { setExpInput(String(experienceYears)); setExpError(null); setEditingExp(true); }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
              >
                <Icon name="edit" size={14} />
              </button>
            </span>
          )}
        </div>
      </Card>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>精選服務</h2>
        {publicAvailable && services && services.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {services.map((s) => (
              <div
                key={s.activityId}
                style={{
                  position: 'relative', height: 140, borderRadius: 16, overflow: 'hidden',
                  // 無封面時用深色漸層底，維持白色標題可讀性
                  background: s.coverImageUrl
                    ? `center/cover no-repeat url(${s.coverImageUrl})`
                    : 'linear-gradient(135deg, #334155, #1e293b)',
                  display: 'flex', alignItems: 'flex-end', padding: 12,
                }}
              >
                <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Card style={{ background: C.ORANGE_SOFT }}>
            <div style={{ fontSize: 14, color: C.ORANGE, marginBottom: 12 }}>
              接案頁尚未公開：需要至少一個已上架服務
            </div>
            <Btn kind="secondary" onClick={() => { window.location.href = '/midao2/services'; }}>
              去上架服務
            </Btn>
          </Card>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
        <Btn kind="primary" onClick={handleShare} data-testid="midao2-me-share">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="share" size={16} />
            分享接案頁
          </span>
        </Btn>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" onClick={() => window.open('/g/' + slug)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="eye" size={16} />
              預覽接案頁
            </span>
          </Btn>
          <Btn kind="secondary" onClick={handleCopy} data-testid="midao2-me-copy-url">
            {copied ? (
              '✓ 已複製'
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={16} />
                複製網址
              </span>
            )}
          </Btn>
          <Btn kind="secondary" onClick={handleDownloadQr} data-testid="midao2-me-qr">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="qr-code" size={16} />
              下載 QR Code
            </span>
          </Btn>
        </div>
        <div ref={qrRef} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
          {publicUrl && <QRCodeSVG value={publicUrl} size={168} />}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.BORDER}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <a
          href="/guide/dashboard"
          data-testid="midao2-me-classic"
          style={{ fontSize: 14, color: C.TEXT, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="back" size={16} />
          切回傳統後台
        </a>
        <button
          type="button"
          data-testid="midao2-me-logout"
          onClick={handleLogout}
          style={{ background: 'transparent', border: 'none', color: C.RED, fontSize: 14, textAlign: 'left', padding: 0, cursor: 'pointer' }}
        >
          登出
        </button>
      </div>
    </div>
  );
}
