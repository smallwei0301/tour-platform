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
        <p className="kkd-qa-empty">載入問答中…</p>
      ) : approvedQA.length === 0 ? (
        <p className="kkd-qa-empty">尚無問答，歡迎率先提問！</p>
      ) : (
        <div className="kkd-qa-list">
          {approvedQA.map(qa => (
            <div key={qa.id} data-testid="qa-item" className="kkd-qa-item">
              <p className="kkd-qa-q">
                <b>Q：</b>{qa.question}
              </p>
              {qa.answer && (
                <p className="kkd-qa-a">
                  <b>A：</b>{qa.answer}
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
            <p className="kkd-qa-success">
              問題已送出，等候審核
            </p>
          ) : (
            <form onSubmit={handleSubmitQuestion} className="kkd-qa-form">
              <label htmlFor="qa-question-input" className="kkd-qa-form-label">
                有疑問嗎？歡迎提問
              </label>
              <textarea
                id="qa-question-input"
                name="question"
                className="kkd-qa-textarea"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="有疑問嗎？歡迎提問..."
                rows={3}
                required
              />
              {submitError && (
                <p className="kkd-qa-error">{submitError}</p>
              )}
              <button
                type="submit"
                className="kkd-qa-submit"
                disabled={submitting}
              >
                {submitting ? '送出中…' : '送出問題'}
              </button>
            </form>
          )}
        </div>
      ) : (
        <p className="kkd-qa-login" data-testid="qa-login-prompt">
          {/* 請登入後才能提問 */}
          請<a href="/login">登入</a>後才能提問
        </p>
      )}
    </section>
  );
}
