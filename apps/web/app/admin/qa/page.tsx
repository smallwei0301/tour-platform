'use client';

import { useEffect, useState } from 'react';
import { Card, PageHeader, Badge, TableWrapper, Th, Td, LoadingSkeleton, EmptyState } from '../../../src/components/admin/ui';

type QAEntry = {
  id: string;
  activity_id: string;
  question: string;
  answer: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  user_id?: string;
};

type AnswerState = Record<string, string>;

export default function AdminQAPage() {
  const [qaList, setQaList] = useState<QAEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [answerMap, setAnswerMap] = useState<AnswerState>({});

  async function load(status: string) {
    setLoading(true);
    setError('');
    try {
      const url = status ? `/api/admin/qa?status=${encodeURIComponent(status)}` : '/api/admin/qa';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 401) {
        setError('未授權，請重新登入');
        return;
      }
      const json = await res.json();
      setQaList(json.data || []);
    } catch {
      setError('載入失敗，請重試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(statusFilter); }, [statusFilter]);

  async function handleAction(id: string, newStatus: 'approved' | 'rejected') {
    const label = newStatus === 'approved' ? '核准' : '拒絕';
    const answer = answerMap[id] ?? '';
    if (newStatus === 'approved' && !answer.trim()) {
      alert('核准前請填寫回答內容');
      return;
    }
    if (!confirm(`確定要${label}此問題？`)) return;
    setActionLoading(id + newStatus);
    try {
      const body: Record<string, string> = { status: newStatus };
      if (answer.trim()) body.answer = answer.trim();
      const res = await fetch(`/api/admin/qa/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Clear answer field for this entry after action
        setAnswerMap((prev) => { const next = { ...prev }; delete next[id]; return next; });
        await load(statusFilter);
      } else {
        const json = await res.json();
        alert(`${label}失敗：` + (json.error?.message || '未知錯誤'));
      }
    } catch {
      alert('網路錯誤，請重試');
    } finally {
      setActionLoading(null);
    }
  }

  function truncate(text: string, max = 60) {
    if (!text) return '—';
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  const pendingCount = qaList.filter(q => q.status === 'pending').length;

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Q&A管理"
        subtitle="審核旅客提交的行程問題，填寫回答後核准或拒絕"
        actions={
          pendingCount > 0 && statusFilter === 'pending' ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e',
              fontWeight: 700, fontSize: 13,
            }}>
              待審核 {pendingCount} 筆
            </span>
          ) : undefined
        }
      />

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { value: 'pending', label: '待審核' },
          { value: 'approved', label: '已核准' },
          { value: 'rejected', label: '已拒絕' },
          { value: '', label: '全部' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: statusFilter === tab.value ? 'var(--tp-primary)' : '#fff',
              color: statusFilter === tab.value ? '#fff' : '#374151',
              fontWeight: statusFilter === tab.value ? 700 : 500,
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <Card>
        {loading ? (
          <LoadingSkeleton rows={4} />
        ) : qaList.length === 0 ? (
          <EmptyState message={`目前沒有${statusFilter === 'pending' ? '待審核' : statusFilter === 'approved' ? '已核准' : statusFilter === 'rejected' ? '已拒絕' : ''}的問題。`} />
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>行程 ID (activity_id)</Th>
                <Th>問題 (question)</Th>
                <Th>現有回答 (answer)</Th>
                <Th>狀態 (status)</Th>
                <Th>建立時間</Th>
                <Th>填寫回答 / 操作</Th>
              </tr>
            </thead>
            <tbody>
              {qaList.map((q) => (
                <tr key={q.id}>
                  <Td style={{ fontSize: 12, maxWidth: 140, wordBreak: 'break-all' }}>{q.activity_id || '—'}</Td>
                  <Td style={{ fontSize: 13, maxWidth: 220, color: '#374151' }}>{truncate(q.question, 80)}</Td>
                  <Td style={{ fontSize: 12, maxWidth: 200, color: '#6b7280' }}>{q.answer ? truncate(q.answer, 60) : '—'}</Td>
                  <Td>
                    <Badge
                      variant={
                        q.status === 'approved' ? 'success'
                          : q.status === 'rejected' ? 'danger'
                          : 'warning'
                      }
                    >
                      {q.status === 'approved' ? '已核准'
                        : q.status === 'rejected' ? '已拒絕'
                        : '待審核'}
                    </Badge>
                  </Td>
                  <Td style={{ fontSize: 12 }}>{formatDate(q.created_at)}</Td>
                  <Td>
                    {q.status === 'pending' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
                        <textarea
                          value={answerMap[q.id] ?? ''}
                          onChange={(e) => setAnswerMap((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="填寫回答（核准前必填）"
                          rows={3}
                          style={{
                            width: '100%', fontSize: 12, padding: '6px 8px',
                            border: '1px solid #d1d5db', borderRadius: 6,
                            resize: 'vertical', fontFamily: 'inherit',
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => void handleAction(q.id, 'approved')}
                            disabled={actionLoading === q.id + 'approved'}
                            style={{
                              fontSize: 12, color: '#10b981', background: 'none', border: '1px solid #10b981',
                              borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            {actionLoading === q.id + 'approved' ? '處理中...' : '核准'}
                          </button>
                          <button
                            onClick={() => void handleAction(q.id, 'rejected')}
                            disabled={actionLoading === q.id + 'rejected'}
                            style={{
                              fontSize: 12, color: '#dc2626', background: 'none', border: '1px solid #dc2626',
                              borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            {actionLoading === q.id + 'rejected' ? '處理中...' : '拒絕'}
                          </button>
                        </div>
                      </div>
                    )}
                    {q.status !== 'pending' && (
                      <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>
                    )}
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
