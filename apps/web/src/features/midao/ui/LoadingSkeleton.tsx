export function LoadingSkeleton({ label = '內容載入中' }: { label?: string }) {
  return (
    <div className="midao-loading-skeleton" aria-busy="true" aria-live="polite">
      <span className="midao-loading-skeleton__line" />
      <span className="midao-loading-skeleton__line" />
      <span className="midao-loading-skeleton__line" />
      <span className="midao-sr-only">{label}</span>
    </div>
  );
}
