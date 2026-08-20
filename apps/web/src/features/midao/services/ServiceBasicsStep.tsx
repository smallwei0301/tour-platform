'use client';

import { useState } from 'react';
import styles from './services.module.css';
import type { BookingType, PlanPriceType, ServiceDraftPayload, ServicePlan } from './service-types';
import { BOOKING_TYPE_LABELS, PRICE_TYPE_LABELS, emptyServicePlan } from './service-types';

interface ServiceBasicsStepProps {
  form: ServiceDraftPayload;
  onChange: (patch: Partial<ServiceDraftPayload>) => void;
}

function numberFieldValue(event: { target: { value: string } }, fallback: number): number {
  const parsed = Number(event.target.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ServiceBasicsStep({ form, onChange }: ServiceBasicsStepProps) {
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const plans = form.plans;

  const updatePlan = (index: number, patch: Partial<ServicePlan>) => {
    onChange({ plans: plans.map((plan, planIndex) => (planIndex === index ? { ...plan, ...patch } : plan)) });
  };

  // D1／D6.3：下架＝從畫面陣列移除。不呼叫任何刪除 API、不寫任何 status 欄位；
  // 未列在 payload 的方案會由既有的 S6 全量替換語意標為 inactive，訂單歷史不受影響。
  const removePlan = (index: number) => {
    onChange({ plans: plans.filter((_, planIndex) => planIndex !== index) });
    setPendingRemoval(null);
  };

  return (
    <section className={styles.formCard} aria-labelledby="service-basics-title">
      <div>
        <p className={styles.eyebrow}>第一步 · 先讓旅人知道你在帶什麼</p>
        <h2 id="service-basics-title" className="midao-heading">基本資料</h2>
        <p className={styles.description}>先寫下服務的核心內容，之後每一步都會自動儲存成草稿。</p>
      </div>
      <div className={styles.field}>
        <label htmlFor="service-name">服務名稱</label>
        <input id="service-name" value={form.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="例如：海邊潮間帶夜間觀察" autoComplete="off" />
        <small>用一句清楚的名稱，讓旅人知道這趟服務的主題。</small>
      </div>
      <div className={styles.field}>
        <label htmlFor="service-description">服務說明</label>
        <textarea id="service-description" value={form.description} onChange={(event) => onChange({ description: event.target.value, descriptions: event.target.value ? [event.target.value] : [] })} placeholder="描述你會怎麼帶路、旅人會看見什麼，以及你特別在意的體驗細節。" />
      </div>

      <div>
        <h3 className="midao-heading">方案</h3>
        {form.plans.length > 0 ? (
          <div className={styles.legacyNotice} role="status" data-testid="service-plans-disclosure">
            <strong>此服務目前有 {form.plans.length} 個方案。</strong>
            <p>發布時，未列在這個畫面上的方案會被下架，既有訂單不受影響。</p>
          </div>
        ) : null}
      </div>

      <div className={styles.questionList}>
        {form.plans.map((plan, index) => (
          <article className={styles.questionCard} key={`${plan.slug ?? 'new-plan'}-${index}`} aria-label={`方案 ${index + 1}`}>
            <div className={styles.questionHeader}>
              <span className={styles.questionIndex}>方案 {index + 1}</span>
              <div className={styles.questionActions}>
                <button className={styles.dangerButton} type="button" onClick={() => setPendingRemoval(index)}>下架此方案</button>
              </div>
            </div>
            {pendingRemoval === index ? (
              <div className={styles.alert} role="alert">
                <strong>確定要下架「{plan.name || `方案 ${index + 1}`}」嗎？</strong>
                <p>下架後旅人將無法選購此方案，既有訂單不受影響。發布後生效。</p>
                <div className={styles.footerActions}>
                  <button className={styles.dangerButton} type="button" onClick={() => removePlan(index)}>確定下架此方案</button>
                  <button className={styles.secondaryButton} type="button" onClick={() => setPendingRemoval(null)}>取消</button>
                </div>
              </div>
            ) : null}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor={`service-plan-name-${index}`}>方案 {index + 1} 名稱</label>
                <input id={`service-plan-name-${index}`} value={plan.name} onChange={(event) => updatePlan(index, { name: event.target.value })} placeholder="例如：日間小團" />
                <small>至少一個有效方案才能發布。</small>
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-type-${index}`}>方案 {index + 1} 預約方式</label>
                <select id={`service-plan-type-${index}`} value={plan.booking_type} onChange={(event) => updatePlan(index, { booking_type: event.target.value as BookingType })}>
                  {(Object.keys(BOOKING_TYPE_LABELS) as BookingType[]).map((value) => <option key={value} value={value}>{BOOKING_TYPE_LABELS[value]}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-duration-${index}`}>方案 {index + 1} 時長（分鐘）</label>
                <input id={`service-plan-duration-${index}`} type="number" min={1} value={plan.duration_minutes} onChange={(event) => updatePlan(index, { duration_minutes: numberFieldValue(event, plan.duration_minutes) })} />
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-price-type-${index}`}>方案 {index + 1} 計價方式</label>
                <select id={`service-plan-price-type-${index}`} value={plan.price_type} onChange={(event) => updatePlan(index, { price_type: event.target.value as PlanPriceType })}>
                  {(Object.keys(PRICE_TYPE_LABELS) as PlanPriceType[]).map((value) => <option key={value} value={value}>{PRICE_TYPE_LABELS[value]}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-base-price-${index}`}>方案 {index + 1} 價格（新台幣）</label>
                <input id={`service-plan-base-price-${index}`} type="number" min={0} value={plan.base_price} onChange={(event) => updatePlan(index, { base_price: numberFieldValue(event, plan.base_price) })} />
                <small>目前的價格會原樣保留，除非你在這裡改動。</small>
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-min-${index}`}>方案 {index + 1} 最少人數</label>
                <input id={`service-plan-min-${index}`} type="number" min={1} value={plan.min_participants} onChange={(event) => updatePlan(index, { min_participants: numberFieldValue(event, plan.min_participants) })} />
              </div>
              <div className={styles.field}>
                <label htmlFor={`service-plan-max-${index}`}>方案 {index + 1} 最多人數</label>
                <input id={`service-plan-max-${index}`} type="number" min={1} value={plan.max_participants} onChange={(event) => updatePlan(index, { max_participants: numberFieldValue(event, plan.max_participants) })} />
              </div>
              {plan.slug ? (
                <div className={styles.field}>
                  <label htmlFor={`service-plan-slug-${index}`}>方案 {index + 1} 代碼</label>
                  <input id={`service-plan-slug-${index}`} value={plan.slug} readOnly aria-readonly="true" />
                  <small>系統用來辨識這個方案的代碼，不需要也不能修改。</small>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      <button className={styles.secondaryButton} type="button" onClick={() => onChange({ plans: [...plans, emptyServicePlan()] })}>＋ 新增方案</button>
    </section>
  );
}
