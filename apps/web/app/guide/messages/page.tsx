'use client';

/**
 * /guide/messages — 嚮導訂單留言串（#1411）。
 * 待回覆（最後一則為旅客）排前；點開展開串＋回覆框。
 * 發言窗口（付款後～completed+14 天）由 API 把關，窗口外只能讀。
 */
import { useEffect, useState } from 'react';
import { csrfHeaders, ensureCsrfToken } from '../../../src/lib/csrf-client';

type ThreadRow = {
  orderId: string;
  orderStatus: string;
  activityTitle?: string | null;
  contactName?: string | null;
  scheduleStartAt?: string | null;
  lastMessage: { body: string; senderRole: string; createdAt: string | null };
  messageCount: number;
  needsReply: boolean;
  canPost: boolean;
};

type Message = {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string | null;
};

function fmt(iso?: string | null) {
  return iso ? String(iso).replace('T', ' ').slice(0, 16) : '—';
}

export default function GuideMessagesPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 展開中的串
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [openMessages, setOpenMessages] = useState<Message[]>([]);
  const [openCanPost, setOpenCanPost] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/v2/guide/messages', { cache: 'no-store' });
      if (res.status === 401) {
        setErr('請先登入嚮導帳號');
        return;
      }
      const j = await res.json();
      setThreads(Array.isArray(j?.data) ? j.data : []);
    } catch {
      setErr('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void ensureCsrfToken();
    void load();
  }, []);

  const openThread = async (orderId: string) => {
    if (openOrderId === orderId) {
      setOpenOrderId(null);
      return;
    }
    setOpenOrderId(orderId);
    setOpenMessages([]);
    setReply('');
    setReplyErr(null);
    try {
      const res = await fetch(`/api/v2/guide/orders/${encodeURIComponent(orderId)}/messages`, { cache: 'no-store' });
      const j = await res.json();
      setOpenMessages(Array.isArray(j?.data?.messages) ? j.data.messages : []);
      setOpenCanPost(Boolean(j?.data?.canPost));
    } catch {
      setReplyErr('載入留言失敗，請重試');
    }
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openOrderId || !reply.trim()) return;
    setSending(true);
    setReplyErr(null);
    try {
      const res = await fetch(`/api/v2/guide/orders/${encodeURIComponent(openOrderId)}/messages`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ body: reply.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '回覆失敗');
      setReply('');
      // 重新整理展開中的串與清單旗標
      const detail = await fetch(`/api/v2/guide/orders/${encodeURIComponent(openOrderId)}/messages`, { cache: 'no-store' });
      const dj = await detail.json();
      setOpenMessages(Array.isArray(dj?.data?.messages) ? dj.data.messages : []);
      await load();
    } catch (error) {
      setReplyErr(error instanceof Error ? error.message : '回覆失敗，請重試');
    } finally {
      setSending(false);
    }
  };

  const pending = threads.filter((t) => t.needsReply);
  const replied = threads.filter((t) => !t.needsReply);

  const renderThread = (t: ThreadRow) => (
    <div key={t.orderId} data-testid={`message-thread-${t.orderId}`} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <button
        data-testid={`message-thread-open-${t.orderId}`}
        onClick={() => void openThread(t.orderId)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
          {t.needsReply && <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 11, marginRight: 6 }}>待回覆</span>}
          {t.activityTitle || '行程'} · {t.contactName || '旅客'}
        </p>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 4px' }}>出發 {fmt(t.scheduleStartAt)} · {t.messageCount} 則訊息</p>
        <p style={{ fontSize: 13, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.lastMessage.senderRole === 'guide' ? '我：' : '旅客：'}{t.lastMessage.body}
        </p>
      </button>

      {openOrderId === t.orderId && (
        <div style={{ marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, maxHeight: 320, overflowY: 'auto' }}>
            {openMessages.map((m) => (
              <div
                key={m.id}
                data-testid="guide-message-item"
                style={{
                  alignSelf: m.senderRole === 'guide' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: m.senderRole === 'guide' ? '#f5f3ff' : '#f1f5f9',
                  border: `1px solid ${m.senderRole === 'guide' ? '#ddd6fe' : '#e2e8f0'}`,
                  borderRadius: 12,
                  padding: '8px 12px',
                }}
              >
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', margin: '0 0 2px' }}>
                  {m.senderRole === 'guide' ? '我' : '旅客'}
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>{fmt(m.createdAt)}</span>
                </p>
                <p style={{ fontSize: 13, color: '#111827', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</p>
              </div>
            ))}
          </div>
          {openCanPost ? (
            <form onSubmit={sendReply}>
              <textarea
                data-testid="guide-message-input"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="回覆旅客…（最長 1000 字）"
                rows={2}
                maxLength={1000}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
              />
              {replyErr && <p style={{ color: 'crimson', fontSize: 12, marginTop: 6 }}>{replyErr}</p>}
              <button
                type="submit"
                data-testid="guide-message-send"
                disabled={sending || !reply.trim()}
                style={{ marginTop: 8, padding: '9px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {sending ? '送出中…' : '送出回覆'}
              </button>
            </form>
          ) : (
            <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>此串已轉唯讀（行程結束 14 天後或訂單已取消/退款）。</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>旅客訊息</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
        旅客付款後即可在訂單頁與您對話；行程結束 14 天後留言串自動轉唯讀。
      </p>

      {err && <p style={{ color: 'crimson', fontSize: 13 }}>{err}</p>}
      {loading ? (
        <p style={{ color: '#6b7280' }}>載入中⋯</p>
      ) : (
        <>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0' }}>待回覆（{pending.length}）</h2>
          {pending.length === 0 && <p data-testid="messages-empty" style={{ fontSize: 13, color: '#9ca3af' }}>目前沒有待回覆的訊息。</p>}
          {pending.map(renderThread)}

          {replied.length > 0 && (
            <>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '20px 0 12px' }}>已回覆</h2>
              {replied.map(renderThread)}
            </>
          )}
        </>
      )}
    </main>
  );
}
