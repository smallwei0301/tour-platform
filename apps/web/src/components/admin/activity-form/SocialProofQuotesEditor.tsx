'use client';

// 社群口碑語錄編輯器（#1615 第二批）：自 app/admin/activities/[id]/edit/page.tsx
// 原樣拆出。狀態與照片上傳邏輯仍留在頁面層（lift state），本元件只負責渲染與回呼，
// 零行為變更；prop 名稱沿用頁面原函式名，JSX 與原檔逐字相同。
import { fieldStyle, labelStyle } from './form-styles';

export type SocialProofQuoteRow = { author: string; rating: number; text: string; photos?: string[] };

// 暖場評論照片上限：與旅客評價照片共用 review-photos 桶，最多 5 張。
export const QUOTE_PHOTO_MAX = 5;

interface SocialProofQuotesEditorProps {
  socialProofQuotes: SocialProofQuoteRow[];
  quotePhotoUploading: number | null;
  addQuote: () => void;
  updateQuote: (index: number, patch: Partial<SocialProofQuoteRow>) => void;
  removeQuote: (index: number) => void;
  uploadQuotePhotos: (index: number, startCount: number, files: File[]) => void;
  removeQuotePhoto: (index: number, url: string) => void;
}

export function SocialProofQuotesEditor({
  socialProofQuotes, quotePhotoUploading,
  addQuote, updateQuote, removeQuote, uploadQuotePhotos, removeQuotePhoto,
}: SocialProofQuotesEditorProps) {
  return (
    <div style={labelStyle}>
      社群口碑語錄（可編輯人名、星數、評價內容）
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {socialProofQuotes.length === 0 && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>尚無口碑語錄，點下方按鈕新增。</span>
        )}
        {socialProofQuotes.map((q, i) => (
          <div
            key={i}
            style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={q.author}
                onChange={e => updateQuote(i, { author: e.target.value })}
                placeholder="人名（留空顯示「旅客回饋」）"
                aria-label="評論人名"
                style={{ ...fieldStyle, flex: '1 1 180px', margin: 0 }}
              />
              <select
                value={q.rating}
                onChange={e => updateQuote(i, { rating: Number(e.target.value) })}
                aria-label="評論星數"
                style={{ ...fieldStyle, flex: '0 0 130px', margin: 0 }}
              >
                {[5, 4, 3, 2, 1].map(n => (
                  <option key={n} value={n}>{'★'.repeat(n)}（{n}）</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeQuote(i)}
                style={{ flex: '0 0 auto', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}
              >
                刪除
              </button>
            </div>
            <textarea
              value={q.text}
              onChange={e => updateQuote(i, { text: e.target.value })}
              rows={2}
              placeholder="評價內容"
              aria-label="評價內容"
              style={{ ...fieldStyle, margin: 0 }}
            />
            {/* 暖場評論照片（選填，最多 5 張，與旅客評價照片同樣式：手機可橫向滑動） */}
            <div>
              <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                照片（選填，最多 {QUOTE_PHOTO_MAX} 張）
              </span>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollSnapType: 'x mandatory' }}>
                {(q.photos ?? []).map((url) => (
                  <div key={url} style={{ position: 'relative', flex: '0 0 auto', scrollSnapAlign: 'start' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="暖場評論照片" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
                    <button
                      type="button"
                      onClick={() => removeQuotePhoto(i, url)}
                      aria-label="移除照片"
                      style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(17,24,39,0.85)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}
                    >×</button>
                  </div>
                ))}
                {(q.photos ?? []).length < QUOTE_PHOTO_MAX && (
                  <label style={{ flex: '0 0 auto', width: 72, height: 72, borderRadius: 6, border: '1px dashed #d1d5db', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: quotePhotoUploading === i ? 'default' : 'pointer', color: '#6b7280', fontSize: 11, gap: 2, scrollSnapAlign: 'start' }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{quotePhotoUploading === i ? '…' : '+'}</span>
                    <span>{quotePhotoUploading === i ? '上傳中' : '新增'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      disabled={quotePhotoUploading === i}
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        uploadQuotePhotos(i, (q.photos ?? []).length, files);
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addQuote}
          style={{ alignSelf: 'flex-start', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}
        >
          ＋ 新增一則口碑
        </button>
      </div>
    </div>
  );
}
