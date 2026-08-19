'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ensureNativeServiceDraft, getErrorDetails } from './service-api';
import styles from './services.module.css';
import type { ServiceListItem } from './service-types';

function formatPrice(value: number | null): string {
  if (value === null) return '尚未設定價格';
  return `NT$ ${new Intl.NumberFormat('zh-TW').format(value)}`;
}

export function getServiceLifecycleCopy(item: ServiceListItem): { label: string; meta: string; published: boolean } {
  if (item.lifecycleState === 'published_unversioned') {
    return { label: '已發布', meta: item.draftRevision ? `尚未版本化，草稿第 ${item.draftRevision} 版` : '尚未版本化', published: true };
  }
  if (item.lifecycleState === 'published_versioned') return { label: '已發布', meta: `發布第 ${item.publishedVersion} 版`, published: true };
  return { label: '草稿', meta: item.draftRevision ? `草稿第 ${item.draftRevision} 版` : '尚未發布', published: false };
}

export function ServiceCard({ item }: { item: ServiceListItem }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const lifecycle = getServiceLifecycleCopy(item);
  const price = item.minPrice === null || item.maxPrice === null
    ? formatPrice(item.minPrice)
    : item.minPrice === item.maxPrice
      ? formatPrice(item.minPrice)
      : `${formatPrice(item.minPrice)} – ${new Intl.NumberFormat('zh-TW').format(item.maxPrice)}`;
  const openEditor = async () => {
    setError('');
    if (item.lifecycleState !== 'published_unversioned') {
      router.push(`/midao/services/${item.activityId}/edit`);
      return;
    }
    setPending(true);
    try {
      await ensureNativeServiceDraft(item.activityId);
      router.push(`/midao/services/${item.activityId}/edit`);
    } catch (caught) {
      setError(getErrorDetails(caught).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={styles.cardLink}>
      <button className={styles.card} type="button" onClick={() => void openEditor()} disabled={pending} aria-label={`編輯服務：${item.title || '未命名服務'}`}>
      <div data-testid="service-card">
        <div className={styles.cardTop}>
          <div>
            <div className={styles.statuses}>
              <span className={`${styles.pill} ${lifecycle.published ? styles.pillPublished : ''}`}>
                {lifecycle.label}
              </span>
              {item.hasUnpublishedChanges ? <span className={`${styles.pill} ${styles.pillChanged}`}>有未發布變更</span> : null}
            </div>
            <h3 className={styles.cardTitle}>{item.title || '未命名服務'}</h3>
          </div>
          <span aria-hidden="true">→</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.price}>{price}</span>
          <span>{lifecycle.meta}</span>
        </div>
        <span className={styles.cardAction}>開啟編輯器 →</span>
      </div>
      </button>
      {error ? <p className={styles.alert} role="alert">{error}</p> : null}
    </div>
  );
}
