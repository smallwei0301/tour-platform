'use client';

interface InlineErrorProps {
  message?: string;
  onRetry: () => void;
}

export function InlineError({ message = '暫時無法載入內容', onRetry }: InlineErrorProps) {
  return (
    <div className="midao-inline-error" role="alert">
      <strong>{message}</strong>
      <button type="button" onClick={onRetry}>再試一次</button>
    </div>
  );
}
