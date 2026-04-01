'use client';

import { useState, useRef, useCallback } from 'react';

interface ImageUploadProps {
  activityId: string;
  activitySlug: string;
  type: 'cover' | 'gallery';
  currentUrl?: string;
  currentUrls?: string[];
  onUpload: (url: string) => void;
  onGalleryUpdate?: (urls: string[]) => void;
  label?: string;
}

// ── 前端壓縮：Canvas → WebP，最寬 1200px ──
async function compressToWebP(file: File, maxWidth = 1200): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        },
        'image/webp', 0.85
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ImageUpload({
  activityId, activitySlug, type, currentUrl, currentUrls = [],
  onUpload, onGalleryUpdate, label,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true); setError(''); setProgress('壓縮中⋯');
    try {
      const compressed = await compressToWebP(file);
      const kb = Math.round(compressed.size / 1024);
      setProgress(`上傳中⋯ (${kb}KB)`);

      const fd = new FormData();
      fd.append('file', compressed);
      fd.append('slug', activitySlug);
      fd.append('type', type);

      const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, {
        method: 'POST', body: fd,
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || '上傳失敗');
      setProgress('');
      onUpload(json.data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上傳失敗');
      setProgress('');
    } finally {
      setUploading(false);
    }
  }, [activityId, activitySlug, type, onUpload]);

  const uploadMultiple = useCallback(async (files: File[]) => {
    const urls = [...currentUrls];
    for (const file of files) {
      setUploading(true); setError(''); setProgress(`壓縮 ${file.name}⋯`);
      try {
        const compressed = await compressToWebP(file);
        setProgress(`上傳 ${file.name}⋯`);
        const fd = new FormData();
        fd.append('file', compressed);
        fd.append('slug', activitySlug);
        fd.append('type', 'gallery');
        const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, {
          method: 'POST', body: fd,
        });
        const json = await res.json();
        if (json.ok) { urls.push(json.data.url); onGalleryUpdate?.([...urls]); }
        else throw new Error(json.error?.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : '部分上傳失敗');
      }
    }
    setUploading(false); setProgress('');
  }, [activityId, activitySlug, currentUrls, onGalleryUpdate]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!images.length) { setError('請選擇圖片檔案'); return; }
    if (type === 'cover') uploadFile(images[0]);
    else uploadMultiple(images);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function removeGalleryImage(url: string) {
    onGalleryUpdate?.(currentUrls.filter(u => u !== url));
  }

  const hasContent = type === 'cover' ? !!currentUrl : currentUrls.length > 0;

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#16a34a' : '#d1d5db'}`,
          borderRadius: 10, padding: 20, textAlign: 'center',
          background: dragOver ? '#f0fdf4' : '#fafafa',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          marginBottom: 12,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={type === 'gallery'}
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 28, marginBottom: 6 }}>🖼️</div>
        {uploading ? (
          <div style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>{progress}</div>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>
              {label || (type === 'cover' ? '上傳封面圖' : '上傳活動照片')}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              拖放或點擊選擇 · 自動壓縮至 1200px WebP
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
          ❌ {error}
        </div>
      )}

      {/* Cover preview */}
      {type === 'cover' && currentUrl && (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={currentUrl}
            alt="封面預覽"
            style={{ maxWidth: 320, borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }}
          />
          <button
            type="button"
            onClick={() => onUpload('')}
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              border: 'none', borderRadius: 4, width: 24, height: 24,
              cursor: 'pointer', fontSize: 14, lineHeight: '24px',
            }}
            title="移除"
          >✕</button>
        </div>
      )}

      {/* Gallery preview */}
      {type === 'gallery' && currentUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {currentUrls.map((url, i) => (
            <div key={url + i} style={{ position: 'relative' }}>
              <img
                src={url}
                alt={`活動照片 ${i + 1}`}
                style={{ width: 100, height: 75, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => removeGalleryImage(url)}
                style={{
                  position: 'absolute', top: 3, right: 3,
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  border: 'none', borderRadius: 4, width: 20, height: 20,
                  cursor: 'pointer', fontSize: 11, lineHeight: '20px',
                }}
                title="移除"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
