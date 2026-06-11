'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, PageHeader } from '../../../../src/components/admin/ui';
import { csrfHeaders } from '../../../../src/lib/csrf-client';

export default function AdminNewPromoCodePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '',
    max_uses: '100',
    per_user_limit: '1',
    expires_at: '',
    active: true,
    // #1381: 旅客端公開曝光
    is_public: false,
    public_label: '',
  });

  function handleChange(field: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: csrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          code: form.code,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          max_uses: Number(form.max_uses),
          per_user_limit: Number(form.per_user_limit),
          expires_at: form.expires_at || null,
          active: form.active,
          is_public: form.is_public,
          public_label: form.public_label || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error?.message || '建立失敗');
        return;
      }

      router.push('/admin/promo-codes');
    } catch {
      setError('網路錯誤，請重試');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6,
  };

  return (
    <div className="admin-page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <PageHeader
        title="新增折扣碼"
        subtitle="建立新的促銷折扣碼"
        actions={
          <Link
            href="/admin/promo-codes"
            style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}
          >
            ← 返回列表
          </Link>
        }
      />

      <Card style={{ padding: '24px 28px', marginTop: 20 }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: '#dc2626', fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Code */}
            <div>
              <label htmlFor="promo-code" style={labelStyle}>折扣碼 *</label>
              <input
                id="promo-code"
                type="text"
                required
                placeholder="例：SUMMER2026"
                value={form.code}
                onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                style={inputStyle}
                maxLength={50}
              />
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                自動轉換為大寫；唯一不重複
              </div>
            </div>

            {/* Discount Type */}
            <div>
              <label htmlFor="promo-discount-type" style={labelStyle}>折扣類型 *</label>
              <select
                id="promo-discount-type"
                value={form.discount_type}
                onChange={(e) => handleChange('discount_type', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="percentage">百分比折扣 (%)</option>
                <option value="fixed">固定金額折扣 (NT$)</option>
              </select>
            </div>

            {/* Discount Value */}
            <div>
              <label htmlFor="promo-discount-value" style={labelStyle}>
                折扣值 * ({form.discount_type === 'percentage' ? '%' : 'NT$'})
              </label>
              <input
                id="promo-discount-value"
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder={form.discount_type === 'percentage' ? '例：10 (10%)' : '例：200 (NT$200)'}
                value={form.discount_value}
                onChange={(e) => handleChange('discount_value', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Max Uses */}
            <div>
              <label htmlFor="promo-max-uses" style={labelStyle}>最大使用次數</label>
              <input
                id="promo-max-uses"
                type="number"
                min="1"
                step="1"
                value={form.max_uses}
                onChange={(e) => handleChange('max_uses', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Per User Limit */}
            <div>
              <label htmlFor="promo-per-user-limit" style={labelStyle}>每人使用次數限制</label>
              <input
                id="promo-per-user-limit"
                type="number"
                min="1"
                step="1"
                value={form.per_user_limit}
                onChange={(e) => handleChange('per_user_limit', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Expires At */}
            <div>
              <label htmlFor="promo-expires-at" style={labelStyle}>到期日（可選）</label>
              <input
                id="promo-expires-at"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => handleChange('expires_at', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Active */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) => handleChange('active', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="active" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                立即啟用
              </label>
            </div>

            {/* #1381: 旅客端公開曝光 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="is_public"
                data-testid="promo-is-public"
                checked={form.is_public}
                onChange={(e) => handleChange('is_public', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor="is_public" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                公開曝光（顯示於活動頁與結帳頁）
              </label>
            </div>
            {form.is_public && (
              <div>
                <label htmlFor="public_label" style={labelStyle}>公開顯示文案（選填，空白時自動以折扣內容組句）</label>
                <input
                  type="text"
                  id="public_label"
                  data-testid="promo-public-label"
                  value={form.public_label}
                  onChange={(e) => handleChange('public_label', e.target.value)}
                  placeholder="例：新客限定 9 折"
                  style={inputStyle}
                />
              </div>
            )}

            {/* Submit */}
            <div style={{ display: 'flex', gap: 12, paddingTop: 8, flexWrap: 'wrap' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  background: submitting ? '#9ca3af' : 'var(--tp-primary)',
                  color: '#fff', border: 'none', fontWeight: 600, fontSize: 14,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '建立中...' : '建立折扣碼'}
              </button>
              <Link
                href="/admin/promo-codes"
                style={{
                  padding: '10px 24px', borderRadius: 8,
                  border: '1px solid #e5e7eb', color: '#6b7280',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center',
                }}
              >
                取消
              </Link>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
