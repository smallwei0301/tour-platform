'use client';

// 開放季節管理面板（#1615 第二批）：自 app/admin/activities/[id]/plans/page.tsx 原樣拆出。
// 季節狀態與 API 呼叫仍在頁面層（lift state），prop 名稱沿用頁面原變數／函式名，
// JSX 與原檔逐字相同，零行為變更。
import { Card, Badge } from '../ui';
import { FormGrid } from '../responsive';
import { btn, smallBtn } from './button-styles';
import {
  formatSeasonWindow,
  type ActivityPlanSeason,
  type SeasonFormState,
} from './plan-types';

interface PlanSeasonsPanelProps {
  seasonPanelPlanName: string;
  seasons: ActivityPlanSeason[];
  seasonLoading: boolean;
  seasonError: string;
  seasonNotice: string;
  showSeasonForm: boolean;
  editingSeason: ActivityPlanSeason | null;
  seasonForm: SeasonFormState;
  setSeasonForm: (form: SeasonFormState) => void;
  seasonSaving: boolean;
  yearRoundSaving: boolean;
  isYearRound: boolean;
  hasActiveSeasons: boolean;
  openSeasonForm: (season?: ActivityPlanSeason) => void;
  closeSeasonForm: () => void;
  saveSeason: () => void;
  disableSeason: (season: ActivityPlanSeason) => Promise<void>;
  toggleYearRound: (next: boolean) => Promise<void>;
}

export function PlanSeasonsPanel({
  seasonPanelPlanName, seasons, seasonLoading, seasonError, seasonNotice,
  showSeasonForm, editingSeason, seasonForm, setSeasonForm, seasonSaving,
  yearRoundSaving, isYearRound, hasActiveSeasons,
  openSeasonForm, closeSeasonForm, saveSeason, disableSeason, toggleYearRound,
}: PlanSeasonsPanelProps) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>開放季節</h3>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
            {seasonPanelPlanName}：管理可販售季節區間與停用狀態。
          </p>
        </div>
        <button onClick={() => openSeasonForm()} disabled={isYearRound} style={btn(isYearRound ? '#cbd5e1' : '#2563eb', '#fff')}>
          新增季節
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 16,
          background: isYearRound ? '#ecfdf5' : '#ffffff',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: '#111827' }}>全年開放</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            開啟後忽略下方季節區間，此方案全年皆可販售；關閉則改由下方設定的季節區間決定可販售期間。
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isYearRound}
          aria-label="全年開放"
          disabled={yearRoundSaving || seasonLoading}
          onClick={() => void toggleYearRound(!isYearRound)}
          style={{
            width: 56,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: yearRoundSaving || seasonLoading ? 'default' : 'pointer',
            background: isYearRound ? '#059669' : '#cbd5e1',
            position: 'relative',
            flexShrink: 0,
            transition: 'background .15s',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: isYearRound ? 29 : 3,
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left .15s',
            }}
          />
        </button>
      </div>

      {isYearRound ? (
        <div role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4 }}>已設定全年開放</div>
          <div style={{ fontSize: 14, color: '#065f46' }}>
            此方案目前為全年開放，旅客全年皆可預約；下方季節區間暫時不生效。若要改回指定季節販售，請關閉上方「全年開放」。
          </div>
        </div>
      ) : (
        !hasActiveSeasons && !seasonLoading && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>請先設定指定季節或開啟全年開放</div>
            <div style={{ fontSize: 14, color: '#9a3412' }}>
              此方案尚未設定可販售的季節區間，也未開啟「全年開放」，旅客端目前無法預約。請新增季節區間，或開啟上方「全年開放」。
            </div>
          </div>
        )
      )}

      {seasonError && (
        <div role="alert" aria-live="polite" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 14, marginBottom: 16 }}>
          {seasonError}
        </div>
      )}

      {seasonNotice && (
        <div role="status" aria-live="polite" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', color: '#1d4ed8', fontSize: 14, marginBottom: 16 }}>
          {seasonNotice}
        </div>
      )}

      {showSeasonForm && (
        <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 12 }}>{editingSeason ? '編輯季節' : '新增季節'}</div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
              季節名稱
              <input
                type="text"
                aria-label="季節名稱"
                value={seasonForm.name}
                onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
              />
            </label>
            <FormGrid cols={2} gap={12}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                開始月份
                <input
                  type="number"
                  min="1"
                  max="12"
                  aria-label="開始月份"
                  value={seasonForm.start_month}
                  onChange={(e) => setSeasonForm({ ...seasonForm, start_month: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                開始日期
                <input
                  type="number"
                  min="1"
                  max="31"
                  aria-label="開始日期"
                  value={seasonForm.start_day}
                  onChange={(e) => setSeasonForm({ ...seasonForm, start_day: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                結束月份
                <input
                  type="number"
                  min="1"
                  max="12"
                  aria-label="結束月份"
                  value={seasonForm.end_month}
                  onChange={(e) => setSeasonForm({ ...seasonForm, end_month: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                結束日期
                <input
                  type="number"
                  min="1"
                  max="31"
                  aria-label="結束日期"
                  value={seasonForm.end_day}
                  onChange={(e) => setSeasonForm({ ...seasonForm, end_day: e.target.value })}
                  style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
                />
              </label>
            </FormGrid>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
              時區
              <input
                type="text"
                aria-label="時區"
                value={seasonForm.timezone}
                onChange={(e) => setSeasonForm({ ...seasonForm, timezone: e.target.value })}
                style={{ width: '100%', marginTop: 4, padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={saveSeason} disabled={seasonSaving} style={btn(seasonSaving ? '#93c5fd' : '#2563eb', '#fff')}>
              {seasonSaving ? '儲存中...' : '儲存季節'}
            </button>
            <button onClick={closeSeasonForm} disabled={seasonSaving} style={btn('#fff', '#374151', '1px solid #d1d5db')}>
              取消
            </button>
          </div>
        </div>
      )}

      {seasonLoading ? (
        <div style={{ fontSize: 14, color: '#6b7280' }}>載入開放季節中...</div>
      ) : seasons.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 20, color: '#64748b', fontSize: 14 }}>
          尚未建立季節區間。請先新增季節，或於上方開啟「全年開放」，避免把空白狀態誤解為全年開放。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {seasons.map((season) => (
            <div key={season.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: season.is_active ? '#ffffff' : '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#111827' }}>{season.name}</div>
                  <div style={{ marginTop: 6, fontSize: 14, color: '#374151' }}>{formatSeasonWindow(season)}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>{season.timezone}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge variant={season.is_active ? 'success' : 'default'}>{season.is_active ? '啟用中' : '已停用'}</Badge>
                  <button onClick={() => openSeasonForm(season)} style={smallBtn('#e0f2fe', '#075985')}>編輯季節</button>
                  {season.is_active && (
                    <button onClick={() => void disableSeason(season)} style={smallBtn('#fee2e2', '#991b1b')}>
                      停用季節
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
