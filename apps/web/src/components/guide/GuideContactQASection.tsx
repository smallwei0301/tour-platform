'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { buildGuideContactActivityId } from '../../lib/guide-contact-qa.mjs';

type QAItem = {
  id: string;
  question: string;
  answer: string | null;
  status: string;
};

type Props = {
  /** 導遊 id（= guide_profiles.id，與導遊 session.guideId 同源） */
  guideId: string;
  guideName: string;
};

/**
 * 「認識導遊」頁 sidebar 的「詢問導遊」inline 訊息表單。
 *
 * 行為（對齊行程詳情頁的旅客問答 ActivityQASection，但訊息不綁定行程）：
 *  1. 按下「✉️ 詢問導遊」先判斷旅客有沒有登入。
 *  2. 已登入 → 直接在此頁面下方展開輸入框與送出功能（和行程 QA 一樣）。
 *  3. 未登入 → 展開登入提示。
 *
 * 送出走既有的 /api/qa，但 activity_id 帶 sentinel `guide:<guideId>`，
 * 讓訊息流進同一個導遊後台收件匣（/api/guide/qa），後台卡片顯示「導遊頁面」。
 */
export function GuideContactQASection({ guideId, guideName }: Props) {
  const activityId = buildGuideContactActivityId(guideId);

  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [approvedQA, setApprovedQA] = useState<QAItem[]>([]);

  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [questionSubmitted, setQuestionSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check auth on mount（按下按鈕前先把登入狀態準備好）
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser()
      .then(({ data }) => setUser(data.user ? { id: data.user.id } : null))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // Fetch approved messages for this guide page（和行程 QA 一樣顯示已審核問答）
  useEffect(() => {
    fetch(`/api/qa?activityId=${encodeURIComponent(activityId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setApprovedQA(Array.isArray(j.data) ? j.data : []))
      .catch(() => setApprovedQA([]));
  }, [activityId]);

  const handleContactClick = () => {
    // 先判斷旅客有沒有登入，再決定展開表單或登入提示。
    setOpen(true);
  };

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
    <div data-testid="guide-contact-qa">
      <button
        type="button"
        onClick={handleContactClick}
        aria-expanded={open}
        className="tp-btn tp-btn-primary"
        style={{ width: '100%', display: 'block', textAlign: 'center', marginTop: 12 }}
      >
        ✉️ 詢問導遊
      </button>

      {open && (
        <div
          data-testid="guide-contact-qa-panel"
          style={{
            marginTop: 12,
            textAlign: 'left',
            borderTop: '1px solid var(--tp-border)',
            paddingTop: 12,
          }}
        >
          {/* 已審核訊息（和行程 QA 一樣顯示） */}
          {approvedQA.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {approvedQA.map(qa => (
                <div
                  key={qa.id}
                  data-testid="guide-qa-item"
                  style={{
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 8,
                  }}
                >
                  <p style={{ margin: '0 0 6px', fontSize: 13, color: '#111827' }}>
                    <strong>Q：</strong>{qa.question}
                  </p>
                  {qa.answer && (
                    <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>
                      <strong>A：</strong>{qa.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!authChecked ? (
            <p style={{ fontSize: 13, color: 'var(--tp-muted)' }}>載入中…</p>
          ) : user ? (
            questionSubmitted ? (
              <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }} data-testid="guide-qa-submitted">
                訊息已送出，等候 {guideName} 回覆
              </p>
            ) : (
              <form onSubmit={handleSubmitQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label htmlFor="guide-qa-question-input" style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  傳訊息給 {guideName}
                </label>
                <textarea
                  id="guide-qa-question-input"
                  name="question"
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  placeholder="有疑問嗎？歡迎傳訊息給導遊..."
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
                  className="tp-btn tp-btn-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  {submitting ? '送出中…' : '送出訊息'}
                </button>
              </form>
            )
          ) : (
            <p style={{ fontSize: 13, color: '#6b7280' }} data-testid="guide-qa-login-prompt">
              請<a href="/login" style={{ color: '#a8511f', fontWeight: 600 }}>登入</a>後才能傳訊息給導遊
            </p>
          )}
        </div>
      )}
    </div>
  );
}
