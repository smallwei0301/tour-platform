'use client';

import { useState } from 'react';
import { fetchLineReplyTemplate, type LineReplyTemplate } from './requests.api';

const INTENT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'acknowledge', label: '先回覆已收到' },
  { value: 'ask_more', label: '詢問更多細節' },
];

type CopyState = 'idle' | 'copied' | 'fallback';

/**
 * INV-B：本元件不得呼叫 mark-replied。開啟 LINE 只是分享文案，不改變詢問單狀態。
 */
export function LineReplyAction({ requestRef }: { requestRef: string }) {
  const [intent, setIntent] = useState<string>(INTENT_OPTIONS[0].value);
  const [template, setTemplate] = useState<LineReplyTemplate | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');

  async function handleGenerate() {
    setPending(true);
    setErrorMessage(null);
    setCopyState('idle');
    const result = await fetchLineReplyTemplate({ requestRef, intent });
    if (result.kind === 'success') {
      setTemplate(result.data);
    } else {
      setTemplate(null);
      setErrorMessage(
        result.code === 'INVALID_REPLY_INTENT'
          ? '這個回覆語氣目前不適用，請改選其他選項。'
          : '目前無法產生 LINE 文案，請稍後再試。',
      );
    }
    setPending(false);
  }

  // INV-A：clipboard 不可用或被拒絕時，必須 fallback 成唯讀 textarea，不得吞掉。
  async function handleCopy() {
    if (!template) return;
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      setCopyState('fallback');
      return;
    }
    try {
      await clipboard.writeText(template.text);
      setCopyState('copied');
    } catch {
      setCopyState('fallback');
    }
  }

  return (
    <section className="midao-line-reply" aria-labelledby="midao-line-reply-title">
      <h4 id="midao-line-reply-title" className="midao-heading">LINE 回覆文案</h4>

      <label className="midao-line-reply__field" htmlFor="midao-line-reply-intent">
        回覆語氣
        <select
          id="midao-line-reply-intent"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          disabled={pending}
        >
          {INTENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="midao-button"
        onClick={() => void handleGenerate()}
        disabled={pending}
      >
        {pending ? '產生中…' : '產生文案'}
      </button>

      {errorMessage ? <p className="midao-inline-error" role="alert">{errorMessage}</p> : null}

      {template ? (
        <div className="midao-line-reply__result">
          <textarea
            className="midao-line-reply__text"
            aria-label="LINE 回覆文案內容"
            data-testid="midao-line-reply-text"
            readOnly
            value={template.text}
          />
          <div className="midao-line-reply__actions">
            <button type="button" className="midao-button" onClick={() => void handleCopy()}>
              複製文案
            </button>
            <a
              className="midao-button midao-button--line"
              data-testid="midao-line-share-link"
              href={template.shareUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              用 LINE 傳送
            </a>
          </div>
          {copyState === 'copied' ? <p className="midao-line-reply__hint" role="status">文案已複製</p> : null}
          {copyState === 'fallback' ? (
            <p className="midao-line-reply__hint" role="status">請手動複製上方文案後貼到 LINE</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
