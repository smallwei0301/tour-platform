'use client';

import { useState } from 'react';
import { convertInquiry, type InquiryConversionResult } from './requests.api';

export interface InquiryPlanSummary {
  activityPlanId: string;
  name: string | null;
  bookingType: string;
  status: string;
  minParticipants: number;
  maxParticipants: number;
  basePrice: number;
}

type ErrorPresentation = {
  message: string;
  keepForm: boolean;
  offerReload: boolean;
  offerRetry: boolean;
  disableSubmit: boolean;
};

// D5：前端只依 error.code 分支，不解析後端 message。
const ERROR_TABLE: Readonly<Record<string, ErrorPresentation>> = {
  INQUIRY_ALREADY_CONVERTED: {
    message: '這筆詢問單已經轉成訂單了。',
    keepForm: true, offerReload: true, offerRetry: false, disableSubmit: true,
  },
  INQUIRY_STATE_NOT_CONVERTIBLE: {
    message: '目前的詢問單狀態不能轉單，請重新載入確認最新狀態。',
    keepForm: true, offerReload: true, offerRetry: false, disableSubmit: true,
  },
  PLAN_INACTIVE: {
    message: '這個方案已停用，請先到服務管理啟用後再轉單。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: true,
  },
  PLAN_BOOKING_TYPE_NOT_REQUEST: {
    message: '這個方案不是「預約需求」型，無法用詢問單轉單。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: true,
  },
  CAPACITY_EXCEEDED: {
    message: '當天名額不足，請調整人數或日期後再試。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: false,
  },
  IDEMPOTENCY_CONFLICT: {
    message: '這次送出的內容與先前的請求不一致，請重新載入後再試一次。',
    keepForm: true, offerReload: true, offerRetry: false, disableSubmit: true,
  },
  IDEMPOTENCY_IN_PROGRESS: {
    message: '上一次轉單還在處理中，請稍候再試。',
    keepForm: true, offerReload: false, offerRetry: true, disableSubmit: false,
  },
  PARTICIPANTS_BELOW_PLAN_MIN: {
    message: '人數不在方案允許範圍。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: false,
  },
  PARTICIPANTS_ABOVE_PLAN_MAX: {
    message: '人數不在方案允許範圍。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: false,
  },
  NOT_FOUND: {
    message: '找不到這筆詢問單。',
    keepForm: true, offerReload: true, offerRetry: false, disableSubmit: true,
  },
  MUTATIONS_DISABLED: {
    message: '目前無法執行此操作，請稍後再試。',
    keepForm: true, offerReload: false, offerRetry: false, disableSubmit: true,
  },
};

const FALLBACK_ERROR: ErrorPresentation = {
  message: '目前無法完成操作，請稍後再試。',
  keepForm: true, offerReload: false, offerRetry: false, disableSubmit: false,
};

const TTL_MIN_HOURS = 1;
const TTL_MAX_HOURS = 24;

function presentError(code: string, plan: InquiryPlanSummary | null): ErrorPresentation {
  const base = ERROR_TABLE[code] ?? FALLBACK_ERROR;
  if (plan && (code === 'PARTICIPANTS_BELOW_PLAN_MIN' || code === 'PARTICIPANTS_ABOVE_PLAN_MAX')) {
    return { ...base, message: `人數不在方案允許範圍（${plan.minParticipants}–${plan.maxParticipants} 人）。` };
  }
  return base;
}

function defaultStartAt(preferredDate: string | null, startTimeLocal: string | null): string {
  if (!preferredDate) return '';
  const time = startTimeLocal && /^\d{2}:\d{2}/.test(startTimeLocal)
    ? startTimeLocal.slice(0, 5)
    : '09:00';
  return `${preferredDate}T${time}`;
}

export function InquiryConversionSheet({
  inquiryId,
  plan,
  defaultParticipants,
  preferredDate,
  startTimeLocal,
  onConverted,
  onReload,
}: {
  inquiryId: string;
  plan: InquiryPlanSummary | null;
  defaultParticipants: number | null;
  preferredDate: string | null;
  startTimeLocal: string | null;
  onConverted: (result: InquiryConversionResult) => void;
  onReload: () => Promise<void>;
}) {
  const [startAt, setStartAt] = useState(defaultStartAt(preferredDate, startTimeLocal));
  const [endAt, setEndAt] = useState('');
  const [participants, setParticipants] = useState(
    defaultParticipants === null ? '' : String(defaultParticipants),
  );
  const [quotedTotalTwd, setQuotedTotalTwd] = useState('');
  const [confirmationTtlHours, setConfirmationTtlHours] = useState('24');
  const [guideNote, setGuideNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ErrorPresentation | null>(null);
  const [result, setResult] = useState<InquiryConversionResult | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>('idle');

  // D4：activityPlanId 唯讀鎖定；為 null 時整個轉單區塊停用。
  if (!plan) {
    return (
      <section className="midao-inquiry-conversion" aria-labelledby="midao-inquiry-conversion-title">
        <h3 id="midao-inquiry-conversion-title" className="midao-heading">轉為訂單</h3>
        <p className="midao-inquiry-conversion__disabled" data-testid="midao-conversion-disabled">
          這筆詢問單沒有對應的方案，無法轉單。請先確認旅客詢問的方案是否仍然存在。
        </p>
      </section>
    );
  }

  function validate(): string | null {
    const participantsValue = Number(participants);
    const ttlValue = Number(confirmationTtlHours);
    const quotedValue = Number(quotedTotalTwd);
    if (!startAt || !endAt) return '請填寫行程開始與結束時間。';
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      return '結束時間必須晚於開始時間。';
    }
    if (!Number.isInteger(participantsValue)
      || participantsValue < plan!.minParticipants
      || participantsValue > plan!.maxParticipants) {
      return `人數不在方案允許範圍（${plan!.minParticipants}–${plan!.maxParticipants} 人）。`;
    }
    if (!Number.isInteger(quotedValue) || quotedValue < 0) return '報價金額必須是 0 以上的整數。';
    if (!Number.isInteger(ttlValue) || ttlValue < TTL_MIN_HOURS || ttlValue > TTL_MAX_HOURS) {
      return `確認連結有效時數必須介於 ${TTL_MIN_HOURS}–${TTL_MAX_HOURS} 小時。`;
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationMessage = validate();
    if (validationMessage) {
      setError({ ...FALLBACK_ERROR, message: validationMessage });
      return;
    }

    setPending(true);
    setError(null);
    const response = await convertInquiry({
      inquiryId,
      activityPlanId: plan!.activityPlanId,
      confirmationTtlHours: Number(confirmationTtlHours),
      endAt: new Date(endAt).toISOString(),
      participants: Number(participants),
      quotedTotalTwd: Number(quotedTotalTwd),
      startAt: new Date(startAt).toISOString(),
      guideNote,
    });
    if (response.kind === 'success') {
      setResult(response.data);
      onConverted(response.data);
    } else {
      setError(presentError(response.code, plan));
    }
    setPending(false);
  }

  async function handleCopyUrl(url: string) {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      setCopyState('fallback');
      return;
    }
    try {
      await clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('fallback');
    }
  }

  return (
    <section className="midao-inquiry-conversion" aria-labelledby="midao-inquiry-conversion-title">
      <h3 id="midao-inquiry-conversion-title" className="midao-heading">轉為訂單</h3>

      <form className="midao-inquiry-conversion__form" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="midao-conversion-plan">
          方案
          <input
            id="midao-conversion-plan"
            data-testid="midao-conversion-plan"
            type="text"
            readOnly
            value={plan.name || plan.activityPlanId}
          />
        </label>
        <label htmlFor="midao-conversion-start-at">
          開始時間
          <input
            id="midao-conversion-start-at"
            data-testid="midao-conversion-start-at"
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            required
          />
        </label>
        <label htmlFor="midao-conversion-end-at">
          結束時間
          <input
            id="midao-conversion-end-at"
            data-testid="midao-conversion-end-at"
            type="datetime-local"
            value={endAt}
            onChange={(event) => setEndAt(event.target.value)}
            required
          />
        </label>
        <label htmlFor="midao-conversion-participants">
          人數（{plan.minParticipants}–{plan.maxParticipants} 人）
          <input
            id="midao-conversion-participants"
            data-testid="midao-conversion-participants"
            type="number"
            min={plan.minParticipants}
            max={plan.maxParticipants}
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
            required
          />
        </label>
        <label htmlFor="midao-conversion-quoted-total">
          報價金額（TWD）
          <input
            id="midao-conversion-quoted-total"
            data-testid="midao-conversion-quoted-total"
            type="number"
            min={0}
            value={quotedTotalTwd}
            onChange={(event) => setQuotedTotalTwd(event.target.value)}
            required
          />
        </label>
        <label htmlFor="midao-conversion-ttl">
          確認連結有效時數（{TTL_MIN_HOURS}–{TTL_MAX_HOURS}）
          <input
            id="midao-conversion-ttl"
            data-testid="midao-conversion-ttl"
            type="number"
            min={TTL_MIN_HOURS}
            max={TTL_MAX_HOURS}
            value={confirmationTtlHours}
            onChange={(event) => setConfirmationTtlHours(event.target.value)}
            required
          />
        </label>
        <label htmlFor="midao-conversion-guide-note">
          給旅人的備註（選填）
          <textarea
            id="midao-conversion-guide-note"
            data-testid="midao-conversion-guide-note"
            value={guideNote}
            onChange={(event) => setGuideNote(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="midao-button midao-button--primary"
          data-testid="midao-conversion-submit"
          disabled={pending || Boolean(error?.disableSubmit) || result !== null}
        >
          {pending ? '轉單中…' : '轉為訂單'}
        </button>
      </form>

      {error ? (
        <div className="midao-inquiry-conversion__error">
          <p className="midao-inline-error" role="alert" data-testid="midao-conversion-error">
            {error.message}
          </p>
          {error.offerReload ? (
            <button type="button" className="midao-button" data-testid="midao-conversion-reload" onClick={() => void onReload()}>
              重新載入詳情
            </button>
          ) : null}
          {error.offerRetry ? (
            <button type="button" className="midao-button" data-testid="midao-conversion-retry" onClick={() => setError(null)}>
              再試一次
            </button>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="midao-inquiry-conversion__result" data-testid="midao-conversion-result">
          {/* D6：replayed 時 confirmationUrl 為 null，絕不假造連結。 */}
          {result.created && result.confirmationUrl ? (
            <>
              <p className="midao-inquiry-conversion__hint">轉單成功，請把確認連結傳給旅人：</p>
              <p className="midao-inquiry-conversion__url" data-testid="midao-confirmation-url">
                {result.confirmationUrl}
              </p>
              <button
                type="button"
                className="midao-button"
                data-testid="midao-copy-confirmation-url"
                onClick={() => void handleCopyUrl(result.confirmationUrl as string)}
              >
                複製確認連結
              </button>
              {copyState === 'copied' ? <p role="status">確認連結已複製</p> : null}
              {copyState === 'fallback' ? <p role="status">請手動複製上方連結</p> : null}
            </>
          ) : (
            <p className="midao-inquiry-conversion__hint" data-testid="midao-confirmation-url-unavailable">
              此詢問單先前已完成轉單，確認連結只在第一次轉單時產生，無法重新取得。
              {result.confirmationTokenNote ? `（${result.confirmationTokenNote}）` : ''}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
