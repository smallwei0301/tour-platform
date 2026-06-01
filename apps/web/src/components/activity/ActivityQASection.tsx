'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/client';

type QAItem = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
};

type Props = {
  activityId: string;
};

export function ActivityQASection({ activityId }: Props) {
  const [approvedQA, setApprovedQA] = useState<QAItem[]>([]);
  const [loadingQA, setLoadingQA] = useState(true);

  // Auth state
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Form state
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check auth on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { id: data.user.id } : null);
      setAuthChecked(true);
    });
  }, []);

  // Fetch approved Q&A
  useEffect(() => {
    if (!activityId) return;
    fetch(`/api/qa?activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setApprovedQA(Array.isArray(j.data) ? j.data : []))
      .catch(() => setApprovedQA([]))
      .finally(() => setLoadingQA(false));
  }, [activityId]);

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (session?.access_token) {
        headers['authorization'] = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers,
        body: JSON.stringify({ activityId, question: question.trim() }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error?.message || '送出失敗');
      setQuestionSubmitted(true);
      setQuestion('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="kkd-scroll-section" id="section-qa">
      <h2 className="kkd-section-title">💬 旅客問答</h2>

      {/* Approved Q&A list */}
      {loadingQA ? (
        <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>載入問答中…</p>
      ) : approvedQA.length === 0 ? (
        <p style={{ color: 'var(--tp-muted)', fontSize: 13 }}>尚無問答，歡迎率先提問！</p>
      ) : (
        <div className="kkd-qa-list" style={{ marginBottom: 24 }}>
          {approvedQA.map(qa => (
            <div
              key={qa.id}
              data-testid="qa-item"
              className="kkd-qa-item"
              style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 10,
              }}
            >
              <p style={{ margin: '0 0 6px', fontSize: 14, color: '#111827' }}>
                <strong>Q：</strong>{qa.question}
              </p>
              {qa.answer && (
                <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
                  <strong>A：</strong>{qa.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Question form — gated by auth */}
      {!authChecked ? null : user ? (
        <div className="kkd-qa-form-wrap">
          {questionSubmitted ? (
            <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
              問題已送出，等候審核
            </p>
          ) : (
            <form onSubmit={handleSubmitQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label htmlFor="qa-question-input" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                有疑問嗎？歡迎提問
              </label>
              <textarea
                id="qa-question-input"
                name="question"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="有疑問嗎？歡迎提問..."
                rows={3}
                required
                style={{
                  width: '100%',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
              {submitError && (
                <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>{submitError}</p>
              )}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 20px',
                  background: '#ec4899',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '送出中…' : '送出問題'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#6b7280' }} data-testid="qa-login-prompt">
          {/* 請登入後才能提問 */}
          請<a href="/login" style={{ color: '#ec4899', fontWeight: 600 }}>登入</a>後才能提問
        </p>
      )}
    </section>
  );
}
