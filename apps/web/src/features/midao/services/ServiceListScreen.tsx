'use client';

import { useCallback, useEffect, useState } from 'react';
import { InlineError } from '../ui/InlineError';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { ServiceCard } from './ServiceCard';
import { fetchServiceList } from './service-api';
import styles from './services.module.css';
import type { ServiceListData } from './service-types';

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已發布' },
] as const;

type Filter = typeof FILTERS[number]['value'];

export function ServiceListScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ServiceListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (nextPage: number, nextFilter: Filter) => {
    setLoading(true);
    setError(false);
    try {
      const result = await fetchServiceList(nextPage, 8, nextFilter);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page, filter); }, [filter, load, page]);

  const chooseFilter = (nextFilter: Filter) => {
    setFilter(nextFilter);
    setPage(1);
  };

  return (
    <section className={styles.screen} aria-labelledby="midao-services-title">
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>讓旅人找到你真正熟悉的路</p>
          <h2 id="midao-services-title" className="midao-heading">我的服務</h2>
          <p className={styles.description}>在這裡整理服務內容、設計旅人會回答的問題，確認後再一鍵發布。</p>
        </div>
        <a className={styles.primaryButton} href="/midao/services/new">＋ 新增服務</a>
      </div>

      <div className={styles.listControls}>
        <div className={styles.filters} role="group" aria-label="服務狀態篩選">
          {FILTERS.map((item) => (
            <button key={item.value} className={styles.filter} type="button" aria-pressed={filter === item.value} onClick={() => chooseFilter(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
        {data ? <span className={styles.count}>共 {data.total} 項服務</span> : null}
      </div>

      {loading && !data ? <LoadingSkeleton label="服務清單載入中" /> : null}
      {error ? <InlineError message="目前無法載入服務清單" onRetry={() => void load(page, filter)} /> : null}
      {!loading && !error && data && data.items.length === 0 ? (
        <div className={styles.empty} data-testid="service-empty">
          <strong>{filter === 'all' ? '還沒有服務' : `目前沒有${filter === 'draft' ? '草稿' : '已發布'}服務`}</strong>
          <span>先建立一項服務，把你的路線與故事交給旅人看見。</span>
        </div>
      ) : null}
      {!error && data && data.items.length > 0 ? (
        <div className={styles.grid} data-testid="service-list">
          {data.items.map((item) => <ServiceCard key={item.activityId} item={item} />)}
        </div>
      ) : null}

      {data && data.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="服務清單分頁">
          <button className={styles.secondaryButton} type="button" aria-label="上一頁" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← 上一頁</button>
          <span className={styles.count}>第 {data.page} / {data.totalPages} 頁</span>
          <button className={styles.secondaryButton} type="button" aria-label="下一頁" disabled={page >= data.totalPages || loading} onClick={() => setPage((current) => current + 1)}>下一頁 →</button>
        </nav>
      ) : null}
    </section>
  );
}
