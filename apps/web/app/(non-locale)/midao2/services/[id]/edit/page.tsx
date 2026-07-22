'use client';

// midao2 編輯服務：重抓 services 列表過濾出該 activityId → 三步精靈 edit 模式（onSubmit→PATCH）；
// 另加上下架 switch（PATCH midaoStatus）與「發佈到祕島」送審區塊（既有 submit API）。

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { C, Card, Btn, Spinner, ErrorState, apiGet, apiSend } from '../../../ui';
import { csrfHeaders } from '../../../../../../src/lib/csrf-client';
import ServiceForm, { type ServiceValues } from '../../ServiceForm';

type MidaoService = ServiceValues & {
  activityId: string;
  showcasePublished: boolean;
  mainSiteStatus: string;
};

export default function Midao2EditServicePage() {
  const params = useParams();
  const router = useRouter();
  const activityId = (params?.id as string) || '';

  const [service, setService] = useState<MidaoService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    apiGet('/api/v2/guide/midao/services')
      .then((d) => {
        const found = (d?.items || []).find((it: MidaoService) => it.activityId === activityId) || null;
        if (!found) { setError('找不到此服務'); return; }
        setService(found);
      })
      .catch((err) => setError(err?.message || '載入失敗'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId]);

  async function handleSubmit(values: ServiceValues, publish: boolean) {
    setSubmitting(true);
    setFormError(null);
    try {
      const { service: updated } = await apiSend(`/api/v2/guide/midao/services/${activityId}`, 'PATCH', {
        ...values,
        midaoStatus: publish ? 'published' : 'draft',
      });
      setService(updated);
      router.push('/midao2/services');
    } catch (err: any) {
      setFormError(err?.message || '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle() {
    if (!service || toggling) return;
    const next = service.showcasePublished ? 'draft' : 'published';
    setToggling(true);
    setToggleError(null);
    try {
      const { service: updated } = await apiSend(`/api/v2/guide/midao/services/${activityId}`, 'PATCH', { midaoStatus: next });
      setService(updated);
    } catch (err: any) {
      setToggleError(err?.message || '更新失敗');
    } finally {
      setToggling(false);
    }
  }

  async function handleSubmitReview() {
    if (!service || reviewSubmitting) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`/api/guide/activities/${activityId}/submit`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: '{}',
      });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error(json?.error?.message || '送審失敗');
      setReviewSent(true);
    } catch (err: any) {
      setReviewError(err?.message || '送審失敗');
    } finally {
      setReviewSubmitting(false);
    }
  }

  if (loading) return <Spinner />;
  if (error || !service) return <ErrorState text={error || '找不到此服務'} onRetry={load} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>編輯服務</h1>

      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>接案頁上／下架</div>
          <div style={{ fontSize: 12, color: C.MUTED }}>{service.showcasePublished ? '目前已上架，旅客可看到此服務' : '目前為草稿，旅客看不到此服務'}</div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            role="switch"
            checked={service.showcasePublished}
            disabled={toggling}
            onChange={handleToggle}
            data-testid="midao2-edit-toggle"
          />
        </label>
      </Card>
      {toggleError && <div style={{ color: C.RED, fontSize: 13 }}>{toggleError}</div>}

      <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>祕島市集</div>
          <div style={{ fontSize: 12, color: C.MUTED }}>發佈後將送管理員審核，審核通過即上架祕島市集主站。</div>
        </div>
        {service.mainSiteStatus === 'published' ? (
          <span style={{ color: C.GREEN, fontSize: 13, fontWeight: 700 }}>祕島市集已上架</span>
        ) : reviewSent ? (
          <span style={{ color: C.MUTED, fontSize: 13, fontWeight: 700 }}>已送審</span>
        ) : (
          <Btn kind="secondary" onClick={handleSubmitReview} disabled={reviewSubmitting} data-testid="midao2-edit-submit-review">
            🏝 發佈到祕島（送管理員審核）
          </Btn>
        )}
      </Card>
      {reviewError && <div style={{ color: C.RED, fontSize: 13 }}>{reviewError}</div>}

      {formError && <div style={{ color: C.RED, fontSize: 13 }}>{formError}</div>}
      <ServiceForm mode="edit" initial={service} submitting={submitting} onSubmit={handleSubmit} />
    </div>
  );
}
