type InlineErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

function sanitizeMessage(message?: string) {
  if (!message) return '請稍後再試，或重新整理頁面。';
  const normalized = message.trim();
  if (!normalized) return '請稍後再試，或重新整理頁面。';
  if (process.env.NODE_ENV === 'production') {
    return '系統暫時忙碌，請稍後再試。';
  }
  return normalized;
}

export default function InlineErrorState({
  title = '載入失敗',
  message,
  onRetry,
  retryLabel = '重試'
}: InlineErrorStateProps) {
  return (
    <section className="tp-step-card" role="alert" aria-live="assertive">
      <h2>{title}</h2>
      <p style={{ color: '#b42318' }}>⚠️ {sanitizeMessage(message)}</p>
      {onRetry ? (
        <button type="button" className="tp-btn tp-btn-ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </section>
  );
}
