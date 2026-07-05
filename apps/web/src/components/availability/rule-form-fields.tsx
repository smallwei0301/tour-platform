'use client';

// #1615 第一批：guide／admin 時段規則 Modal 內「兩頁逐字相同」的表單區塊。
// 純結構搬移——JSX 與文案與原頁面完全相同；guide／admin 的差異
//（input id、weekly 切換是否清空 single_date、interval 手動編輯追蹤）
// 一律經 props 注入，禁止在此檔寫死任一頁的專屬行為。

import { FormGrid } from '../admin/responsive';
import {
  describePlanSeasonStatus,
  describeRuleSeasonConflict,
} from '../../lib/availability-v2/canonical-availability-ui';
import { WEEKDAY_LABELS, toneStyles } from './shared';

// 兩頁 ruleForm 中與排程欄位相關的共同子集（頁面自身的 ruleForm 可帶額外欄位，
// 結構型別相容即可傳入）。
export type RuleScheduleFormValues = {
  rule_mode: 'weekly' | 'single-day';
  single_date: string;
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  effective_from: string;
  effective_to: string;
  is_active: boolean;
  use_dynamic_reemit: boolean;
};

// 各頁的 input id（guide＝avail-*、admin＝admin-avail-*，
// 但 admin 的緩衝欄位歷史 id 為 avail-buffer-time）由頁面傳入，
// 以保留既有 label htmlFor／input id 關聯與 e2e 選擇器。
export type RuleScheduleFieldIds = {
  singleDate: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  interval: string;
  buffer: string;
};

// ── 排程方案警示＋方案季節狀態＋規則季節衝突＋常見提示 ──
// （兩頁逐字相同的四個提示區塊）
export function RuleSeasonNotices({
  selectedRulePlanIsScheduled,
  hasSelectedRulePlan,
  rulePlanSeasonStatus,
  ruleSeasonConflict,
}: {
  selectedRulePlanIsScheduled: boolean;
  hasSelectedRulePlan: boolean;
  rulePlanSeasonStatus: ReturnType<typeof describePlanSeasonStatus>;
  ruleSeasonConflict: ReturnType<typeof describeRuleSeasonConflict>;
}) {
  return (
    <>
      {selectedRulePlanIsScheduled && (
        <div
          data-testid="rule-booking-type-warning"
          style={{ border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10, padding: '10px 12px', color: '#92400e', fontSize: 13, lineHeight: 1.6 }}
        >
          ⚠️ 此方案為<strong>排程預約</strong>，僅使用固定場次，無法設定動態可預約時段規則。請改用「場次管理」建立固定場次；動態時段規則僅適用<strong>即時／申請</strong>預約方案。
        </div>
      )}
      {hasSelectedRulePlan && (
        <div style={{ border: `1px solid ${toneStyles[rulePlanSeasonStatus.tone].border}`, background: toneStyles[rulePlanSeasonStatus.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[rulePlanSeasonStatus.tone].color }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{rulePlanSeasonStatus.title}</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>{rulePlanSeasonStatus.description}</div>
        </div>
      )}
      {hasSelectedRulePlan && ruleSeasonConflict && (
        <div style={{ border: `1px solid ${toneStyles[ruleSeasonConflict.tone].border}`, background: toneStyles[ruleSeasonConflict.tone].background, borderRadius: 10, padding: '10px 12px', color: toneStyles[ruleSeasonConflict.tone].color, fontSize: 12, lineHeight: 1.6 }}>
          {ruleSeasonConflict.message}
        </div>
      )}
      {hasSelectedRulePlan && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          常見提示：此方案尚未設定開放季節、你設定的日期包含方案非開放季節、這一天不在方案開放季節內。
        </div>
      )}
    </>
  );
}

// ── 開放模式／單日或生效區間／星期／起訖時間／間隔與緩衝 ──
// onModeChange：weekly／single-day 切換語意由頁面決定（admin 切回 weekly 會
// 清空 single_date、guide 不會——保留原行為）。
// onIntervalChange：guide 需要同時標記 intervalManuallyEdited（#1289 AC1）。
// onPatch：等價於原頁面的 setRuleForm({ ...ruleForm, ...patch })。
export function RuleScheduleFields({
  ruleForm,
  ids,
  onModeChange,
  onPatch,
  onIntervalChange,
}: {
  ruleForm: RuleScheduleFormValues;
  ids: RuleScheduleFieldIds;
  onModeChange: (mode: 'weekly' | 'single-day') => void;
  onPatch: (patch: Partial<RuleScheduleFormValues>) => void;
  onIntervalChange: (value: number) => void;
}) {
  return (
    <>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開放模式</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13 }}>
            <input type="radio" checked={ruleForm.rule_mode === 'weekly'} onChange={() => onModeChange('weekly')} /> 每週重複
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="radio" checked={ruleForm.rule_mode === 'single-day'} onChange={() => onModeChange('single-day')} /> 單日開放
          </label>
        </div>
      </div>
      {ruleForm.rule_mode === 'single-day' ? (
        <div>
          <label htmlFor={ids.singleDate} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>單日日期（台灣時間）</label>
          <input
            id={ids.singleDate}
            type="date"
            value={ruleForm.single_date}
            onChange={(e) => onPatch({ single_date: e.target.value })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      ) : (
        <FormGrid cols={2}>
          <div>
            <label htmlFor={ids.startDate} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效起日（可空）</label>
            <input
              id={ids.startDate}
              type="date"
              value={ruleForm.effective_from}
              onChange={(e) => onPatch({ effective_from: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor={ids.endDate} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>生效迄日（可空）</label>
            <input
              id={ids.endDate}
              type="date"
              value={ruleForm.effective_to}
              onChange={(e) => onPatch({ effective_to: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        </FormGrid>
      )}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>星期</label>
        <select
          aria-label="星期"
          value={ruleForm.weekday}
          onChange={(e) => onPatch({ weekday: Number(e.target.value) })}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
          disabled={ruleForm.rule_mode === 'single-day'}
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <option key={i} value={i}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <FormGrid cols={2}>
        <div>
          <label htmlFor={ids.startTime} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>開始時間</label>
          <input
            id={ids.startTime}
            type="time"
            value={ruleForm.start_time_local}
            onChange={(e) => onPatch({ start_time_local: e.target.value })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor={ids.endTime} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>結束時間</label>
          <input
            id={ids.endTime}
            type="time"
            value={ruleForm.end_time_local}
            onChange={(e) => onPatch({ end_time_local: e.target.value })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      </FormGrid>
      <FormGrid cols={2}>
        <div>
          <label htmlFor={ids.interval} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>時段間隔 (分鐘)</label>
          <input
            id={ids.interval}
            type="number"
            min="15"
            step="15"
            value={ruleForm.slot_interval_minutes}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label htmlFor={ids.buffer} style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>緩衝時間 (分鐘)</label>
          <input
            id={ids.buffer}
            type="number"
            min="0"
            step="5"
            value={ruleForm.buffer_before_minutes}
            onChange={(e) =>
              onPatch({
                buffer_before_minutes: Number(e.target.value),
                buffer_after_minutes: Number(e.target.value),
              })
            }
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      </FormGrid>
    </>
  );
}

// ── 動態時段／啟用規則兩個 checkbox（兩頁逐字相同） ──
export function RuleActivationToggles({
  ruleForm,
  onPatch,
}: {
  ruleForm: Pick<RuleScheduleFormValues, 'use_dynamic_reemit' | 'is_active'>;
  onPatch: (patch: Partial<Pick<RuleScheduleFormValues, 'use_dynamic_reemit' | 'is_active'>>) => void;
}) {
  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={ruleForm.use_dynamic_reemit}
          onChange={(e) => onPatch({ use_dynamic_reemit: e.target.checked })}
        />
        啟用動態時段（根據上次預訂結束時間自動補發可用時段）
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={ruleForm.is_active}
          onChange={(e) => onPatch({ is_active: e.target.checked })}
        />
        啟用此規則
      </label>
    </>
  );
}

// ── Modal 底部的錯誤訊息框（rule／blackout Modal 皆用，兩頁逐字相同） ──
export function FormErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 13 }}>
      {error}
    </div>
  );
}
