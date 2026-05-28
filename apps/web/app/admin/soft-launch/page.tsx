'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';
import { ResponsiveModal } from '../../../src/components/admin/responsive';

interface SoftLaunchControls {
  public_paused: boolean;
  new_booking_paused: boolean;
  refund_manual_only: boolean;
  whitelist_enabled: boolean;
}

interface PageData {
  controls: SoftLaunchControls;
  whitelistCount: number;
}

const CONTROL_META: {
  key: keyof SoftLaunchControls;
  label: string;
  description: string;
}[] = [
  {
    key: 'public_paused',
    label: '暫停公開（Public Paused）',
    description: '關閉平台公開頁面，向訪客顯示維護中頁面。',
  },
  {
    key: 'new_booking_paused',
    label: '暫停新訂單（New Booking Paused）',
    description: '阻止新訂單建立，現有訂單不受影響。',
  },
  {
    key: 'refund_manual_only',
    label: '退款僅限人工處理（Refund Manual Only）',
    description: '停用自動退款流程，所有退款需人工審核。',
  },
  {
    key: 'whitelist_enabled',
    label: '啟用白名單（Whitelist Enabled）',
    description: '僅允許白名單中的用戶/活動存取平台功能。',
  },
];

export default function SoftLaunchPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [pendingKey, setPendingKey] = useState<keyof SoftLaunchControls | null>(null);
  const [pendingValue, setPendingValue] = useState<boolean>(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function loadData() {
    setLoading(true);
    setError(null);
    fetch('/api/admin/soft-launch', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          setData(j.data);
        } else {
          setError(j?.error?.message || 'Unknown error loading soft-launch controls');
        }
      })
      .catch((e) => setError(e?.message || 'Network error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  function openDialog(key: keyof SoftLaunchControls, newValue: boolean) {
    setPendingKey(key);
    setPendingValue(newValue);
    setReason('');
    setSubmitError(null);
  }

  function closeDialog() {
    setPendingKey(null);
    setReason('');
    setSubmitError(null);
  }

  async function confirmChange() {
    if (!pendingKey) return;
    if (!reason.trim()) {
      setSubmitError('請填寫變更原因');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/admin/soft-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlKey: pendingKey, toValue: pendingValue, reason: reason.trim() }),
      });
      const j = await res.json();
      if (j?.ok && j?.data) {
        setData(j.data);
        closeDialog();
      } else {
        setSubmitError(j?.error?.message || 'Failed to update control');
      }
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader
        title="軟啟動控制"
        subtitle="管理平台功能開關與存取白名單"
        actions={
          data ? (
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              白名單筆數：<strong>{data.whitelistCount}</strong>
            </span>
          ) : null
        }
      />

      <div className="admin-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            Loading...
          </div>
        )}

        {error && (
          <Card style={{ padding: '20px 24px', borderColor: '#fecaca', background: '#fff5f5' }}>
            <p style={{ margin: 0, color: '#991b1b', fontWeight: 600 }}>{error}</p>
          </Card>
        )}

        {data && (
          <Card>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>
                功能開關
              </h2>
            </div>
            <div>
              {CONTROL_META.map((meta, idx) => {
                const isOn = data.controls[meta.key];
                return (
                  <div
                    key={meta.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: '16px 20px',
                      borderBottom: idx < CONTROL_META.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* Status indicator */}
                    <span style={{
                      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                      background: isOn ? '#ef4444' : '#22c55e', flexShrink: 0,
                    }} />

                    {/* Label + description */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{meta.label}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{meta.description}</div>
                    </div>

                    {/* Current status pill */}
                    <span style={{
                      background: isOn ? '#fee2e2' : '#dcfce7',
                      color: isOn ? '#991b1b' : '#166534',
                      borderRadius: 999, padding: '2px 10px',
                      fontSize: 12, fontWeight: 700,
                      minWidth: 40, textAlign: 'center',
                    }}>
                      {isOn ? 'ON' : 'OFF'}
                    </span>

                    {/* Change button */}
                    <button
                      onClick={() => openDialog(meta.key, !isOn)}
                      style={{
                        padding: '7px 16px', borderRadius: 7,
                        border: '1px solid #e5e7eb',
                        background: '#fff', color: '#374151',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isOn ? '關閉' : '開啟'}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Whitelist count info card */}
        {data && (
          <Card>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 22 }}>📋</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                    白名單項目：{data.whitelistCount} 筆
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                    包含 traveler_user_id、activity_id、guide_id 等類型的白名單項目。
                    啟用白名單後，僅白名單項目可存取受限功能。
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

      </div>

      {/* ── Confirm dialog ── */}
      {(() => {
        const meta = pendingKey ? CONTROL_META.find((m) => m.key === pendingKey) : null;
        return (
          <ResponsiveModal
            open={!!pendingKey && !!data}
            onClose={closeDialog}
            size="sm"
            title="確認變更"
            footer={
              <>
                <button
                  onClick={closeDialog}
                  disabled={submitting}
                  style={{
                    padding: '8px 18px', borderRadius: 8,
                    border: '1px solid #e5e7eb', background: '#fff',
                    color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={confirmChange}
                  disabled={submitting}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: pendingValue ? '#ef4444' : '#22c55e',
                    color: '#fff', fontSize: 14, fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? '處理中...' : '確認變更'}
                </button>
              </>
            }
          >
            {meta && (
              <>
                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#6b7280' }}>
                  將 <strong>{meta.label}</strong> 設為{' '}
                  <strong style={{ color: pendingValue ? '#991b1b' : '#166534' }}>
                    {pendingValue ? 'ON（啟用）' : 'OFF（關閉）'}
                  </strong>
                </p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  變更原因 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="請說明此次變更的原因..."
                  rows={3}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 8,
                    border: '1px solid #d1d5db', fontSize: 14, resize: 'vertical',
                    fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />

                {submitError && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#991b1b' }}>{submitError}</p>
                )}
              </>
            )}
          </ResponsiveModal>
        );
      })()}
    </div>
  );
}
