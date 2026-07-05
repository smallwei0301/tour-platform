'use client';

// #1615 第一批：admin「例外開放衝突時段」Modal 內容與其表單型別/常數
//（#1257 slice C）。純結構搬移：JSX、文案與原頁面逐字相同；Modal 外殼
//（ResponsiveModal＋title）與送出/關閉 handler 仍留在頁面，經 props 注入。

import type { Dispatch, SetStateAction } from 'react';
import { btn } from './shared';
import type { Guide, PreviewSlot, V2Activity, V2Plan } from './admin-sections';

export type ConflictOverrideForm = {
  reason: string;
  requiresHelper: boolean;
  helperStatus: string;
  guideNote: string;
  adminNote: string;
};

export const CONFLICT_OVERRIDE_HELPER_LABEL: Record<string, string> = {
  not_needed: '不需要助手',
  required: '需要助手',
  pending_assignment: '待安排助手',
  assigned: '助手已安排',
  declined: '助手支援未成立',
};

export const DEFAULT_CONFLICT_OVERRIDE_FORM: ConflictOverrideForm = {
  reason: '',
  requiresHelper: false,
  helperStatus: 'not_needed',
  guideNote: '',
  adminNote: '',
};

export function toConflictOverrideSnapshot(override: PreviewSlot['conflictOverride'] | Record<string, unknown> | null | undefined): PreviewSlot['conflictOverride'] {
  if (!override || typeof override !== 'object') return null;
  const row = override as Record<string, unknown>;
  return {
    id: String(row.id || ''),
    reason: String(row.reason || ''),
    requiresHelper: Boolean(row.requiresHelper ?? row.requires_helper),
    helperStatus: String(row.helperStatus ?? row.helper_status ?? 'not_needed'),
    guideNote: row.guideNote == null ? String(row.guide_note ?? '') || null : String(row.guideNote) || null,
    adminNote: row.adminNote == null ? String(row.admin_note ?? '') || null : String(row.adminNote) || null,
    createdAt: row.createdAt == null ? String(row.created_at ?? '') || null : String(row.createdAt) || null,
    createdByAdminEmail: row.createdByAdminEmail == null ? String(row.created_by_admin_email ?? '') || null : String(row.createdByAdminEmail) || null,
  };
}

// Modal 內容主體（含警語、場次摘要、表單欄位與送出/取消按鈕）。
export function AdminConflictOverrideModalBody({
  guide,
  previewActivity,
  previewPlan,
  selectedConflictSlot,
  conflictOverrideForm,
  setConflictOverrideForm,
  conflictOverrideError,
  conflictOverrideSaving,
  saveConflictOverride,
  onCancel,
}: {
  guide: Guide | null;
  previewActivity: V2Activity | null;
  previewPlan: V2Plan | null;
  selectedConflictSlot: PreviewSlot | null;
  conflictOverrideForm: ConflictOverrideForm;
  setConflictOverrideForm: Dispatch<SetStateAction<ConflictOverrideForm>>;
  conflictOverrideError: string;
  conflictOverrideSaving: boolean;
  saveConflictOverride: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: '10px 12px', color: '#92400e' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>這不是一般新增場次</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          僅限既有預約衝突且已確認可人工覆寫的時段使用。送出後仍會保留完整原因、助手需求與備註紀錄。
        </div>
      </div>
      {selectedConflictSlot && (
        <div style={{ border: '1px solid #e5e7eb', background: '#f9fafb', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
          <div><strong>導遊：</strong>{guide?.display_name || '—'}</div>
          <div><strong>活動：</strong>{previewActivity?.title || '—'}</div>
          <div><strong>方案：</strong>{previewPlan?.name || '—'}</div>
          <div><strong>開始：</strong>{new Date(selectedConflictSlot.startAt).toLocaleString('zh-TW')}</div>
          <div><strong>結束：</strong>{new Date(selectedConflictSlot.endAt).toLocaleString('zh-TW')}</div>
        </div>
      )}
      <div>
        <label htmlFor="admin-conflict-override-reason" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>例外開放原因</label>
        <textarea
          id="admin-conflict-override-reason"
          value={conflictOverrideForm.reason}
          onChange={(e) => setConflictOverrideForm((current) => ({ ...current, reason: e.target.value }))}
          rows={3}
          placeholder="請記錄為何核准此衝突時段仍可開放預約"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={conflictOverrideForm.requiresHelper}
          onChange={(e) => setConflictOverrideForm((current) => ({
            ...current,
            requiresHelper: e.target.checked,
            helperStatus: e.target.checked ? current.helperStatus : 'not_needed',
          }))}
        />
        需要助手
      </label>
      <div>
        <label htmlFor="admin-conflict-override-helper-status" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>助手狀態</label>
        <select
          id="admin-conflict-override-helper-status"
          value={conflictOverrideForm.requiresHelper ? conflictOverrideForm.helperStatus : 'not_needed'}
          onChange={(e) => setConflictOverrideForm((current) => ({ ...current, helperStatus: e.target.value }))}
          disabled={!conflictOverrideForm.requiresHelper}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
        >
          {Object.entries(CONFLICT_OVERRIDE_HELPER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="admin-conflict-override-guide-note" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>導遊可見備註</label>
        <textarea
          id="admin-conflict-override-guide-note"
          value={conflictOverrideForm.guideNote}
          onChange={(e) => setConflictOverrideForm((current) => ({ ...current, guideNote: e.target.value }))}
          rows={2}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      <div>
        <label htmlFor="admin-conflict-override-admin-note" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>內部管理備註</label>
        <textarea
          id="admin-conflict-override-admin-note"
          value={conflictOverrideForm.adminNote}
          onChange={(e) => setConflictOverrideForm((current) => ({ ...current, adminNote: e.target.value }))}
          rows={2}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>
      {conflictOverrideError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
          {conflictOverrideError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button onClick={saveConflictOverride} disabled={conflictOverrideSaving} style={btn(conflictOverrideSaving ? '#a78bfa' : '#7c3aed', '#fff')}>
          {conflictOverrideSaving ? '儲存中...' : '確認例外開放'}
        </button>
        <button onClick={onCancel} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
          取消
        </button>
      </div>
    </div>
  );
}
