'use client';

import { useState } from 'react';
import { LineReplyAction } from './LineReplyAction';
import { markInquiryReplied } from './requests.api';

const MARK_REPLIED_ERRORS: Readonly<Record<string, string>> = {
  INQUIRY_STATE_NOT_CONVERTIBLE: '目前的詢問單狀態不能標記為已回覆，請重新載入確認最新狀態。',
  NOT_FOUND: '找不到這筆詢問單。',
  MUTATIONS_DISABLED: '目前無法執行此操作，請稍後再試。',
};

/**
 * INV-B：只有這顆明確標示的按鈕才會呼叫 mark-replied；LineReplyAction 不得觸發。
 */
export function TravelerContactActions({
  requestRef,
  inquiryId,
  canMarkReplied,
  onReload,
}: {
  requestRef: string;
  inquiryId: string;
  canMarkReplied: boolean;
  onReload: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleMarkReplied() {
    setPending(true);
    setErrorMessage(null);
    const result = await markInquiryReplied({ inquiryId });
    if (result.kind === 'success') {
      await onReload();
    } else {
      setErrorMessage(MARK_REPLIED_ERRORS[result.code] ?? '目前無法完成操作，請稍後再試。');
    }
    setPending(false);
  }

  return (
    <section className="midao-traveler-contact" aria-labelledby="midao-traveler-contact-title">
      <div>
        <p className="midao-home-eyebrow">聯絡旅人</p>
        <h3 id="midao-traveler-contact-title" className="midao-heading">回覆這筆詢問</h3>
      </div>

      <LineReplyAction requestRef={requestRef} />

      <div className="midao-traveler-contact__mark">
        <button
          type="button"
          className="midao-button midao-button--primary"
          data-testid="midao-mark-replied"
          onClick={() => void handleMarkReplied()}
          disabled={!canMarkReplied || pending}
        >
          {pending ? '處理中…' : '標記為已回覆'}
        </button>
        {!canMarkReplied ? (
          <p className="midao-traveler-contact__hint">目前的詢問單狀態不需要再標記已回覆。</p>
        ) : null}
        {errorMessage ? <p className="midao-inline-error" role="alert">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
