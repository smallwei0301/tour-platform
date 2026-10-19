'use client';

import Image from 'next/image';
import { useRef, useState, type CSSProperties } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';
import ImageCropModal from '../ImageCropModal';

const LABEL: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const HINT: CSSProperties = { marginTop: 4, fontSize: 12, color: '#9ca3af' };

// ─── Avatar (1:1) upload field ──────────────────────────────────────
export default function AvatarField({ currentUrl, onUploaded, uploadUrl }: { currentUrl: string | null; onUploaded: (url: string) => void; uploadUrl: '/api/guide/profile/upload-avatar' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 裁切對話框已輸出 400×400 WebP，直接上傳即可（不需再 compressImage）。
  async function uploadCropped(cropped: File) {
    setPendingFile(null);
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', cropped);
      const res = await fetch(uploadUrl, {
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
      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={1}
          outputWidth={400}
          outputHeight={400}
          round
          title="調整頭像裁切"
          confirmLabel="套用並上傳"
          onCancel={() => setPendingFile(null)}
          onConfirm={uploadCropped}
        />
      )}
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
          <p style={{ ...HINT, marginTop: 6 }}>可自選裁切範圍與大小，確認後上傳</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        data-testid="avatar-file-input"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingFile(file);
          e.target.value = '';
        }}
      />
      {error && <p style={{ marginTop: 4, fontSize: 12, color: '#dc2626' }}>⚠️ {error}</p>}
    </div>
  );
}
