'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ServiceBasicsStep } from './ServiceBasicsStep';
import { ServicePreviewStep, getServicePublicationErrors } from './ServicePreviewStep';
import { ServicePublishAction } from './ServicePublishAction';
import { ServiceQuestionsStep } from './ServiceQuestionsStep';
import {
  createGuideActivity,
  extractConflictDraft,
  fetchServiceDraft,
  getErrorDetails,
  normalizePublicationPreview,
  prepareServiceMutations,
  saveServiceDraft,
} from './service-api';
import styles from './services.module.css';
import { emptyServiceDraft, mergeServiceDraft, type PublicationPreview, type ServiceDraft, type ServiceDraftPayload } from './service-types';

const STEPS = ['基本資料', '設定問卷', '預覽確認'] as const;

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

interface ServiceWizardProps {
  initialActivityId?: string;
}

export function ServiceWizard({ initialActivityId }: ServiceWizardProps) {
  const [activityId, setActivityId] = useState(initialActivityId || '');
  const [form, setForm] = useState<ServiceDraftPayload>(emptyServiceDraft);
  const [revision, setRevision] = useState(0);
  const [publicationPreview, setPublicationPreview] = useState<PublicationPreview | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(!initialActivityId);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [conflictMessage, setConflictMessage] = useState('');
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const hydratedRef = useRef(false);
  const revisionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const applyDraft = useCallback((draft: ServiceDraft | null, advisory?: unknown) => {
    const nextRevision = draft?.revision ?? 0;
    revisionRef.current = nextRevision;
    setRevision(nextRevision);
    setForm(mergeServiceDraft(draft?.payload));
    setPublicationPreview(normalizePublicationPreview(advisory));
    setDirty(false);
    setSaveState('saved');
    hydratedRef.current = true;
  }, []);

  const loadDraft = useCallback(async (id: string) => {
    const response = await fetchServiceDraft(id);
    applyDraft(response.draft, response.publicationPreview);
  }, [applyDraft]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      try {
        await prepareServiceMutations();
        let id = initialActivityId || '';
        if (!id) {
          id = await createGuideActivity();
          if (!mountedRef.current) return;
          setActivityId(id);
          setCreating(false);
        }
        await loadDraft(id);
      } catch (loadError) {
        if (mountedRef.current) setError(getErrorDetails(loadError).message || '載入服務失敗');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          setCreating(false);
        }
      }
    })();
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [initialActivityId, loadDraft]);

  const save = useCallback(async (nextForm: ServiceDraftPayload) => {
    if (!activityId || !hydratedRef.current) return;
    setSaveState('saving');
    setError('');
    try {
      const response = await saveServiceDraft(activityId, revisionRef.current, nextForm);
      if (!mountedRef.current) return;
      if (response.draft) {
        revisionRef.current = response.draft.revision;
        setRevision(response.draft.revision);
      }
      setPublicationPreview(normalizePublicationPreview(response.publicationPreview));
      setDirty(false);
      setSaveState('saved');
    } catch (saveError) {
      if (!mountedRef.current) return;
      const details = getErrorDetails(saveError);
      if (details.code === 'REVISION_CONFLICT' || details.status === 409) {
        const conflict = extractConflictDraft(details.data);
        setConflictMessage('其他分頁更新了這份草稿，你的內容先保留在畫面上。');
        setSaveState('conflict');
        if (conflict.currentRevision !== null) setRevision(conflict.currentRevision);
      } else {
        setSaveState('error');
        setError(details.message || '自動儲存失敗');
      }
    }
  }, [activityId]);

  const updateForm = (patch: Partial<ServiceDraftPayload>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    setSaveState('pending');
    setError('');
  };

  useEffect(() => {
    if (!dirty || !hydratedRef.current || !activityId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = form;
    saveTimerRef.current = setTimeout(() => { void save(snapshot); }, 900);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [activityId, dirty, form, save]);

  async function reloadLatest() {
    if (!activityId) return;
    setError('');
    setConflictMessage('');
    setSaveState('saving');
    try {
      await loadDraft(activityId);
    } catch (reloadError) {
      setSaveState('error');
      setError(getErrorDetails(reloadError).message || '重新載入失敗');
    }
  }

  function nextStep() { setStep((current) => Math.min(STEPS.length - 1, current + 1)); }
  function previousStep() { setStep((current) => Math.max(0, current - 1)); }

  if (loading || creating) {
    return <section className={styles.screen} aria-labelledby="service-wizard-loading"><h2 id="service-wizard-loading" className="midao-heading">服務編輯器</h2><div className={styles.loading} aria-busy="true"><span className={styles.loadingLine} /><span className={styles.loadingLine} /><span className={styles.loadingLine} /><span className={styles.srOnly}>服務編輯器載入中</span></div></section>;
  }

  if (error && !hydratedRef.current) {
    return <section className={styles.screen} aria-labelledby="service-wizard-error"><h2 id="service-wizard-error" className="midao-heading">服務編輯器</h2><div className={styles.alert} role="alert">{error}</div><button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>重新載入</button></section>;
  }

  const publicationErrors = getServicePublicationErrors(form, publicationPreview);
  const canPublish = publicationErrors.length === 0 && saveState !== 'saving' && !dirty && !publishedUrl;
  return (
    <section className={styles.screen} aria-labelledby="service-wizard-title">
      <div className={styles.wizardHeader}>
        <div>
          <p className={styles.eyebrow}>祕島服務工作台</p>
          <h2 id="service-wizard-title" className="midao-heading">{initialActivityId ? '編輯服務' : '新增服務'}</h2>
          <p className={styles.description}>三個步驟整理內容，離開頁面也不用擔心忘記存檔。</p>
        </div>
        <a className={styles.secondaryButton} href="/midao/services">返回服務列表</a>
      </div>

      <div className={styles.stepper} role="tablist" aria-label="服務建立步驟">
        {STEPS.map((label, index) => <button key={label} className={styles.stepButton} type="button" role="tab" aria-selected={step === index} data-active={step === index} data-complete={step > index} onClick={() => setStep(index)}><span className={styles.stepNumber}>STEP {index + 1}</span>{label}</button>)}
      </div>

      {conflictMessage ? <div className={styles.alert} role="alert"><strong>{conflictMessage}</strong><div className={styles.footerActions}><button className={styles.secondaryButton} type="button" onClick={() => void reloadLatest()}>載入最新版本</button></div></div> : null}
      {error ? <div className={styles.alert} role="alert">{error}</div> : null}
      {publishedUrl ? <div className={styles.success} role="status"><strong>已發布</strong> · 你的服務已經可以被旅人看見。<br /><a className={styles.publishedUrl} href={publishedUrl} target="_blank" rel="noreferrer">查看公開頁面 →</a></div> : null}

      {step === 0 ? <ServiceBasicsStep form={form} onChange={updateForm} /> : null}
      {step === 1 ? <ServiceQuestionsStep form={form} onChange={updateForm} /> : null}
      {step === 2 ? <ServicePreviewStep form={form} publicationPreview={publicationPreview} /> : null}

      <div className={styles.wizardFooter}>
        <span className={styles.saveStatus} data-testid="service-save-status" aria-live="polite">
          {saveState === 'saving' ? '儲存中…' : saveState === 'pending' || dirty ? '等待儲存…' : saveState === 'conflict' ? '需要重新載入' : saveState === 'error' ? '儲存失敗' : '已儲存'}
        </span>
        <div className={styles.footerActions}>
          {step > 0 ? <button className={styles.secondaryButton} type="button" onClick={previousStep}>← 上一步</button> : null}
          {step < 2 ? <button className={styles.primaryButton} type="button" onClick={nextStep}>{step === 0 ? '下一步：設定問卷' : '下一步：預覽確認'} →</button> : null}
          {step === 2 && activityId ? <ServicePublishAction activityId={activityId} expectedRevision={revision} disabled={!canPublish} onConflict={() => { setConflictMessage('草稿版本已更新，請先重新載入最新版本再發布。'); setSaveState('conflict'); }} onPublished={(result) => setPublishedUrl(result.publicUrl)} /> : null}
        </div>
      </div>
    </section>
  );
}
