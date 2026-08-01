import Link from 'next/link';
import styles from './services.module.css';
import type { ServiceListItem } from './service-types';

function formatPrice(value: number | null): string {
  if (value === null) return '尚未設定價格';
  return `NT$ ${new Intl.NumberFormat('zh-TW').format(value)}`;
}

export function ServiceCard({ item }: { item: ServiceListItem }) {
  const price = item.minPrice === null || item.maxPrice === null
    ? formatPrice(item.minPrice)
    : item.minPrice === item.maxPrice
      ? formatPrice(item.minPrice)
      : `${formatPrice(item.minPrice)} – ${new Intl.NumberFormat('zh-TW').format(item.maxPrice)}`;
  return (
    <Link className={styles.cardLink} href={`/midao/services/${item.activityId}/edit`} aria-label={`編輯服務：${item.title || '未命名服務'}`}>
      <article className={styles.card} data-testid="service-card">
        <div className={styles.cardTop}>
          <div>
            <div className={styles.statuses}>
              <span className={`${styles.pill} ${item.status === 'published' ? styles.pillPublished : ''}`}>
                {item.status === 'published' ? '已發布' : '草稿'}
              </span>
              {item.hasUnpublishedChanges ? <span className={`${styles.pill} ${styles.pillChanged}`}>有未發布變更</span> : null}
            </div>
            <h3 className={styles.cardTitle}>{item.title || '未命名服務'}</h3>
          </div>
          <span aria-hidden="true">→</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.price}>{price}</span>
          <span>{item.draftRevision ? `草稿第 ${item.draftRevision} 版` : item.publishedVersion ? `發布第 ${item.publishedVersion} 版` : '尚未發布'}</span>
        </div>
        <span className={styles.cardAction}>開啟編輯器 →</span>
      </article>
    </Link>
  );
}
