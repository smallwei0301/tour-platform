'use client';

import { useState } from 'react';
import { getErrorDetails, publishServiceDraft } from './service-api';
import styles from './services.module.css';

interface ServicePublishActionProps {
  activityId: string;
  expectedRevision: number;
  disabled: boolean;
  onPublished: (result: { publicUrl: string | null; version: number | null }) => void;
  onConflict: () => void;
}

export function ServicePublishAction({ activityId, expectedRevision, disabled, onPublished, onConflict }: ServicePublishActionProps) {
  const [publishing, setPublishing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function publish() {
    if (disabled || publishing) return;
    setPublishing(true);
    setErrors([]);
    try {
      const result = await publishServiceDraft(activityId, expectedRevision);
      onPublished(result);
    } catch (error) {
      const details = getErrorDetails(error);
      if (details.code === 'REVISION_CONFLICT') {
        onConflict();
      } else {
        const payload = details.data as { errors?: unknown } | undefined;
        const apiErrors = Array.isArray(payload?.errors) ? payload.errors.filter((item): item is string => typeof item === 'string') : [];
        setErrors(apiErrors.length > 0 ? apiErrors : [details.status === 422 ? '發布前驗證未通過，請檢查上方原因。' : details.message]);
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className={styles.publishBox}>
      {errors.length > 0 ? <div className={styles.alert} role="alert"><ul className={styles.reasonList}>{errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div> : null}
      <button className={styles.primaryButton} type="button" disabled={disabled || publishing} onClick={() => void publish()}>
        {publishing ? '發布中…' : '發布服務'}
      </button>
    </div>
  );
}
