'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('activityQa');
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
      if (!res.ok || j.error) throw new Error(j.error?.message || t('submitFailed'));
      setQuestionSubmitted(true);
      setQuestion('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : t('submitFailedRetry'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="kkd-scroll-section" id="section-qa">
      <h2 className="kkd-section-title">{t('title')}</h2>

      {/* Approved Q&A list */}
      {loadingQA ? (
        <p className="kkd-qa-empty">{t('loading')}</p>
      ) : approvedQA.length === 0 ? (
        <p className="kkd-qa-empty">{t('empty')}</p>
      ) : (
        <div className="kkd-qa-list">
          {approvedQA.map(qa => (
            <div key={qa.id} data-testid="qa-item" className="kkd-qa-item">
              <p className="kkd-qa-q">
                <b>{t('questionPrefix')}</b>{qa.question}
              </p>
              {qa.answer && (
                <p className="kkd-qa-a">
                  <b>{t('answerPrefix')}</b>{qa.answer}
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
              {t('submitSuccess')}
            </p>
          ) : (
            <form onSubmit={handleSubmitQuestion} className="kkd-qa-form">
              <label htmlFor="qa-question-input" className="kkd-qa-form-label">
                {t('formLabel')}
              </label>
              <textarea
                id="qa-question-input"
                name="question"
                className="kkd-qa-textarea"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder={t('placeholder')}
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
                {submitting ? t('submitting') : t('submit')}
              </button>
            </form>
          )}
        </div>
      ) : (
        <p className="kkd-qa-login" data-testid="qa-login-prompt">
          {/* 請登入後才能提問 */}
          {t('loginBefore')}<a href="/login">{t('login')}</a>{t('loginAfter')}
        </p>
      )}
    </section>
  );
}
