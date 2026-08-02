import styles from './services.module.css';
import { QuestionPreview } from './QuestionPreview';
import type { PublicationPreview, ServiceDraftPayload } from './service-types';

interface ServicePreviewStepProps {
  form: ServiceDraftPayload;
  publicationPreview: PublicationPreview | null;
}

function validateLocally(form: ServiceDraftPayload): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('活動名稱（name）為必填，不可為空白。');
  if (!form.description.trim() && !(form.descriptions ?? []).some((item) => item.trim())) errors.push('至少需要一則說明文字（description / descriptions 不可全部為空）。');
  if (form.plans.length === 0) errors.push('至少需要一個有效方案／時段（plans 不可為空）。');
  let validPlanCount = 0;
  form.plans.forEach((plan, index) => {
    const planErrors: string[] = [];
    if (!plan.name.trim()) planErrors.push('name 不可為空白。');
    if (!['scheduled', 'request', 'instant'].includes(plan.booking_type)) planErrors.push('booking_type 不合法。');
    if (planErrors.length > 0) errors.push(`方案 #${index + 1} 無效：${planErrors.join(' ')}`);
    else validPlanCount += 1;
  });
  if (form.plans.length > 0 && validPlanCount === 0) errors.push('至少需要一個有效方案／時段，但目前沒有任何方案通過驗證。');
  form.questions.forEach((question, index) => {
    if (!question.question_key.trim()) errors.push(`問卷題目「#${index + 1}」：question_key 為必填，且不可為空字串。`);
    if (!/^[a-z0-9_]+$/u.test(question.question_key)) errors.push(`問卷題目「${question.question_key || `#${index + 1}`}」：question_key 只允許小寫英數字與底線。`);
    if ((question.type === 'single_choice' || question.type === 'multi_choice') && question.options.filter(Boolean).length === 0) errors.push(`問卷題目「${question.question_key || `#${index + 1}`}」：選擇題至少需要一個選項。`);
  });
  return errors;
}

export function getServicePublicationErrors(form: ServiceDraftPayload, publicationPreview: PublicationPreview | null): string[] {
  const localErrors = validateLocally(form);
  if (localErrors.length > 0) return localErrors;
  return publicationPreview?.errors ?? [];
}

export function ServicePreviewStep({ form, publicationPreview }: ServicePreviewStepProps) {
  const errors = getServicePublicationErrors(form, publicationPreview);
  return (
    <section className={styles.formCard} aria-labelledby="service-preview-title">
      <div>
        <p className={styles.eyebrow}>第三步 · 確認旅人看到的服務</p>
        <h2 id="service-preview-title" className="midao-heading">預覽與發布</h2>
        <p className={styles.description}>發布前會再次檢查必要資料。只要還有原因列在下面，就先補齊再發布。</p>
      </div>
      <div className={styles.previewGrid}>
        <article className={styles.previewPanel} aria-label="服務內容預覽">
          <div className={styles.statuses}><span className={styles.pill}>旅人預覽</span></div>
          <h3 className={styles.previewTitle}>{form.name || '尚未命名的服務'}</h3>
          <p className={styles.previewDescription}>{form.description || '尚未填寫服務說明。'}</p>
          <div>
            <h4 className="midao-heading">方案</h4>
            {form.plans.length > 0 ? form.plans.map((plan, index) => <p className={styles.hint} key={`${plan.name}-${index}`}>{plan.name || `方案 ${index + 1}`} · {plan.booking_type}</p>) : <p className={styles.hint}>尚未設定方案</p>}
          </div>
          <div>
            <h4 className="midao-heading">自訂問卷</h4>
            <QuestionPreview questions={form.questions} />
          </div>
        </article>
        <aside className={styles.publishBox} aria-live="polite">
          {errors.length > 0 ? (
            <div className={styles.alert} role="alert">
              <strong>尚不能發布，請先處理：</strong>
              <ul className={styles.reasonList}>{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>
            </div>
          ) : (
            <div className={styles.success} role="status">資料已通過發布前檢查，可以發布。</div>
          )}
          <p className={styles.hint}>草稿會持續自動保存；發布只會在你按下按鈕後執行。</p>
        </aside>
      </div>
    </section>
  );
}
