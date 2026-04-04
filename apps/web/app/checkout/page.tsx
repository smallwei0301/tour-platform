'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createOrder } from '../../src/lib/client-api';
import { track } from '../../src/lib/track';
import { captureUtm, getStoredUtm } from '../../src/lib/utm';

type Schedule = {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
};

type ActivityInfo = {
  id?: string;
  title: string;
  priceTwd: number;
  schedules: Schedule[];
};

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get('slug') || 'kaohsiung-chaishan-cave-experience';

  const [activity, setActivity] = useState<ActivityInfo | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 擷取並快取 UTM（首次帶 UTM landing 時保留歸因）
  useEffect(() => {
    captureUtm();
  }, []);

  // 動態取得行程資料與可用排期
  useEffect(() => {
    setFetching(true);
    fetch(`/api/activities/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        const data = j.data;
        if (!data) { setErr('找不到行程'); return; }
        setActivity(data);
        // 自動選第一個 open 的排期
        const openSchedule = (data.schedules || []).find((s: Schedule) => s.status === 'open');
        if (openSchedule) setSelectedScheduleId(openSchedule.id);
      })
      .catch(() => setErr('行程資料載入失敗'))
      .finally(() => setFetching(false));
  }, [slug]);

  // 行程資料載入完成後，發送 begin_checkout 事件
  useEffect(() => {
    if (!activity || !selectedScheduleId) return;
    const utm = getStoredUtm();
    track({
      event_name: 'begin_checkout',
      properties: {
        item_id: activity.id ?? slug,
        item_name: activity.title,
        schedule_id: selectedScheduleId,
        price: activity.priceTwd,
      },
      schedule_id: selectedScheduleId,
      page_path: '/checkout',
      // UTM top-level 欄位（API route 直接存 DB 欄位）
      utm_source:   utm?.utm_source,
      utm_medium:   utm?.utm_medium,
      utm_campaign: utm?.utm_campaign,
      utm_content:  utm?.utm_content,
      utm_term:     utm?.utm_term,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, selectedScheduleId]);

  const onSubmit = async () => {
    if (!selectedScheduleId) { setErr('請選擇排期'); return; }
    setLoading(true);
    setErr(null);

    // 取出已快取的 UTM
    const utm = getStoredUtm();

    // 事件：purchase_intent（使用者按下「建立訂單」）
    track({
      event_name: 'purchase_intent',
      properties: {
        item_id: activity?.id ?? slug,
        item_name: activity?.title,
        schedule_id: selectedScheduleId,
        amount: activity?.priceTwd ?? 0,
      },
      schedule_id: selectedScheduleId,
      page_path: '/checkout',
      // UTM top-level 欄位
      utm_source:   utm?.utm_source,
      utm_medium:   utm?.utm_medium,
      utm_campaign: utm?.utm_campaign,
      utm_content:  utm?.utm_content,
      utm_term:     utm?.utm_term,
    });

    try {
      const order = await createOrder({
        experienceSlug: slug,
        scheduleId: selectedScheduleId,
        peopleCount: 1,
        contactName: 'Guest',
        contactPhone: '0912345678',
        contactEmail: 'guest@example.com'
      });
      router.push(`/order/pay?orderId=${order.id}&email=guest@example.com`);
    } catch (e) {
      // 事件：error
      track({
        event_name: 'error',
        properties: {
          message: e instanceof Error ? e.message : '建立訂單失敗',
          context: 'checkout_submit',
        },
        page_path: `/checkout`,
      });
      setErr(e instanceof Error ? e.message : '建立訂單失敗');
    } finally {
      setLoading(false);
    }
  };

  const openSchedules = (activity?.schedules || []).filter(s => s.status === 'open');

  if (fetching) return <main style={{ padding: 24 }}><p>載入行程資料中…</p></main>;

  return (
    <main style={{ padding: 24, maxWidth: 480, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Checkout</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
        行程：{activity?.title || slug}
      </p>

      {openSchedules.length === 0 && (
        <p style={{ color: '#ef4444', marginBottom: 16 }}>⚠️ 此行程目前沒有可預訂的排期</p>
      )}

      {openSchedules.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            選擇排期
          </label>
          <select
            data-testid="checkout-schedule-select"
            value={selectedScheduleId}
            onChange={e => setSelectedScheduleId(e.target.value)}
            style={{
              width: '100%', border: '1px solid #d1d5db', borderRadius: 8,
              padding: '8px 12px', fontSize: 14, outline: 'none',
            }}
          >
            {openSchedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.startAt ? new Date(s.startAt).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : s.id}
                （剩 {s.capacity - s.bookedCount} 席）
              </option>
            ))}
          </select>
        </div>
      )}

      {activity?.priceTwd && (
        <p style={{ fontSize: 15, fontWeight: 700, color: '#ec4899', marginBottom: 20 }}>
          NT$ {activity.priceTwd.toLocaleString()} / 人
        </p>
      )}

      <button
        data-testid="create-order-btn"
        onClick={onSubmit}
        disabled={loading || !selectedScheduleId || openSchedules.length === 0}
        style={{
          width: '100%', padding: '13px 0',
          background: (!selectedScheduleId || openSchedules.length === 0) ? '#d1d5db' : '#ec4899',
          color: '#fff', border: 'none', borderRadius: 10,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {loading ? '建立中…' : '建立訂單'}
      </button>

      {err && <p style={{ color: 'crimson', marginTop: 12, fontSize: 13 }}>{err}</p>}
    </main>
  );
}
