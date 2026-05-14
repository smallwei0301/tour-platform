'use client';
import Image from 'next/image';

import { useState, useRef, useCallback } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

interface AvatarUploadProps {
  guideId: string;
  currentUrl?: string;
  onUpload: (url: string) => void;
  size?: number; // Display size in pixels
}

/**
 * Compress and crop image to square avatar (400x400 WebP)
 */
async function compressToSquareAvatar(file: File, targetSize = 400): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate crop dimensions (center crop to square)
      const { width, height } = img;
      const minDim = Math.min(width, height);
      const cropX = (width - minDim) / 2;
      const cropY = (height - minDim) / 2;

      // Create canvas at target size
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d')!;

      // Draw cropped & scaled image
      ctx.drawImage(
        img,
        cropX, cropY, minDim, minDim,  // Source crop
        0, 0, targetSize, targetSize    // Destination
      );

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('壓縮失敗')); return; }
          resolve(new File([blob], 'avatar.webp', { type: 'image/webp' }));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = url;
  });
}

export function AvatarUpload({ guideId, currentUrl, onUpload, size = 120 }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true);
    setError('');
    setProgress('裁切壓縮中⋯');

    try {
      // Compress to 400x400 square WebP
      const compressed = await compressToSquareAvatar(file, 400);
      const kb = Math.round(compressed.size / 1024);
      setProgress(`上傳中⋯ (${kb}KB)`);

      // Create preview
      const preview = URL.createObjectURL(compressed);
      setPreviewUrl(preview);

      const fd = new FormData();
      fd.append('file', compressed);

      const res = await fetch(`/api/admin/guides/${guideId}/upload-avatar`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: fd,
      });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error?.message || '上傳失敗');

      setProgress('');
      onUpload(json.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
      setProgress('');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }, [guideId, onUpload]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('請選擇圖片檔案');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('檔案大小不能超過 10MB');
      return;
    }

    uploadFile(file);
  }

  const displayUrl = previewUrl || currentUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* Avatar preview */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          background: displayUrl ? 'transparent' : '#e5e7eb',
          border: '3px solid #e5e7eb',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => { if (!uploading) (e.target as HTMLElement).style.borderColor = '#7c3aed'; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; }}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt="頭像預覽"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} width={1200} height={675} />
        ) : (
          <span style={{ fontSize: size * 0.35, color: '#9ca3af' }}>👤</span>
        )}

        {/* Hover overlay */}
        {!uploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.2s',
              borderRadius: '50%',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '0'; }}
          >
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>📷 更換</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Status messages */}
      {uploading && (
        <div style={{ fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>{progress}</div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '6px 12px', borderRadius: 6 }}>
          ⚠️ {error}
        </div>
      )}

      {!uploading && !error && (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>
          點擊更換頭像<br />
          自動裁切為正方形 400×400
        </div>
      )}
    </div>
  );
}
