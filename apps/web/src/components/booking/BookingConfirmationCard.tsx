'use client';

/**
 * 旅客確認頁的純呈現卡片（#1759 Package 4／Task 43b）。
 *
 * 契約來源：計畫 §4.4 步驟 1（props 精確如下，不得多不得少）。
 *
 * 邊界：本元件**不得自行 fetch**、不得有副作用、不得 import server 端模組
 * （`booking-confirmation-preview.ts` 與 `db-midao-*` 皆屬 server）。
 * 顯示型別 `ConfirmationPreviewView` 是 §3.3 八鍵投影的前端複刻。
 */

/** §3.3 的 8 鍵投影，前端複刻（刻意不 import server 檔）。 */
export interface ConfirmationPreviewView {
  status: 'pending' | 'expired' | 'used';
  bookingId: string;
  orderId: string;
  service: {
    activityId: string;
    activityPlanId: string;
    title: string | null;
    planName: string | null;
  };
  schedule: {
    startAt: string;
    endAt: string;
  };
  partySize: number;
  price: {
    quotedTotalTwd: number;
    currency: string;
  };
  expiresAt: string | null;
}

export interface BookingConfirmationCardProps {
  preview: ConfirmationPreviewView;
  submitting: boolean;
  errorMessage: string | null;
  onAccept: () => void;
}

/** 台北時區顯示；來源一律是 UTC ISO（§3.3 已正規化）。 */
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDateTime(iso: string | null): string {
  if (!iso) return '未提供';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '未提供';
  return DATE_TIME_FORMAT.format(new Date(parsed));
}

function formatScheduleRange(startAt: string, endAt: string): string {
  return `${formatDateTime(startAt)} – ${formatDateTime(endAt)}`;
}

function formatPrice(quotedTotalTwd: number, currency: string): string {
  const amount = new Intl.NumberFormat('zh-TW').format(quotedTotalTwd);
  return currency === 'TWD' ? `NT$${amount}` : `${currency} ${amount}`;
}

export function BookingConfirmationCard({
  preview,
  submitting,
  errorMessage,
  onAccept,
}: BookingConfirmationCardProps) {
  const serviceTitle = preview.service.title || '未命名服務';
  const planName = preview.service.planName;

  return (
    <section
      className="booking-confirm-card"
      data-testid="booking-confirm-card"
      aria-labelledby="booking-confirm-card-title"
    >
      <h1 id="booking-confirm-card-title" className="booking-confirm-card__title">
        請確認這筆預訂
      </h1>
      <p className="booking-confirm-card__lead">
        確認後導遊會收到通知，接著就可以進行付款。
      </p>

      <dl className="booking-confirm-card__grid">
        <div className="booking-confirm-card__field">
          <dt>服務</dt>
          <dd data-testid="booking-confirm-service">
            {planName ? `${serviceTitle}／${planName}` : serviceTitle}
          </dd>
        </div>
        <div className="booking-confirm-card__field">
          <dt>日期時間</dt>
          <dd data-testid="booking-confirm-schedule">
            {formatScheduleRange(preview.schedule.startAt, preview.schedule.endAt)}
          </dd>
        </div>
        <div className="booking-confirm-card__field">
          <dt>人數</dt>
          <dd data-testid="booking-confirm-party-size">{`${preview.partySize} 位`}</dd>
        </div>
        <div className="booking-confirm-card__field">
          <dt>金額</dt>
          <dd data-testid="booking-confirm-price">
            {formatPrice(preview.price.quotedTotalTwd, preview.price.currency)}
          </dd>
        </div>
        <div className="booking-confirm-card__field">
          <dt>確認期限</dt>
          <dd data-testid="booking-confirm-expires-at">{formatDateTime(preview.expiresAt)}</dd>
        </div>
      </dl>

      {errorMessage ? (
        <p className="booking-confirm-card__error" role="alert" data-testid="booking-confirm-error">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="button"
        className="booking-confirm-card__accept"
        data-testid="booking-confirm-accept"
        onClick={onAccept}
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? '送出中…' : '確認預訂'}
      </button>
    </section>
  );
}
