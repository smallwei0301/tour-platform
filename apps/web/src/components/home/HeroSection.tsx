'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function HeroSection() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/activities?q=${encodeURIComponent(q)}` : '/activities');
  }

  return (
    <section className="tp-hero" style={{
      backgroundImage: 'linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.58)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1600&q=80)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      minHeight: '580px',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div className="tp-container">
        <p className="tp-kicker" style={{ color: '#E8834D', letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>台灣在地導遊平台</p>
        <h1 style={{ color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.35)', fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.3 }}>
          找到懂路的人，<br />帶你走進台灣最有故事的地方
        </h1>
        <p className="tp-hero-sub" style={{ color: 'rgba(255,255,255,0.9)', maxWidth: 560, lineHeight: 1.8 }}>
          不跟團、不趕路。預約在地導遊，用你的節奏認識這座島嶼。
        </p>

        {/* 搜尋框 */}
        <form onSubmit={handleSearch} style={{
          display: 'flex', gap: 0, maxWidth: 560, marginTop: 24, marginBottom: 24,
          background: '#fff', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋行程、地區、導遊⋯ 例如：柴山、溯溪、台北"
            style={{
              flex: 1, padding: '14px 18px', fontSize: 15, border: 'none', outline: 'none',
              color: '#222', background: 'transparent',
            }}
          />
          <button type="submit" style={{
            padding: '14px 22px', background: 'var(--tp-primary)', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15,
            whiteSpace: 'nowrap',
          }}>
            搜尋 🔍
          </button>
        </form>

        {/* 熱門標籤 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {['柴山探洞', '花蓮溯溪', '大稻埕', '夜市美食'].map((tag) => (
            <button key={tag} onClick={() => router.push(`/activities?q=${encodeURIComponent(tag)}`)}
              style={{
                background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.3)', color: '#fff',
                padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              }}>
              🔍 {tag}
            </button>
          ))}
        </div>

        {/* 信任標章 */}
        <div className="tp-trust-grid tp-trust-grid-home" style={{ gap: '12px', maxWidth: 560 }}>
          {[
            { icon: '✅', text: '實名認證導遊' },
            { icon: '💰', text: '透明定價' },
            { icon: '🔒', text: '安全付款' },
            { icon: '📞', text: '即時客服' },
          ].map(({ icon, text }) => (
            <div key={text} style={{
              background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)', color: '#fff',
              padding: '10px 14px', borderRadius: 10, textAlign: 'center', fontSize: 13,
            }}>
              {icon} {text}
            </div>
          ))}
        </div>

        <div className="tp-cta-row" style={{ marginTop: 24 }}>
          <Link href="/activities" className="tp-btn tp-btn-primary" style={{ fontSize: 16, padding: '13px 28px' }}>
            探索全部行程
          </Link>
          <Link href="/guides" className="tp-btn tp-btn-ghost" style={{ fontSize: 16, padding: '13px 28px', borderColor: '#fff', color: '#fff' }}>
            認識導遊
          </Link>
        </div>
      </div>
    </section>
  );
}
