'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { csrfHeaders } from '../../../src/lib/csrf-client';
import { listAllDivisions, normalizeRegionToDbValue } from '../../../src/lib/region-slugs.mjs';
import { GUIDE_PAYMENT_OPTIONS } from '../../../src/lib/guide-payment-options.mjs';
import { compressImage } from '../../../src/lib/client-image-compress';
import NotificationBindingButton from '../../../src/components/NotificationBindingButton';

// 熟悉區域：顯示短名（displayName）、儲存全名（dbValue），與行程地區格式一致。
const REGION_OPTIONS = listAllDivisions();

// Client component 必須用「字面量」process.env.NEXT_PUBLIC_* 才會被 Next 於 build 內嵌；
// 透過 feature-flags.mjs 的 env 參數間接讀取（env.NEXT_PUBLIC_*）在 client bundle 不會被
// 替換 → 永遠 undefined → 旗標誤判為關閉（這就是商店連結卡片先前不顯示的原因）。
const SHOP_ENABLED =
  process.env.NEXT_PUBLIC_GUIDE_SHOP_ENABLED === '1' ||
  process.env.NEXT_PUBLIC_GUIDE_SHOP_ENABLED === 'true';

type Profile = {
  display_name: string;
  headline: string;
  bio: string;
  region: string;
  regions: string[];
  certifications: string[];
  payment_methods: string[];
  languages: string[];
  specialties: string[];
  profile_photo_url: string | null;
  hero_image_url: string | null;
  gallery_urls: string[];
  slug: string | null;
  is_published: boolean;
  bank_name: string;
  account_name: string;
  account_number: string;
  transfer_note: string;
};

const EMPTY: Profile = {
  display_name: '', headline: '', bio: '', region: '',
  regions: [], certifications: [], payment_methods: [],
  languages: [], specialties: [],
  profile_photo_url: null, hero_image_url: null, gallery_urls: [],
  slug: null,
  is_published: false,
  bank_name: '', account_name: '', account_number: '', transfer_note: '',
};

const GALLERY_MAX = 12;
const PURPLE = '#7c3aed';
const PURPLE_SOFT = '#f5f3ff';

// ─── small design tokens ─────────────────────────────────────────────
const CARD: CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 20,
};
const SECTION_TITLE: CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700, color: '#111' };
const SECTION_HINT: CSSProperties = { margin: '4px 0 0', fontSize: 12, color: '#6b7280' };
const LABEL: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const HINT: CSSProperties = { marginTop: 4, fontSize: 12, color: '#9ca3af' };
const INPUT: CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
  outline: 'none',
};

export default function GuideProfileEditPage() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') setIsNew(document.cookie.includes('guide_is_new=1'));
    void fetch('/api/guide/auth/csrf', { cache: 'no-store' });
    fetch('/api/guide/profile')
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) {
          const d = json.data ?? {};
          setProfile({
            display_name: d.display_name ?? '',
            headline: d.headline ?? '',
            bio: d.bio ?? '',
            // 舊資料可能存短名（高雄），載入時正規化成全名（高雄市），讓 chip 對得上並在存回時統一。
            region: normalizeRegionToDbValue(d.region ?? ''),
            regions: Array.isArray(d.regions)
              ? Array.from(new Set(
                  (d.regions as unknown[])
                    .map((r) => normalizeRegionToDbValue(r) as string)
                    .filter((x): x is string => Boolean(x)),
                ))
              : [],
            certifications: Array.isArray(d.certifications) ? d.certifications : [],
            payment_methods: Array.isArray(d.payment_methods) ? d.payment_methods : [],
            languages: Array.isArray(d.languages) ? d.languages : [],
            specialties: Array.isArray(d.specialties) ? d.specialties : [],
            profile_photo_url: d.profile_photo_url ?? null,
            hero_image_url: d.hero_image_url ?? null,
            gallery_urls: Array.isArray(d.gallery_urls) ? d.gallery_urls : [],
            slug: d.slug ?? null,
            is_published: d.is_published ?? false,
            bank_name: d.bank_name ?? '',
            account_name: d.account_name ?? '',
            account_number: d.account_number ?? '',
            transfer_note: d.transfer_note ?? '',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // nextPublished：發佈目標狀態。儲存成功後同步本地狀態並清除首次引導。
  async function save(nextPublished: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/guide/profile', {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          display_name: profile.display_name,
          headline: profile.headline,
          bio: profile.bio,
          region: profile.regions[0] ?? profile.region,
          regions: profile.regions,
          certifications: profile.certifications,
          payment_methods: profile.payment_methods,
          languages: profile.languages,
          specialties: profile.specialties,
          gallery_urls: profile.gallery_urls,
          is_published: nextPublished,
          bank_name: profile.bank_name,
          account_name: profile.account_name,
          account_number: profile.account_number,
          transfer_note: profile.transfer_note,
        }),
      });
      const json = await res.json();
      if (json?.ok) {
        update('is_published', nextPublished);
        setMessage({
          kind: 'ok',
          text: nextPublished
            ? '已儲存並公開！旅客重新整理「認識導遊」即可看到你的最新資訊。'
            : profile.is_published
              ? '已儲存並取消公開，你的頁面暫時不會出現在認識導遊。'
              : '已儲存（尚未公開）。',
        });
        if (isNew) {
          setIsNew(false);
          document.cookie = 'guide_is_new=; Path=/guide; Max-Age=0';
          document.cookie = 'guide_is_new=; Path=/; Max-Age=0';
        }
      } else {
        setMessage({ kind: 'err', text: `儲存失敗：${json?.error?.message ?? '未知錯誤'}` });
      }
    } catch (err) {
      setMessage({ kind: 'err', text: `儲存失敗：${err instanceof Error ? err.message : '網路錯誤'}` });
    } finally {
      setSaving(false);
    }
  }

  // 表單預設提交：維持目前發佈狀態（純存檔）。
  function handleSave(e: FormEvent) {
    e.preventDefault();
    void save(profile.is_published);
  }

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>載入中…</div>;
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 首次登入引導：說明先調整、再公開 */}
      {isNew && (
        <div
          data-testid="guide-profile-onboarding"
          style={{
            background: PURPLE_SOFT, border: `1px solid #ddd6fe`, borderRadius: 12,
            padding: '14px 16px', fontSize: 14, lineHeight: 1.8, color: '#5b21b6',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>👋 歡迎加入！先完善你的公開頁吧</p>
          <p style={{ margin: '4px 0 0' }}>
            你的導遊頁目前<strong>尚未公開</strong>。調整下方的照片與介紹後，按「儲存並公開」，
            旅客就能在「認識導遊」看到你。隨時可以再回來修改或取消公開。
          </p>
        </div>
      )}

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111' }}>編輯公開導遊頁面</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>設定旅客在你的公開頁上會看到的內容</p>
        </div>
        {profile.slug && (
          <Link
            href={`/guides/${profile.slug}`}
            target="_blank"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '7px 12px', fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: `1px solid #ddd6fe`,
              background: PURPLE_SOFT, color: PURPLE, textDecoration: 'none',
            }}
          >
            🔗 查看公開頁
          </Link>
        )}
      </div>

      {/* 預約商店連結（#1475）：可一鍵複製分享給旅客 */}
      {SHOP_ENABLED && profile.slug && <ShopLinkCard slug={profile.slug} />}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Section 1: Imagery ── */}
        <section style={CARD}>
          <header style={{ marginBottom: 16 }}>
            <h2 style={SECTION_TITLE}>形象圖片</h2>
            <p style={SECTION_HINT}>封面顯示在公開頁頂部，頭像顯示在卡片與評論中</p>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <HeroField
              currentUrl={profile.hero_image_url}
              onUploaded={(url) => update('hero_image_url', url)}
            />
            <AvatarField
              currentUrl={profile.profile_photo_url}
              onUploaded={(url) => update('profile_photo_url', url)}
            />
          </div>
        </section>

        {/* ── Section 2: Basic info ── */}
        <section style={CARD}>
          <header style={{ marginBottom: 16 }}>
            <h2 style={SECTION_TITLE}>基本資訊</h2>
            <p style={SECTION_HINT}>顯示在公開頁的標題與簡介區</p>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="display_name" style={LABEL}>顯示名稱</label>
              <input
                id="display_name"
                type="text"
                value={profile.display_name}
                onChange={(e) => update('display_name', e.target.value)}
                required
                style={INPUT}
              />
            </div>

            <div>
              <label htmlFor="headline" style={LABEL}>一句話介紹</label>
              <input
                id="headline"
                type="text"
                value={profile.headline}
                maxLength={120}
                onChange={(e) => update('headline', e.target.value)}
                placeholder="例：擁有 8 年帶團經驗的在地嚮導"
                style={INPUT}
              />
              <p style={HINT}>會顯示在姓名下方（建議 60 字內）</p>
            </div>

            <div>
              <span style={LABEL}>熟悉區域</span>
              <ToggleChips
                ariaLabel="熟悉區域"
                options={REGION_OPTIONS.map((d) => ({ id: d.dbValue, label: d.displayName }))}
                values={profile.regions}
                onChange={(next) => update('regions', next)}
              />
              <p style={HINT}>申請時選的區域已自動帶入，可自行勾選增減</p>
            </div>

            <div>
              <span style={LABEL}>語言</span>
              <ChipsInput
                ariaLabel="語言"
                values={profile.languages}
                onChange={(next) => update('languages', next)}
                placeholder="例：中文、英文、日文"
              />
              <p style={HINT}>按 Enter 或逗號新增；點 ✕ 移除</p>
            </div>

            <div>
              <span style={LABEL}>專長</span>
              <ChipsInput
                ariaLabel="專長"
                values={profile.specialties}
                onChange={(next) => update('specialties', next)}
                placeholder="例：歷史導覽、美食探訪"
              />
              <p style={HINT}>按 Enter 或逗號新增；點 ✕ 移除</p>
            </div>

            <div>
              <span style={LABEL}>專業證照</span>
              <ChipsInput
                ariaLabel="專業證照"
                values={profile.certifications}
                onChange={(next) => update('certifications', next)}
                placeholder="例：導遊證、急救證照"
              />
              <p style={HINT}>申請時填寫的證照已自動帶入；按 Enter 或逗號新增、點 ✕ 移除</p>
            </div>

            <div>
              <span style={LABEL}>收款方式</span>
              <ToggleChips
                ariaLabel="收款方式"
                options={GUIDE_PAYMENT_OPTIONS as unknown as Array<{ id: string; label: string }>}
                values={profile.payment_methods}
                onChange={(next) => update('payment_methods', next)}
              />
              <p style={HINT}>可複選；會顯示在你的公開頁，讓旅客知道可接受的付款方式</p>
            </div>

            <div>
              <label htmlFor="bio" style={LABEL}>個人介紹</label>
              <textarea
                id="bio"
                rows={6}
                value={profile.bio}
                onChange={(e) => update('bio', e.target.value)}
                placeholder="介紹你自己、帶團風格、為什麼適合帶旅客探索這個地方…"
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <p style={HINT}>會顯示在「關於我」區塊</p>
            </div>
          </div>
        </section>

        {/* ── Section 3: Gallery ── */}
        <section style={CARD}>
          <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <h2 style={SECTION_TITLE}>照片集</h2>
              <p style={SECTION_HINT}>建議比例 3:2（橫式），最多 {GALLERY_MAX} 張</p>
            </div>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {profile.gallery_urls.length} / {GALLERY_MAX}
            </span>
          </header>

          <GalleryEditor
            urls={profile.gallery_urls}
            onChange={(next) => update('gallery_urls', next)}
          />
        </section>

        {/* ── 匯款資訊（#1475，不公開）── */}
        <section style={CARD} data-testid="guide-transfer-info">
          <header style={{ marginBottom: 16 }}>
            <h2 style={SECTION_TITLE}>匯款資訊</h2>
            <p style={SECTION_HINT}>
              此資訊<strong>不會公開</strong>，僅當旅客在付款時選擇「自行匯款」才會顯示給該筆訂單的旅客。
              收到款項後，請於後台確認入帳。
            </p>
          </header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="bank_name" style={LABEL}>銀行（含分行）</label>
              <input
                id="bank_name"
                type="text"
                value={profile.bank_name}
                onChange={(e) => update('bank_name', e.target.value)}
                placeholder="例：國泰世華銀行 三民分行（700）"
                style={INPUT}
              />
            </div>
            <div>
              <label htmlFor="account_name" style={LABEL}>戶名</label>
              <input
                id="account_name"
                type="text"
                value={profile.account_name}
                onChange={(e) => update('account_name', e.target.value)}
                placeholder="例：吳洛晴"
                style={INPUT}
              />
            </div>
            <div>
              <label htmlFor="account_number" style={LABEL}>帳號</label>
              <input
                id="account_number"
                type="text"
                inputMode="numeric"
                value={profile.account_number}
                onChange={(e) => update('account_number', e.target.value)}
                placeholder="例：0123456789012"
                style={INPUT}
              />
            </div>
            <div>
              <label htmlFor="transfer_note" style={LABEL}>匯款備註（選填）</label>
              <textarea
                id="transfer_note"
                rows={3}
                value={profile.transfer_note}
                onChange={(e) => update('transfer_note', e.target.value)}
                placeholder="例：請於 24 小時內完成匯款，並保留收據；帳號末五碼將用於核帳。"
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </section>

        {/* 通知綁定：把訂單通知接到你的 LINE / Telegram */}
        <section style={CARD} data-testid="guide-notification-binding">
          <header style={{ marginBottom: 4 }}>
            <h2 style={SECTION_TITLE}>訂單通知綁定</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              你負責的行程有新訂單／付款／取消／退款時，會以 Email／Telegram 通知你。
            </p>
          </header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <NotificationBindingButton
              endpoint="/api/guide/line-binding"
              channel="line"
              title="LINE 綁定（選填）"
              description="綁定 LINE 官方帳號；訂單通知請改用下方 Telegram 或 Email。"
              accent="#06c755"
            />
            <NotificationBindingButton
              endpoint="/api/guide/telegram-binding"
              channel="telegram"
              title="Telegram 通知"
              description="點按開啟 Telegram bot，按 START 即完成。"
              accent="#229ED9"
            />
          </div>
        </section>

        {/* Footer：發佈狀態 + 公開/取消公開動作 */}
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 5,
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(6px)',
          borderTop: '1px solid #e5e7eb',
          padding: '12px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              data-testid="guide-publish-status"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
                color: profile.is_published ? '#16a34a' : '#b45309',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: profile.is_published ? '#16a34a' : '#f59e0b' }} />
              {profile.is_published ? '公開中（認識導遊頁可見）' : '尚未公開（旅客看不到）'}
            </span>
            {message && (
              <p style={{ margin: 0, fontSize: 13, color: message.kind === 'ok' ? '#16a34a' : '#dc2626' }}>{message.text}</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
            {profile.is_published ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(false)}
                  style={{
                    padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
                    fontSize: 14, fontWeight: 600, color: '#b45309', background: '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  取消公開
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '9px 22px', borderRadius: 8, border: 'none',
                    fontSize: 14, fontWeight: 700, color: '#fff',
                    background: saving ? '#a78bfa' : PURPLE,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '儲存中…' : '儲存變更'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(false)}
                  style={{
                    padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
                    fontSize: 14, fontWeight: 600, color: '#374151', background: '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  僅儲存（暫不公開）
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                  style={{
                    padding: '9px 22px', borderRadius: 8, border: 'none',
                    fontSize: 14, fontWeight: 700, color: '#fff',
                    background: saving ? '#a78bfa' : PURPLE,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? '儲存中…' : '儲存並公開'}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────── helpers ──────────────────────────────

// 預約商店連結卡：顯示完整網址 + 一鍵複製（#1475）
function ShopLinkCard({ slug }: { slug: string }) {
  const path = `/guides/${slug}/shop`;
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const fullUrl = `${origin}${path}`;

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        // 後備：以隱藏 textarea + execCommand 複製
        const ta = document.createElement('textarea');
        ta.value = fullUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section style={CARD} data-testid="guide-shop-link">
      <header style={{ marginBottom: 12 }}>
        <h2 style={SECTION_TITLE}>預約商店連結</h2>
        <p style={SECTION_HINT}>把這個連結分享給旅客，他們即可直接向你線上預約。</p>
      </header>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          readOnly
          aria-label="預約商店連結"
          data-testid="guide-shop-link-url"
          value={fullUrl}
          onFocus={(e) => e.currentTarget.select()}
          style={{ ...INPUT, flex: '1 1 240px', background: '#f9fafb', color: '#374151' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            data-testid="guide-shop-link-copy"
            onClick={copy}
            style={{
              padding: '9px 16px', borderRadius: 8, border: 'none',
              fontSize: 14, fontWeight: 700, color: '#fff',
              background: copied ? '#16a34a' : PURPLE, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {copied ? '✓ 已複製' : '複製連結'}
          </button>
          <Link
            href={path}
            target="_blank"
            className=""
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '9px 14px', fontSize: 14, fontWeight: 600,
              borderRadius: 8, border: '1px solid #ddd6fe',
              background: PURPLE_SOFT, color: PURPLE, textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            開啟
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Chip-style multi-value input. Enter / 半形/全形逗號 commits; Backspace
 * on an empty draft pops the last chip; blur commits any draft.
 */
function ChipsInput({
  values, onChange, placeholder, ariaLabel,
}: { values: string[]; onChange: (next: string[]) => void; placeholder?: string; ariaLabel: string }) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) { setDraft(''); return; }
    onChange([...values, trimmed]);
    setDraft('');
  }

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
      padding: '6px 8px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff',
    }}>
      {values.map((v, i) => (
        <span key={`${v}-${i}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          background: PURPLE_SOFT, color: '#6d28d9', fontSize: 12, fontWeight: 600,
        }}>
          {v}
          <button
            type="button"
            aria-label={`移除 ${v}`}
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            style={{ border: 'none', background: 'none', color: PURPLE, fontSize: 12, cursor: 'pointer', padding: 0, lineHeight: 1 }}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          if (val.endsWith(',') || val.endsWith('，')) {
            commit(val.slice(0, -1));
          } else {
            setDraft(val);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
          else if (e.key === 'Backspace' && !draft && values.length > 0) onChange(values.slice(0, -1));
        }}
        onBlur={() => draft && commit(draft)}
        placeholder={values.length === 0 ? placeholder : ''}
        style={{
          flex: '1 1 140px', minWidth: 120,
          padding: '4px 4px', fontSize: 14, border: 'none', outline: 'none', background: 'transparent',
        }}
      />
    </div>
  );
}

/**
 * 固定選項的多選 chips（熟悉區域、收款方式）。點選切換、已選高亮。
 */
function ToggleChips({
  options, values, onChange, ariaLabel,
}: { options: Array<{ id: string; label: string }>; values: string[]; onChange: (next: string[]) => void; ariaLabel: string }) {
  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = values.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(opt.id)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              border: active ? `1px solid ${PURPLE}` : '1px solid #d1d5db',
              background: active ? PURPLE_SOFT : '#fff',
              color: active ? '#6d28d9' : '#374151',
            }}
          >
            {active ? '✓ ' : ''}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Hero (16:9 cover) upload field ──────────────────────────────────
function HeroField({ currentUrl, onUploaded }: { currentUrl: string | null; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true); setError('');
    try {
      const compressed = await compressImage(file, 'hero');
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch('/api/guide/profile/upload-hero', {
        method: 'POST', headers: csrfHeaders(), body: fd,
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message ?? '上傳失敗');
      onUploaded(json.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <span style={LABEL}>封面圖（16:9，建議 1920×1080）</span>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        style={{
          position: 'relative', width: '100%', aspectRatio: '16 / 9',
          borderRadius: 10, overflow: 'hidden',
          border: currentUrl ? '1px solid #e5e7eb' : '2px dashed #d1d5db',
          background: '#f9fafb',
          cursor: busy ? 'wait' : 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        {currentUrl ? (
          <Image src={currentUrl} alt="封面預覽" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 600px" />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
          }}>
            <span style={{ fontSize: 32 }}>📷</span>
            <span style={{ marginTop: 4, fontSize: 13 }}>點擊上傳封面</span>
          </div>
        )}
        {busy && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 600,
          }}>
            上傳中…
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>⚠️ {error}</p>}
    </div>
  );
}

// ─── Avatar (1:1) upload field ──────────────────────────────────────
function AvatarField({ currentUrl, onUploaded }: { currentUrl: string | null; onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true); setError('');
    try {
      const compressed = await compressImage(file, 'avatar');
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch('/api/guide/profile/upload-avatar', {
        method: 'POST', headers: csrfHeaders(), body: fd,
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message ?? '上傳失敗');
      onUploaded(json.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
    } finally { setBusy(false); }
  }

  return (
    <div>
      <span style={LABEL}>頭像（正方形，建議 400×400）</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div
          onClick={() => !busy && inputRef.current?.click()}
          style={{
            position: 'relative', width: 96, height: 96,
            borderRadius: '50%', overflow: 'hidden',
            border: currentUrl ? '2px solid #e5e7eb' : '2px dashed #d1d5db',
            background: '#f9fafb',
            cursor: busy ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {currentUrl ? (
            <Image src={currentUrl} alt="頭像預覽" fill style={{ objectFit: 'cover' }} sizes="96px" />
          ) : (
            <span style={{ fontSize: 32, color: '#9ca3af' }}>👤</span>
          )}
          {busy && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600,
            }}>
              上傳中…
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid #d1d5db', background: '#fff',
              fontSize: 13, fontWeight: 600, color: '#374151',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {currentUrl ? '更換頭像' : '上傳頭像'}
          </button>
          <p style={{ ...HINT, marginTop: 6 }}>會自動中央裁切為正方形</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>⚠️ {error}</p>}
    </div>
  );
}

// ─── Gallery grid + add tile ────────────────────────────────────────
function GalleryEditor({ urls, onChange }: { urls: string[]; onChange: (next: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = urls.length >= GALLERY_MAX;

  async function handleFile(file: File) {
    if (full) return;
    setBusy(true); setError('');
    try {
      const compressed = await compressImage(file, 'gallery');
      const fd = new FormData();
      fd.append('file', compressed);
      const res = await fetch('/api/guide/profile/upload-gallery', {
        method: 'POST', headers: csrfHeaders(), body: fd,
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message ?? '上傳失敗');
      onChange(Array.isArray(json.data?.gallery_urls) ? json.data.gallery_urls : [...urls, json.data.url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
    } finally { setBusy(false); }
  }

  function removeAt(idx: number) {
    onChange(urls.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 12,
      }}>
        {urls.map((url, i) => (
          <div
            key={url}
            style={{
              position: 'relative', aspectRatio: '3 / 2',
              borderRadius: 10, overflow: 'hidden',
              border: '1px solid #e5e7eb', background: '#f9fafb',
            }}
          >
            <Image src={url} alt={`照片 ${i + 1}`} fill style={{ objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, 200px" />
            <button
              type="button"
              aria-label={`移除照片 ${i + 1}`}
              onClick={() => removeAt(i)}
              style={{
                position: 'absolute', top: 6, right: 6,
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            style={{
              aspectRatio: '3 / 2',
              borderRadius: 10, border: '2px dashed #d1d5db',
              background: '#f9fafb', color: '#9ca3af',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = PURPLE; e.currentTarget.style.background = PURPLE_SOFT; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#f9fafb'; }}
          >
            <span style={{ fontSize: 24 }}>＋</span>
            <span style={{ marginTop: 4, fontSize: 12 }}>{busy ? '上傳中…' : '新增照片'}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {error && <p style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>⚠️ {error}</p>}
    </div>
  );
}

// client-side center-crop + WebP compress 已抽到 src/lib/client-image-compress.ts
// （申請表單與導遊後台共用，避免重複實作）。
