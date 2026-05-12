'use client';

import { useEffect, useState } from 'react';

export interface RefundPreviewResult {
  eligible: boolean;
  refundable_amount: number;
  refund_pct: number;
  breakdown: { tier: string; percent: number; amount: number } | null;
  reason: string;
}

interface RefundPreviewBannerProps {
  orderId: string;
}

export function RefundPreviewBanner({ orderId }: RefundPreviewBannerProps) {
  const [preview, setPreview] = useState<RefundPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    fetch(`/api/v2/orders/${encodeURIComponent(orderId)}/refund-preview`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const j = await res.json();
        if (j.success && j.data) {
          setPreview(j.data as RefundPreviewResult);
        } else {
          setError(j.error?.message || '無法取得退款預覽');
        }
      })
      .catch(() => setError('無法取得退款預覽'))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
        color: '#9ca3af',
      }}>
        計算退款預覽中…
      </div>
    );
  }

  if (error || !preview) {
    return null;
  }

  if (!preview.eligible) {
    return (
      <div style={{
        background: '#fef3c7',
        border: '1px solid #fbbf24',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13,
        color: '#92400e',
      }}>
        <strong>退款預覽：</strong> {preview.reason}
      </div>
    );
  }

  return (
    <div style={{
      background: '#ecfdf5',
      border: '1px solid #6ee7b7',
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 16,
      fontSize: 13,
      color: '#065f46',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>退款預覽</div>
      {preview.breakdown && (
        <div style={{ marginBottom: 4 }}>
          退款方案：{preview.breakdown.tier}（{preview.breakdown.percent}%）
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 800, color: '#047857' }}>
        預計退款：NT$ {preview.refundable_amount.toLocaleString()}
      </div>
    </div>
  );
}
