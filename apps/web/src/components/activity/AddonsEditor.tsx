'use client';

/**
 * 加購項目編輯器（導遊後台＋管理者後台共用）。
 * 讀 GET {endpointBase} 取全部加購項（含停用）；新增 POST、更新 PATCH、刪除 DELETE。
 * endpointBase 由呼叫端給（guide：/api/v2/guide/activities/[id]/addons；admin：/api/v2/admin/...）。
 * 未設定任何加購項時，結帳頁的加購選購器本來就不顯示（預設隱藏）。
 */
import { useCallback, useEffect, useState } from 'react';
import { csrfHeaders } from '../../lib/csrf-client';

type AddonRow = {
  id: string; name: string; priceTwd: number; unit: 'per_person' | 'per_group';
  stock: number | null; isActive: boolean; sortOrder: number;
};
type Draft = { name: string; priceTwd: string; unit: 'per_person' | 'per_group'; stock: string };

const EMPTY_DRAFT: Draft = { name: '', priceTwd: '', unit: 'per_person', stock: '' };
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

export function AddonsEditor({ endpointBase }: { endpointBase: string }) {
  const [rows, setRows] = useState<AddonRow[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(endpointBase, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      setRows(res.ok ? ((j?.data?.items ?? []) as AddonRow[]) : []);
      if (!res.ok) setErr(j?.error?.message || '載入失敗');
    } catch {
      setErr('載入失敗');
    } finally {
      setLoading(false);
    }
  }, [endpointBase]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    setErr(''); setBusy(true);
    try {
      const res = await fetch(endpointBase, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          name: draft.name.trim(),
          priceTwd: Number(draft.priceTwd),
          unit: draft.unit,
          stock: draft.stock === '' ? null : Number(draft.stock),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j?.error?.message || '新增失敗'); return; }
      setDraft(EMPTY_DRAFT);
      await load();
    } finally { setBusy(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setErr(''); setBusy(true);
    try {
      const res = await fetch(`${endpointBase}/${id}`, {
        method: 'PATCH',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(j?.error?.message || '更新失敗'); return; }
      await load();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setErr(''); setBusy(true);
    try {
      const res = await fetch(`${endpointBase}/${id}`, { method: 'DELETE', headers: csrfHeaders() });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j?.error?.message || '刪除失敗'); return; }
      await load();
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: MUTED }}>
        旅客結帳時可加購的選配項目。<b>未設定任何項目時，結帳頁不顯示加購區塊</b>（預設隱藏）。停用的項目也不會出現在結帳頁。
      </p>
      {err && <div style={{ margin: '0 0 12px', color: '#b42318', fontSize: 13 }}>⚠️ {err}</div>}

      {loading ? (
        <div style={{ color: MUTED, fontSize: 14 }}>載入中…</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.length === 0 && (
            <div style={{ color: MUTED, fontSize: 14, padding: '8px 0' }}>尚未設定加購項目。新增後會顯示在結帳頁。</div>
          )}
          {rows.map((r) => (
            <div key={r.id} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, background: r.isActive ? '#fff' : '#f9fafb', opacity: r.isActive ? 1 : 0.7 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input aria-label="加購名稱" defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && patch(r.id, { name: e.target.value })} style={{ ...inp, flex: '2 1 160px' }} />
                <input aria-label="價格" type="number" min={0} defaultValue={r.priceTwd} onBlur={(e) => Number(e.target.value) !== r.priceTwd && patch(r.id, { priceTwd: Number(e.target.value) })} style={{ ...inp, width: 90 }} />
                <select aria-label="計價單位" defaultValue={r.unit} onChange={(e) => patch(r.id, { unit: e.target.value })} style={{ ...inp, width: 92 }}>
                  <option value="per_person">每人</option>
                  <option value="per_group">每團</option>
                </select>
                <input aria-label="庫存（留空=不限）" type="number" min={0} placeholder="不限" defaultValue={r.stock ?? ''} onBlur={(e) => patch(r.id, { stock: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inp, width: 80 }} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: INK }}>
                  <input type="checkbox" checked={r.isActive} onChange={(e) => patch(r.id, { isActive: e.target.checked })} /> 啟用
                </label>
                <button type="button" disabled={busy} onClick={() => remove(r.id)} style={delBtn}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增列 */}
      <div style={{ marginTop: 14, border: `1px dashed ${LINE}`, borderRadius: 10, padding: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input aria-label="新加購名稱" placeholder="項目名稱（如：器材租借）" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...inp, flex: '2 1 160px' }} />
          <input aria-label="新加購價格" type="number" min={0} placeholder="價格" value={draft.priceTwd} onChange={(e) => setDraft({ ...draft, priceTwd: e.target.value })} style={{ ...inp, width: 90 }} />
          <select aria-label="新加購單位" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value as Draft['unit'] })} style={{ ...inp, width: 92 }}>
            <option value="per_person">每人</option>
            <option value="per_group">每團</option>
          </select>
          <input aria-label="新加購庫存" type="number" min={0} placeholder="庫存(不限留空)" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} style={{ ...inp, width: 110 }} />
          <button type="button" disabled={busy || !draft.name.trim() || draft.priceTwd === ''} onClick={add} style={addBtn}>＋ 新增加購項</button>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, color: INK, background: '#fff' };
const addBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: 'none', background: '#166534', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' };
const delBtn: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#b42318', fontSize: 13, cursor: 'pointer', marginLeft: 'auto' };
