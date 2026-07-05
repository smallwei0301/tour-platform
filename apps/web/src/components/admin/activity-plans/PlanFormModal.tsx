'use client';

// 方案表單 Modal（#1615 第二批）：自 app/admin/activities/[id]/plans/page.tsx 原樣拆出。
// form 狀態與儲存邏輯仍在頁面層（lift state），prop 名稱沿用頁面原變數／函式名，
// JSX 與原檔逐字相同，零行為變更。
import { ResponsiveModal, FormGrid } from '../responsive';
import { ImageUpload } from '../ImageUpload';
import { btn } from './button-styles';
import { createEmptyItineraryStep, type ActivityPlan, type PlanFormState } from './plan-types';

interface PlanFormModalProps {
  showModal: boolean;
  setShowModal: (open: boolean) => void;
  editingPlan: ActivityPlan | null;
  form: PlanFormState;
  setForm: (form: PlanFormState) => void;
  saving: boolean;
  error: string;
  savePlan: () => void;
  activityId: string;
}

export function PlanFormModal({
  showModal, setShowModal, editingPlan, form, setForm, saving, error, savePlan, activityId,
}: PlanFormModalProps) {
  return (
    <ResponsiveModal
      open={showModal}
      onClose={() => setShowModal(false)}
      size="md"
      title={editingPlan ? '編輯方案' : '新增方案'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="plan-form-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案名稱 *</label>
              <input
                id="plan-form-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例：2小時私人導覽"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label htmlFor="plan-form-description" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案說明</label>
              <textarea
                id="plan-form-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="方案詳細說明..."
                rows={3}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="plan-form-duration" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時長 (分鐘) *</label>
                <input
                  id="plan-form-duration"
                  type="number"
                  min="15"
                  step="15"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>計價方式</label>
                <select
                  aria-label="計價方式"
                  value={form.price_type}
                  onChange={(e) => setForm({ ...form, price_type: e.target.value as 'per_person' | 'per_group' })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                >
                  <option value="per_person">每人計價</option>
                  <option value="per_group">每團計價</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="plan-form-base-price" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>基本價格 (TWD) *</label>
                <input
                  id="plan-form-base-price"
                  type="number"
                  min="0"
                  value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  預約方式
                  <a href="/admin/help/booking-types" target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, color: '#1d4ed8', textDecoration: 'none' }}>📖 說明</a>
                </label>
                <select
                  aria-label="預約方式"
                  value={form.booking_type}
                  onChange={(e) => setForm({ ...form, booking_type: e.target.value as 'scheduled' | 'request' | 'instant' })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                >
                  <option value="scheduled">排程預約</option>
                  <option value="request">申請預約</option>
                  <option value="instant">即時預約</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="plan-form-min-participants" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案最低成團人數</label>
                <input
                  id="plan-form-min-participants"
                  type="number"
                  min="1"
                  value={form.min_participants}
                  onChange={(e) => setForm({ ...form, min_participants: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="plan-form-max-participants" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>方案最多人數</label>
                <input
                  id="plan-form-max-participants"
                  type="number"
                  min="1"
                  value={form.max_participants}
                  onChange={(e) => setForm({ ...form, max_participants: Number(e.target.value) })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <details style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#f9fafb' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#2563eb' }}>方案詳情內容（點擊展開）</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>語言導覽
                  <input type="text" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
                <FormGrid cols={2} gap={10}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>「查看詳情」連結文字
                    <input type="text" value={form.details_link_text} onChange={(e) => setForm({ ...form, details_link_text: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>預約按鈕文字
                    <input type="text" value={form.booking_btn_text} onChange={(e) => setForm({ ...form, booking_btn_text: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                </FormGrid>
                <FormGrid cols={3} gap={10}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>最早可出發日
                    <input type="date" value={form.earliest_departure} onChange={(e) => setForm({ ...form, earliest_departure: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>最晚 N 天前確認
                    <input type="number" min="0" value={form.confirm_by_days} onChange={(e) => setForm({ ...form, confirm_by_days: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>N 天前可免費取消
                    <input type="number" min="0" value={form.free_cancel_days} onChange={(e) => setForm({ ...form, free_cancel_days: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                </FormGrid>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>亮點（每行一項）
                  <textarea rows={3} value={form.highlights} onChange={(e) => setForm({ ...form, highlights: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>費用包含（每行一項）
                  <textarea rows={3} value={form.plan_inclusions} onChange={(e) => setForm({ ...form, plan_inclusions: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>費用不包含（每行一項）
                  <textarea rows={3} value={form.plan_exclusions} onChange={(e) => setForm({ ...form, plan_exclusions: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
                <div>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    行程介紹（站點時間表）— 每個站點可分區編輯，並可填圖片 URL 或後台上傳
                  </span>
                  {form.plan_itinerary.map((step, i) => (
                    <div
                      key={i}
                      style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' }}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <input
                          aria-label={`站點 ${i + 1} 圖示`}
                          value={step.icon}
                          onChange={(e) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], icon: e.target.value };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                          style={{ width: 44, flexShrink: 0, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', textAlign: 'center', fontSize: 20, boxSizing: 'border-box' }}
                          placeholder="📍"
                        />
                        <input
                          aria-label={`站點 ${i + 1} 名稱`}
                          value={step.title}
                          onChange={(e) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], title: e.target.value };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                          style={{ flex: '1 1 140px', minWidth: 0, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 10px', boxSizing: 'border-box' }}
                          placeholder="站點名稱"
                        />
                        <input
                          aria-label={`站點 ${i + 1} 時長`}
                          value={step.duration}
                          onChange={(e) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], duration: e.target.value };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                          style={{ flex: '0 0 84px', width: 84, border: '1px solid #d1d5db', borderRadius: 6, padding: '6px 8px', boxSizing: 'border-box' }}
                          placeholder="60分鐘"
                        />
                        <button
                          type="button"
                          aria-label={`移除站點 ${i + 1}`}
                          onClick={() => setForm({ ...form, plan_itinerary: form.plan_itinerary.filter((_, j) => j !== i) })}
                          style={{ flexShrink: 0, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        aria-label={`站點 ${i + 1} 描述`}
                        rows={2}
                        value={step.description}
                        onChange={(e) => {
                          const s = [...form.plan_itinerary];
                          s[i] = { ...s[i], description: e.target.value };
                          setForm({ ...form, plan_itinerary: s });
                        }}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                        placeholder="站點描述（選填）"
                      />
                      <div style={{ marginTop: 8 }}>
                        <input
                          aria-label={`站點 ${i + 1} 圖片網址`}
                          type="url"
                          value={step.imageUrl}
                          onChange={(e) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], imageUrl: e.target.value };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                          placeholder="圖片 URL（可貼網址，或用下方按鈕上傳）"
                        />
                        {step.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={step.imageUrl}
                            alt={`站點 ${i + 1} 圖片預覽`}
                            style={{ marginTop: 8, width: '100%', maxWidth: 240, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8, background: '#f3f4f6' }}
                          />
                        )}
                        <ImageUpload
                          activityId={activityId}
                          activitySlug={activityId}
                          type="gallery"
                          onUploaded={(url) => {
                            const s = [...form.plan_itinerary];
                            s[i] = { ...s[i], imageUrl: url };
                            setForm({ ...form, plan_itinerary: s });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, plan_itinerary: [...form.plan_itinerary, createEmptyItineraryStep()] })}
                    style={{ background: '#eff6ff', color: '#2563eb', border: '1px dashed #93c5fd', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: '100%' }}
                  >
                    + 新增站點
                  </button>
                </div>
                <FormGrid cols={2} gap={10}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>集合地點名稱
                    <input type="text" value={form.meeting_point_name} onChange={(e) => setForm({ ...form, meeting_point_name: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>集合地址
                    <input type="text" value={form.meeting_address} onChange={(e) => setForm({ ...form, meeting_address: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>體驗地點名稱
                    <input type="text" value={form.experience_point_name} onChange={(e) => setForm({ ...form, experience_point_name: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>體驗地址
                    <input type="text" value={form.experience_address} onChange={(e) => setForm({ ...form, experience_address: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  </label>
                </FormGrid>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>購買須知（每行一項）
                  <textarea rows={3} value={form.plan_notices} onChange={(e) => setForm({ ...form, plan_notices: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>取消政策（每行一項）
                  <textarea rows={3} value={form.plan_refund_rules} onChange={(e) => setForm({ ...form, plan_refund_rules: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </label>
              </div>
            </details>
            {editingPlan && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>狀態</label>
                <select
                  aria-label="狀態"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' | 'archived' })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                >
                  <option value="active">啟用</option>
                  <option value="inactive">停用</option>
                  <option value="archived">已封存</option>
                </select>
              </div>
            )}
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button onClick={savePlan} disabled={saving} style={btn(saving ? '#86efac' : '#16a34a', '#fff')}>
                {saving ? '儲存中...' : '儲存'}
              </button>
              <button onClick={() => setShowModal(false)} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
                取消
              </button>
            </div>
          </div>
    </ResponsiveModal>
  );
}
