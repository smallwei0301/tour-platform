import styles from './services.module.css';
import type { ServiceDraftPayload } from './service-types';

interface ServiceBasicsStepProps {
  form: ServiceDraftPayload;
  onChange: (patch: Partial<ServiceDraftPayload>) => void;
}

export function ServiceBasicsStep({ form, onChange }: ServiceBasicsStepProps) {
  const firstPlan = form.plans[0] ?? { name: '', booking_type: 'scheduled' as const };
  const updatePlan = (patch: Partial<typeof firstPlan>) => onChange({ plans: [{ ...firstPlan, ...patch }, ...form.plans.slice(1)] });
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
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label htmlFor="service-plan-name">第一個方案名稱</label>
          <input id="service-plan-name" value={firstPlan.name} onChange={(event) => updatePlan({ name: event.target.value })} placeholder="例如：日間小團" />
          <small>至少一個有效方案才能發布。</small>
        </div>
        <div className={styles.field}>
          <label htmlFor="service-plan-type">預約方式</label>
          <select id="service-plan-type" value={firstPlan.booking_type} onChange={(event) => updatePlan({ booking_type: event.target.value as typeof firstPlan.booking_type })}>
            <option value="scheduled">指定時段</option>
            <option value="request">提出需求</option>
            <option value="instant">立即預約</option>
          </select>
        </div>
      </div>
    </section>
  );
}
