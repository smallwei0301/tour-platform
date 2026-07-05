'use client';

// 常見問題（FAQ）編輯卡（#1615 第二批）：自 app/admin/activities/[id]/edit/page.tsx
// 原樣拆出；faq 狀態仍在頁面層（lift state），儲存 API 呼叫與文案零行為變更。
import { csrfHeaders } from '../../../lib/csrf-client';
import { Card } from '../ui';
import { fieldStyle, sectionTitle } from './form-styles';

interface FaqEditorCardProps {
  activityId: string;
  faq: Array<{ q: string; a: string }>;
  setFaq: (faq: Array<{ q: string; a: string }>) => void;
}

export function FaqEditorCard({ activityId, faq, setFaq }: FaqEditorCardProps) {
  return (
    <Card style={{ marginTop: 24, padding: 20 }}>
      <h3 style={{ ...sectionTitle, marginTop: 0 }}>❓ 常見問題</h3>
      {faq.map((item, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#f9fafb' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={item.q} onChange={e => { const f=[...faq]; f[i]={...f[i],q:e.target.value}; setFaq(f); }}
              style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px' }} placeholder="問題" />
            <button type="button" aria-label="移除常見問題" onClick={() => setFaq(faq.filter((_,j)=>j!==i))}
              style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
          </div>
          <textarea value={item.a} onChange={e => { const f=[...faq]; f[i]={...f[i],a:e.target.value}; setFaq(f); }}
            rows={2} style={{ ...fieldStyle, width: '100%' }} placeholder="回答" />
        </div>
      ))}
      <button type="button" onClick={() => setFaq([...faq, { q:'', a:'' }])}
        style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%', marginBottom: 16 }}>
        + 新增 FAQ
      </button>
      {faq.length > 0 && (
        <button type="button" onClick={async () => {
          const res = await fetch(`/api/admin/activities/${activityId}`, {
            method: 'PUT', headers: csrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ faq }),
          });
          const json = await res.json();
          if (json.ok) alert('✅ FAQ 已儲存');
          else alert('❌ 儲存失敗');
        }} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          💾 儲存 FAQ
        </button>
      )}
    </Card>
  );
}
