export default function AdminLoading() {
  return (
    <div style={{ padding: '24px 28px' }}>
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          style={{
            height: 48,
            borderRadius: 10,
            background: 'linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6)',
            backgroundSize: '200% 100%',
            marginBottom: 12,
          }}
        />
      ))}
    </div>
  );
}
