type PageSkeletonProps = {
  title?: string;
  lines?: number;
};

export default function PageSkeleton({ title = '資料載入中', lines = 3 }: PageSkeletonProps) {
  return (
    <section className="tp-step-card" aria-busy="true" aria-live="polite">
      <h2>{title}</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            style={{
              height: 14,
              width: `${Math.max(45, 100 - index * 12)}%`,
              borderRadius: 8,
              background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
              backgroundSize: '200% 100%',
              animation: 'tp-skeleton-wave 1.2s ease-in-out infinite'
            }}
          />
        ))}
      </div>
    </section>
  );
}
