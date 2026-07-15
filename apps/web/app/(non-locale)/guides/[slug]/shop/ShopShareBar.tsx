'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { track } from '../../../../../src/lib/track';
import type { ShopShareProperties } from '../../../../../src/lib/events';

// 商店首頁分享列：複製連結／LINE 分享／QR code。
// URL 在 client 端以 window.location.origin 組出，商店首頁本體維持可快取。
export function ShopShareBar({ slug, displayName }: { slug: string; displayName: string }) {
  const path = `/guides/${slug}/shop`;
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const fullUrl = `${origin}${path}`;
  const shareText = `${displayName} 的祕島預約頁`;
  const lineHref = `https://line.me/R/msg/text/?${encodeURIComponent(`${shareText} ${fullUrl}`)}`;

  function emitShare(method: ShopShareProperties['method']) {
    track({ event_name: 'shop_share', properties: { guide_slug: slug, method } });
  }

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        // 後備：以隱藏 textarea + execCommand 複製（同導遊後台 ShopLinkCard）
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
      emitShare('copy');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const btnStyle: React.CSSProperties = {
    padding: '8px 16px', borderRadius: 999, border: '1px solid #b08d3e',
    fontSize: 13, fontWeight: 700, background: '#f7f0dd',
    color: '#1a2e1f', cursor: 'pointer', whiteSpace: 'nowrap',
  };

  return (
    <section data-testid="shop-share-bar" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" data-testid="shop-share-copy" onClick={copy} style={btnStyle}>
          {copied ? '✓ 已複製' : '複製連結'}
        </button>
        <a
          href={lineHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="shop-share-line"
          onClick={() => emitShare('line')}
          style={{ ...btnStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          LINE 分享
        </a>
        <button
          type="button"
          data-testid="shop-share-qr"
          onClick={() => {
            setShowQr((v) => {
              if (!v) emitShare('qr');
              return !v;
            });
          }}
          style={btnStyle}
        >
          {showQr ? '收合 QR code' : 'QR code'}
        </button>
      </div>
      {showQr && fullUrl && (
        <div
          data-testid="shop-share-qr-panel"
          style={{
            marginTop: 12, padding: 16, display: 'inline-flex', flexDirection: 'column',
            alignItems: 'center', gap: 8, borderRadius: 12, border: '1px solid var(--tp-border)',
            background: '#fff',
          }}
        >
          <QRCodeSVG value={fullUrl} size={160} />
          <span style={{ fontSize: 12, color: 'var(--tp-muted)' }}>掃描開啟預約頁</span>
        </div>
      )}
    </section>
  );
}
