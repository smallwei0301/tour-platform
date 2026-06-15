'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../../../src/components/admin/ui';

type Channel = 'line' | 'telegram';
type Recipient = 'traveler' | 'guide' | 'admin';
type Matrix = Record<string, Record<string, Record<string, boolean>>>;

interface Dimensions {
  events: string[];
  recipients: Recipient[];
  channels: Channel[];
}

const EVENT_LABELS: Record<string, string> = {
  new_order: '新訂單建立',
  payment_received: '付款成功',
  order_cancelled: '訂單取消',
  refund_requested: '退款申請',
  refund_executed: '退款完成',
};

const RECIPIENT_LABELS: Record<string, string> = {
  traveler: '旅客',
  guide: '導遊',
  admin: '管理者群組',
};

const CHANNEL_LABELS: Record<string, string> = {
  line: 'LINE',
  telegram: 'Telegram',
};

export default function NotificationSettingsPage() {
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [dims, setDims] = useState<Dimensions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  function loadData() {
    setLoading(true);
    setError(null);
    fetch('/api/admin/notification-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && j?.data) {
          setMatrix(j.data.matrix);
          setDims(j.data.dimensions);
        } else {
          setError(j?.error?.message || '載入通知設定失敗');
        }
      })
      .catch((e) => setError(e?.message || '網路錯誤'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function toggleCell(event: string, recipient: Recipient, channel: Channel) {
    if (!matrix) return;
    const current = matrix[event]?.[recipient]?.[channel] ?? true;
    const next = !current;
    const cellId = `${event}:${recipient}:${channel}`;
    setSavingCell(cellId);

    // optimistic update
    setMatrix((prev) => {
      if (!prev) return prev;
      const copy: Matrix = JSON.parse(JSON.stringify(prev));
      copy[event] = copy[event] || {};
      copy[event][recipient] = copy[event][recipient] || {};
      copy[event][recipient][channel] = next;
      return copy;
    });

    try {
      const res = await fetch('/api/admin/notification-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cells: [{ event, recipient, channel, enabled: next }] }),
      });
      const j = await res.json();
      if (j?.ok && j?.data?.matrix) {
        setMatrix(j.data.matrix);
      } else {
        loadData(); // reconcile on failure
        setError(j?.error?.message || '儲存失敗');
      }
    } catch (e) {
      loadData();
      setError(e instanceof Error ? e.message : '網路錯誤');
    } finally {
      setSavingCell(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="通知設定"
        subtitle="逐一勾選每個訂單事件要不要通知「旅客／導遊／管理者群組」，以及走 LINE 或 Telegram。關閉後該格不再發送（仍受各通道環境總開關與綁定狀態約束）。"
      />

      {loading && <Card><p style={{ color: '#6b7280' }}>載入中…</p></Card>}
      {error && (
        <Card style={{ borderColor: '#fca5a5', background: '#fef2f2' }}>
          <p style={{ color: '#b91c1c', margin: 0 }}>⚠️ {error}</p>
        </Card>
      )}

      {!loading && matrix && dims && (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              <thead>
                <tr>
                  <th scope="col" style={TH_LEFT} rowSpan={2}>訂單事件</th>
                  {dims.channels.map((ch) => (
                    <th scope="col" key={ch} style={TH_GROUP} colSpan={dims.recipients.length}>
                      {CHANNEL_LABELS[ch] || ch}
                    </th>
                  ))}
                </tr>
                <tr>
                  {dims.channels.map((ch) =>
                    dims.recipients.map((rc) => (
                      <th scope="col" key={`${ch}-${rc}`} style={TH_CELL}>
                        {RECIPIENT_LABELS[rc] || rc}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {dims.events.map((ev) => (
                  <tr key={ev}>
                    <td style={TD_LEFT}>{EVENT_LABELS[ev] || ev}</td>
                    {dims.channels.map((ch) =>
                      dims.recipients.map((rc) => {
                        const cellId = `${ev}:${rc}:${ch}`;
                        const checked = matrix[ev]?.[rc]?.[ch] ?? true;
                        return (
                          <td key={cellId} style={TD_CELL}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={savingCell === cellId}
                              onChange={() => toggleCell(ev, rc, ch)}
                              style={{ width: 18, height: 18, cursor: 'pointer' }}
                              aria-label={`${EVENT_LABELS[ev] || ev} / ${CHANNEL_LABELS[ch]} / ${RECIPIENT_LABELS[rc]}`}
                            />
                          </td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 16, lineHeight: 1.7 }}>
            ※ 勾選＝發送、取消＝不發送，變更即時生效。<br />
            ※ 這層是「業務勾選」；若整個通道的環境總開關（如 LINE_MESSAGING_ENABLED、TELEGRAM_NOTIFY_ENABLED）未開，或對象尚未綁定 LINE／Telegram，仍不會送出。
          </p>
        </Card>
      )}
    </div>
  );
}

const TH_LEFT: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb',
  background: '#f0fdf4', color: '#14532d', fontWeight: 700, whiteSpace: 'nowrap',
};
const TH_GROUP: React.CSSProperties = {
  textAlign: 'center', padding: '8px 12px', borderBottom: '1px solid #e5e7eb',
  background: '#ecfdf5', color: '#065f46', fontWeight: 700,
};
const TH_CELL: React.CSSProperties = {
  textAlign: 'center', padding: '6px 10px', borderBottom: '2px solid #e5e7eb',
  background: '#f0fdf4', color: '#14532d', fontWeight: 600, whiteSpace: 'nowrap',
};
const TD_LEFT: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f3f4f6',
  fontWeight: 600, color: '#111827', whiteSpace: 'nowrap',
};
const TD_CELL: React.CSSProperties = {
  textAlign: 'center', padding: '8px 10px', borderBottom: '1px solid #f3f4f6',
};
