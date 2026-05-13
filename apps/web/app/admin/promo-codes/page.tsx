'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, PageHeader, Badge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';
import { csrfHeaders } from '../../../src/lib/csrf-client';

type PromoCode = {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  per_user_limit: number;
  created_at: string;
};

export default function AdminPromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/promo-codes', { cache: 'no-store' });
      if (res.status === 401) {
        setError('未授權，請重新登入');
        return;
      }
      const json = await res.json();
      setCodes(json.data || []);
    } catch {
      setError('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleDeactivate(id: string) {
    if (!confirm('確定要停用此折扣碼？')) return;
    setDeactivating(id);
    try {
      const res = await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE', headers: csrfHeaders() });
      if (res.ok) {
        await load();
      } else {
        const json = await res.json();
        alert('停用失敗：' + (json.error?.message || '未知錯誤'));
      }
    } catch {
      alert('網路錯誤，請重試');
    } finally {
      setDeactivating(null);
    }
  }

  function formatDiscount(code: PromoCode) {
    if (code.discount_type === 'percentage') return `${code.discount_value}%`;
    return `NT$${code.discount_value}`;
  }

  function formatExpiry(expiresAt: string | null) {
    if (!expiresAt) return '無期限';
    const d = new Date(expiresAt);
    if (d < new Date()) return `已過期 (${d.toLocaleDateString('zh-TW')})`;
    return d.toLocaleDateString('zh-TW');
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="折扣碼管理"
        subtitle="管理促銷折扣碼，設定折扣類型與使用限制"
        actions={
          <Link
            href="/admin/promo-codes/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 18px', borderRadius: 8,
              background: 'var(--tp-primary)', color: '#fff',
              fontWeight: 600, fontSize: 14, textDecoration: 'none',
            }}
          >
            + 新增折扣碼
          </Link>
        }
      />

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <Card>
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : codes.length === 0 ? (
          <EmptyState message="尚無折扣碼，點擊「新增折扣碼」開始建立。" />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>折扣碼</Th>
                <Th>折扣</Th>
                <Th>使用次數</Th>
                <Th>每人限制</Th>
                <Th>到期日</Th>
                <Th>狀態</Th>
                <Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, fontSize: 13, fontWeight: 600 }}>
                      {c.code}
                    </code>
                  </Td>
                  <Td>{formatDiscount(c)}</Td>
                  <Td>{c.used_count} / {c.max_uses}</Td>
                  <Td>{c.per_user_limit} 次</Td>
                  <Td style={{ fontSize: 12 }}>{formatExpiry(c.expires_at)}</Td>
                  <Td>
                    <Badge variant={c.active ? 'success' : 'default'}>
                      {c.active ? '啟用' : '停用'}
                    </Badge>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link
                        href={`/admin/promo-codes/${c.id}/edit`}
                        style={{ fontSize: 13, color: 'var(--tp-primary)', textDecoration: 'none' }}
                      >
                        編輯
                      </Link>
                      {c.active && (
                        <button
                          onClick={() => void handleDeactivate(c.id)}
                          disabled={deactivating === c.id}
                          style={{
                            fontSize: 13, color: '#dc2626', background: 'none', border: 'none',
                            cursor: deactivating === c.id ? 'not-allowed' : 'pointer', padding: 0,
                          }}
                        >
                          {deactivating === c.id ? '停用中...' : '停用'}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Card>
    </div>
  );
}
