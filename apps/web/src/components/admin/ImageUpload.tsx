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

// Image specifications by type
const IMAGE_SPECS = {
  cover: {
    // Hero image: 16:9 aspect ratio
    targetWidth: 1920,
    targetHeight: 1080,
    aspectRatio: 16 / 9,
    maxFileSizeMB: 5,
    quality: 0.85,
    description: '16:9 比例 · 1920×1080 · 最大 5MB',
  },
  gallery: {
    // Gallery image: 3:2 aspect ratio
    targetWidth: 1200,
    targetHeight: 800,
    aspectRatio: 3 / 2,
    maxFileSizeMB: 2,
    quality: 0.85,
    description: '3:2 比例 · 1200×800 · 最大 2MB',
    maxCount: 10,
  },
};

/**
 * Compress and crop image to target aspect ratio and dimensions
 */
async function compressToSpec(
  file: File,
  targetWidth: number,
  targetHeight: number,
  aspectRatio: number,
  quality: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = img;
      const imgAspect = width / height;

      // Calculate crop dimensions to match target aspect ratio (center crop)
      let cropWidth = width;
      let cropHeight = height;
      let cropX = 0;
      let cropY = 0;

      if (imgAspect > aspectRatio) {
        // Image is wider than target ratio - crop sides
        cropWidth = Math.round(height * aspectRatio);
        cropX = Math.round((width - cropWidth) / 2);
      } else if (imgAspect < aspectRatio) {
        // Image is taller than target ratio - crop top/bottom
        cropHeight = Math.round(width / aspectRatio);
        cropY = Math.round((height - cropHeight) / 2);
      }

      // Create canvas at target dimensions
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d')!;

      // Draw cropped & scaled image
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,  // Source crop
        0, 0, targetWidth, targetHeight        // Destination (full canvas)
      );

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('壓縮失敗')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => reject(new Error('圖片載入失敗'));
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

  const spec = IMAGE_SPECS[type];

  const uploadFile = useCallback(async (file: File) => {
    // Validate file size
    const maxBytes = spec.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`檔案大小超過 ${spec.maxFileSizeMB}MB 限制`);
      return;
    }

    setUploading(true);
    setError('');
    setProgress('裁切壓縮中⋯');

    try {
      const compressed = await compressToSpec(
        file,
        spec.targetWidth,
        spec.targetHeight,
        spec.aspectRatio,
        spec.quality
      );
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
  }, [activityId, activitySlug, type, spec, onUpload]);

  const uploadMultiple = useCallback(async (files: File[]) => {
    const gallerySpec = IMAGE_SPECS.gallery;
    const maxCount = gallerySpec.maxCount;
    const remaining = maxCount - currentUrls.length;

    if (remaining <= 0) {
      setError(`相冊最多只能有 ${maxCount} 張照片`);
      return;
    }

    // Limit files to remaining slots
    const filesToUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`只上傳前 ${remaining} 張（已達上限 ${maxCount} 張）`);
    }

    const urls = [...currentUrls];
    for (const file of filesToUpload) {
      // Validate file size
      const maxBytes = gallerySpec.maxFileSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        setError(`${file.name} 超過 ${gallerySpec.maxFileSizeMB}MB 限制，已跳過`);
        continue;
      }

      setUploading(true);
      setProgress(`裁切 ${file.name}⋯`);

      try {
        const compressed = await compressToSpec(
          file,
          gallerySpec.targetWidth,
          gallerySpec.targetHeight,
          gallerySpec.aspectRatio,
          gallerySpec.quality
        );
        setProgress(`上傳 ${file.name}⋯`);

        const fd = new FormData();
        fd.append('file', compressed);
        fd.append('slug', activitySlug);
        fd.append('type', 'gallery');

        const res = await fetch(`/api/admin/activities/${activityId}/upload-image`, {
          method: 'POST', body: fd,
        });
        const json = await res.json();
        if (json.ok) {
          urls.push(json.data.url);
          onGalleryUpdate?.([...urls]);
        } else {
          throw new Error(json.error?.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '部分上傳失敗');
      }
    }
    setUploading(false);
    setProgress('');
  }, [activityId, activitySlug, currentUrls, onGalleryUpdate]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(''); // Clear previous errors
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

  const galleryCount = type === 'gallery' ? currentUrls.length : 0;
  const galleryMax = IMAGE_SPECS.gallery.maxCount;

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
          accept="image/jpeg,image/png,image/webp"
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
              {label || (type === 'cover' ? '上傳封面圖（Hero）' : '上傳活動照片')}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              拖放或點擊選擇 · {spec.description}
            </div>
            {type === 'gallery' && (
              <div style={{ fontSize: 11, color: galleryCount >= galleryMax ? '#dc2626' : '#6b7280', marginTop: 4 }}>
                已上傳 {galleryCount} / {galleryMax} 張
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Cover preview (16:9) */}
      {type === 'cover' && currentUrl && (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={currentUrl}
            alt="封面預覽"
            style={{ maxWidth: 320, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }}
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

      {/* Gallery preview (3:2) */}
      {type === 'gallery' && currentUrls.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {currentUrls.map((url, i) => (
            <div key={url + i} style={{ position: 'relative' }}>
              <img
                src={url}
                alt={`活動照片 ${i + 1}`}
                style={{ width: 120, aspectRatio: '3/2', objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }}
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
