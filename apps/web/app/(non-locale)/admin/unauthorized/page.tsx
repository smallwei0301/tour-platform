export default function AdminUnauthorizedPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Access Denied</h1>
      <p style={{ color: '#b42318' }}>你沒有 admin 權限，無法存取此頁面。</p>
      <p style={{ color: '#666' }}>
        請先前往 <a href="/admin/login">/admin/login</a> 登入，或在請求中帶上：<code>x-admin-token</code>，且（若有設定）<code>x-admin-email</code> 必須在 allowlist 內。
      </p>
      <pre style={{ background: '#f8f8f8', padding: 10, borderRadius: 8, overflow: 'auto' }}>
{`# .env 建議設定
ADMIN_ACCESS_TOKEN=your-strong-token
ADMIN_EMAIL_ALLOWLIST=owner@example.com,ops@example.com

# API 呼叫範例
x-admin-token: your-strong-token
x-admin-email: owner@example.com`}
      </pre>
    </main>
  );
}
