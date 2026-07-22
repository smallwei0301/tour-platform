'use client';

// midao2 新增服務：三步精靈 create 模式 → POST services → 若有暫存封面 File 則壓縮上傳＋PATCH coverImageUrl。

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { C, apiSend } from '../../ui';
import { compressImage } from '../../../../../src/lib/client-image-compress';
import { csrfHeaders } from '../../../../../src/lib/csrf-client';
import ServiceForm, { type ServiceValues } from '../ServiceForm';

export default function Midao2NewServicePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ServiceValues, publish: boolean, coverFile?: File | null) {
    setSubmitting(true);
    setError(null);
    try {
      const { service } = await apiSend('/api/v2/guide/midao/services', 'POST', { ...values, publish });
      if (coverFile && service?.activityId) {
        try {
          const compressed = await compressImage(coverFile, 'gallery');
          const fd = new FormData();
          fd.append('file', compressed);
          const res = await fetch(`/api/guide/activities/${service.activityId}/upload-image`, {
            method: 'POST',
            headers: csrfHeaders(),
            body: fd,
          });
          const json = await res.json().catch(() => ({}));
          if (json.ok && json.data?.url) {
            await apiSend(`/api/v2/guide/midao/services/${service.activityId}`, 'PATCH', { coverImageUrl: json.data.url });
          }
        } catch {
          // 封面上傳失敗不擋建立流程，導遊可於編輯頁重新上傳。
        }
      }
      router.push('/midao2/services');
    } catch (err: any) {
      setError(err?.message || '建立失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>新增服務</h1>
      {error && <div style={{ color: C.RED, fontSize: 13 }}>{error}</div>}
      <ServiceForm mode="create" submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
