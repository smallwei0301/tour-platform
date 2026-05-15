'use client';
import Image from 'next/image';

import { useState, useRef, useCallback } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

interface ImageUploadProps {
  activityId: string;
  activitySlug: string;
  type: 'cover' | 'gallery';
  onUploaded?: (url: string) => void;
  // backward-compatible props used by admin activity edit page
  onUpload?: (url: string) => void;
  onGalleryUpdate?: (urls: string[]) => void;
  currentUrl?: string;
  currentUrls?: string[];
}

/**
 * Compress and crop image based on type
 * - cover (hero): 16:9, target 1920x1080
 * - gallery: 3:2, target 1200x800
 */
async function compressImage(
  file: File,
  type: 'cover' | 'gallery'
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    const config = type === 'cover'
      ? { aspectRatio: 16 / 9, width: 1920, height: 1080 }
      : { aspectRatio: 3 / 2, width: 1200, height: 800 };

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      const imgAspectRatio = width / height;
      const targetAspectRatio = config.aspectRatio;

      let cropWidth = width;
      let cropHeight = height;
      let cropX = 0;
      let cropY = 0;

      // Calculate center crop to match target aspect ratio
      if (imgAspectRatio > targetAspectRatio) {
        // Image is wider: crop width
        cropWidth = height * targetAspectRatio;
        cropX = (width - cropWidth) / 2;
      } else {
        // Image is taller: crop height
        cropHeight = width / targetAspectRatio;
        cropY = (height - cropHeight) / 2;
      }

      // Create canvas at target size
      const canvas = document.createElement('canvas');
      canvas.width = config.width;
      canvas.height = config.height;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, config.width, config.height
      );

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('壓縮失敗')); return; }
          resolve(new File([blob], `${type}.webp`, { type: 'image/webp' }));
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = () => reject(new Error('圖片載入失敗'));
    img.src = url;
  });
}

export function ImageUpload({
  activityId,
  activitySlug,
  type,
  onUploaded,
  onUpload,
  onGalleryUpdate,
  currentUrl,
  currentUrls,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError('');
      setProgress('裁切壓縮中⋯');

      try {
        const config = type === 'cover'
          ? { name: '16:9 Hero', size: '1920x1080' }
          : { name: '3:2 Gallery', size: '1200x800' };

        const compressed = await compressImage(file, type);
        const kb = Math.round(compressed.size / 1024);
        setProgress(`上傳中⋯ (${kb}KB, ${config.size})`);

        const preview = URL.createObjectURL(compressed);
        setPreviewUrl(preview);

        const fd = new FormData();
        fd.append('file', compressed);
        fd.append('slug', activitySlug);
        fd.append('type', type);

        const res = await fetch(
          `/api/admin/activities/${activityId}/upload-image`,
          { method: 'POST', headers: csrfHeaders(), body: fd }
        );
        const json = await res.json();

        if (!json.ok) throw new Error(json.error?.message || '上傳失敗');

        setProgress('');
        const uploadedUrl = json.data.url as string;

        // cover: single image callback
        if (type === 'cover') {
          onUploaded?.(uploadedUrl);
          onUpload?.(uploadedUrl);
        } else {
          // gallery: append into current list when callback is provided
          if (onGalleryUpdate) {
            const nextUrls = [...(currentUrls || []), uploadedUrl];
            onGalleryUpdate(nextUrls);
          }
          onUploaded?.(uploadedUrl);
          onUpload?.(uploadedUrl);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '上傳失敗');
        setProgress('');
        setPreviewUrl(null);
      } finally {
        setUploading(false);
      }
    },
    [activityId, activitySlug, type, onUploaded, onUpload, onGalleryUpdate, currentUrls]
  );

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('請選擇圖片檔案');
      return;
    }

    const maxSize = type === 'cover' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      const maxMB = maxSize / 1024 / 1024;
      setError(`檔案大小不能超過 ${maxMB}MB`);
      return;
    }

    uploadFile(file);
  }

  const displayUrl = previewUrl || (type === 'cover' ? currentUrl || null : null);
  const label =
    type === 'cover'
      ? '📷 上傳 Hero 圖（16:9）'
      : '📷 上傳照片（3:2）';

  return (
    <div style={{ marginTop: 6 }}>
      {/* Preview */}
      {displayUrl && (
        <div
          style={{
            width: '100%',
            maxWidth: 300,
            aspectRatio: type === 'cover' ? '16 / 9' : '3 / 2',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#f3f4f6',
            marginBottom: 12,
          }}
        >
          <Image
            src={displayUrl}
            alt="預覽"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} width={1200} height={675} />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          fontSize: 12,
          padding: '5px 12px',
          borderRadius: 6,
          background: uploading ? '#f3f4f6' : '#eff6ff',
          color: uploading ? '#9ca3af' : '#2563eb',
          border: '1px dashed #93c5fd',
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? '上傳中⋯' : label}
      </button>

      {progress && (
        <span style={{ fontSize: 12, color: '#2563eb', marginLeft: 8 }}>
          {progress}
        </span>
      )}

      {error && (
        <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 8 }}>
          ⚠️ {error}
        </span>
      )}
    </div>
  );
}
