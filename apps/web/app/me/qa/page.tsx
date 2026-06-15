'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../src/lib/supabase/client';
import { MemberTabs } from '../../../src/components/me/MemberTabs';

type QaItem = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
  statusLabel: string;
  answered: boolean;
  targetKind: 'activity' | 'guide';
  targetTitle: string;
  targetHref: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

// 狀態膠囊：語意化淺底色票（深綠卡片上仍清晰），與訂單頁一致。
const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  approved:           { bg: '#d1fae5', color: '#065f46' }, // 已回覆/已公開
  pending_moderation: { bg: '#fef3c7', color: '#92400e' }, // 審核中
  rejected:           { bg: '#e5e7eb', color: '#374151' }, // 未通過
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending_moderation;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {label}
    </span>
  );
}

// 卡片標題：flex:1 + minWidth:0 讓其在 flex 容器中可收縮，2 行截斷 + 斷詞避免長標題破框。
const cardTitleStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

const pageStyle: React.CSSProperties = { paddingTop: 32, paddingBottom: 56, minHeight: '70vh' };
const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--tp-serif)', fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700,
  color: 'var(--tp-text)', margin: '0 0 4px', letterSpacing: '0.02em',
};

export default function MyQaPage() {
  const router = useRouter();
  const [items, setItems] = useState<QaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace(`/login?next=${encodeURIComponent('/me/qa')}`);
        return;
      }
      setAuthChecking(false);
      fetchQa();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchQa = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/me/qa', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent('/me/qa')}`);
        return;
      }
      const j = await res.json();
      setItems(j.data || []);
    } catch {
      setErr('查詢失敗，請稍後再試');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <main className="tp-container" style={{ ...pageStyle, textAlign: 'center', paddingTop: 80 }}>
        <p style={{ color: 'var(--tp-muted)' }}>驗證登入中…</p>
      </main>
    );
  }

  return (
    <main className="tp-container" style={pageStyle}>
      <h1 style={titleStyle} data-testid="my-qa-title">問答回覆</h1>
      <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: '0 0 20px' }}>
        你向行程或導遊提出的問題與回覆都集中在這裡。
      </p>
      <MemberTabs />

      {err && <p style={{ color: 'var(--tp-accent)', fontSize: 13, marginBottom: 16 }}>{err}</p>}

      {loading && <p style={{ color: 'var(--tp-muted)', textAlign: 'center', padding: '40px 0' }}>載入問答中…</p>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tp-muted)' }} data-testid="qa-empty">
          <div style={{ fontSize: 40, marginBottom: 10, opacity: 0.85 }}>💬</div>
          <p style={{ fontSize: 14, margin: '0 0 18px' }}>還沒有提問紀錄</p>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 14 }}>
            探索行程
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => (
            <div key={item.id} data-testid="qa-item" data-qa-status={item.status} className="tp-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                {item.targetHref ? (
                  <Link href={item.targetHref} style={{ ...cardTitleStyle, color: 'var(--tp-gold-strong)' }}>
                    {item.targetKind === 'guide' ? '✉️ ' : '🧭 '}{item.targetTitle}
                  </Link>
                ) : (
                  <span style={{ ...cardTitleStyle, color: 'var(--tp-muted)' }}>
                    {item.targetTitle}
                  </span>
                )}
                <StatusBadge status={item.status} label={item.statusLabel} />
              </div>

              <p style={{ margin: '0 0 10px', color: 'var(--tp-text)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                <span style={{ fontWeight: 800, color: 'var(--tp-muted)', marginRight: 6 }}>Q</span>{item.question}
              </p>

              {item.answer ? (
                <div data-testid="qa-answer" style={{ background: 'var(--tp-tint)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: '10px 12px' }}>
                  <p style={{ margin: 0, color: 'var(--tp-text)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    <span style={{ fontWeight: 800, color: 'var(--tp-gold-strong)', marginRight: 6 }}>A</span>{item.answer}
                  </p>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--tp-muted)' }}>
                  {item.status === 'rejected' ? '此提問未通過審核。' : '導遊尚未回覆，回覆後會顯示在這裡。'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
