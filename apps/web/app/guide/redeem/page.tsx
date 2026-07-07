'use client';

/**
 * #1637 導遊端電子憑證核銷頁。
 *
 * 兩種核銷方式：
 * 1. 相機掃 QR（瀏覽器支援 BarcodeDetector 時）：掃旅客訂單頁的憑證 QR
 *    → 解析 token → POST /api/v2/guide/orders/[orderId]/redeem。
 * 2. 短碼輸入（通用備援）：輸入憑證卡上的 MID-XXXXXX
 *    → POST /api/v2/guide/redeem/by-code（只比對自己名下已確認的訂單）。
 *
 * 核銷成功＝訂單 confirmed → completed，直接進入結算資格鏈（T+7 後自動入帳）。
 */
import { useEffect, useRef, useState } from 'react';
import { csrfHeaders, ensureCsrfToken } from '../../../src/lib/csrf-client';

type RedeemResult = {
  kind: 'success' | 'already' | 'error';
  message: string;
  orderId?: string | null;
  contactName?: string | null;
  peopleCount?: number | null;
};

const VOUCHER_TOKEN_RE = /^v1\.([0-9a-fA-F-]{36})\.[0-9a-f]{64}$/;

export default function GuideRedeemPage() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [scanSupported, setScanSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // guide layout 已於掛載時 prime /api/guide/auth/csrf；此處兜底確保 cookie 存在
    void ensureCsrfToken();
    setScanSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window);
    return () => stopScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopScan() {
    if (scanTimerRef.current) { clearInterval(scanTimerRef.current); scanTimerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  async function redeemByToken(token: string) {
    const m = VOUCHER_TOKEN_RE.exec(token.trim());
    if (!m) {
      setResult({ kind: 'error', message: '這不是有效的憑證 QR，請確認掃的是旅客訂單頁的電子憑證。' });
      return;
    }
    const orderId = m[1];
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/v2/guide/orders/${orderId}/redeem`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ token: token.trim() }),
      });
      const j = await res.json();
      if (j?.ok && j?.data?.redeemed) {
        setResult({ kind: 'success', message: '核銷成功！訂單已標記完成，將於結算條件達成後自動入帳。', orderId });
      } else if (j?.ok && j?.data?.alreadyRedeemed) {
        setResult({ kind: 'already', message: '這張憑證先前已核銷過（訂單已是完成狀態）。', orderId });
      } else {
        setResult({ kind: 'error', message: j?.error?.message || `核銷失敗（HTTP ${res.status}）` });
      }
    } catch {
      setResult({ kind: 'error', message: '核銷失敗，請檢查網路後再試。' });
    } finally {
      setBusy(false);
    }
  }

  async function redeemByCode() {
    if (!code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/v2/guide/redeem/by-code', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ code: code.trim() }),
      });
      const j = await res.json();
      const d = j?.data;
      if (j?.success && d?.redeemed) {
        setResult({ kind: 'success', message: '核銷成功！訂單已標記完成，將於結算條件達成後自動入帳。', orderId: d.orderId, contactName: d.contactName, peopleCount: d.peopleCount });
        setCode('');
      } else if (j?.success && d?.alreadyRedeemed) {
        setResult({ kind: 'already', message: '這張憑證先前已核銷過（訂單已是完成狀態）。', orderId: d.orderId, contactName: d.contactName, peopleCount: d.peopleCount });
      } else {
        setResult({ kind: 'error', message: j?.error?.message || `核銷失敗（HTTP ${res.status}）` });
      }
    } catch {
      setResult({ kind: 'error', message: '核銷失敗，請檢查網路後再試。' });
    } finally {
      setBusy(false);
    }
  }

  async function startScan() {
    setScanError('');
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      // video element 於 scanning=true 後才 render，等一個 tick 再綁 stream
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
      const Detector = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code'] });
      scanTimerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => VOUCHER_TOKEN_RE.test(String(c.rawValue || '').trim()));
          if (hit) {
            stopScan();
            await redeemByToken(String(hit.rawValue).trim());
          }
        } catch { /* 單幀偵測失敗照常輪詢下一幀 */ }
      }, 400);
    } catch {
      setScanError('無法開啟相機（未授權或裝置不支援），請改用下方短碼輸入。');
      stopScan();
    }
  }

  const resultStyles: Record<RedeemResult['kind'], React.CSSProperties> = {
    success: { background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' },
    already: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' },
    error: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' },
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 48px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 4px' }}>🎫 憑證核銷</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.8 }}>
        出團當日核銷旅客的電子憑證：掃描旅客訂單頁的 QR，或輸入憑證卡上的短碼。
        核銷後訂單即標記完成，並於結算條件達成後自動計入你的可結算餘額。
      </p>

      {result && (
        <div
          role="alert"
          data-testid="redeem-result"
          style={{ padding: '12px 16px', borderRadius: 10, fontSize: 14, lineHeight: 1.8, marginBottom: 16, ...resultStyles[result.kind] }}
        >
          <strong>{result.kind === 'success' ? '✅ ' : result.kind === 'already' ? 'ℹ️ ' : '⚠️ '}</strong>
          {result.message}
          {result.orderId && (
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.85 }}>
              訂單 <span style={{ fontFamily: 'monospace' }}>{result.orderId.slice(0, 8)}…</span>
              {result.contactName && ` · 旅客 ${result.contactName}`}
              {result.peopleCount != null && ` · ${result.peopleCount} 位`}
            </div>
          )}
        </div>
      )}

      {/* 掃碼區 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>📷 掃描憑證 QR</h2>
        {scanSupported === false && (
          <p style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
            此瀏覽器不支援相機掃碼，請改用下方短碼輸入（iPhone 也可以直接用相機 App 掃旅客的 QR 後由旅客出示短碼給你）。
          </p>
        )}
        {scanSupported && !scanning && (
          <button
            onClick={() => void startScan()}
            disabled={busy}
            data-testid="redeem-scan-start"
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, background: '#1B6B4A', color: '#fff', cursor: 'pointer' }}
          >
            開啟相機掃碼
          </button>
        )}
        {scanning && (
          <div>
            <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            <button
              onClick={stopScan}
              style={{ marginTop: 8, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', cursor: 'pointer' }}
            >
              停止掃描
            </button>
          </div>
        )}
        {scanError && <p style={{ fontSize: 13, color: '#b91c1c', margin: '8px 0 0' }}>{scanError}</p>}
      </div>

      {/* 短碼區 */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>⌨️ 輸入憑證短碼</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
          旅客憑證卡 QR 下方的短碼（例：MID-A2B3C4）。只會比對你名下已確認的訂單。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void redeemByCode(); }}
            placeholder="MID-XXXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            data-testid="redeem-code-input"
            style={{ flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, letterSpacing: '0.08em', fontFamily: 'monospace', textTransform: 'uppercase' }}
          />
          <button
            onClick={() => void redeemByCode()}
            disabled={busy || !code.trim()}
            data-testid="redeem-code-submit"
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
              background: busy || !code.trim() ? '#f1f5f9' : '#1B6B4A',
              color: busy || !code.trim() ? '#94a3b8' : '#fff',
              cursor: busy || !code.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '核銷中…' : '核銷'}
          </button>
        </div>
      </div>
    </div>
  );
}
