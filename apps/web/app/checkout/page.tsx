'use client';

/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createOrder } from '../../src/lib/client-api';
import { createClient } from '../../src/lib/supabase/client';
import { track } from '../../src/lib/track';
import { captureUtm, getStoredUtm } from '../../src/lib/utm';
import { resolveInitialCheckoutSelection } from '../../src/lib/checkout-selection.mjs';

type Schedule = {
  id: string;
  startAt: string;
  endAt: string;
  capacity: number;
  bookedCount: number;
  status: string;
  planId?: string | null;
  plan_id?: string | null;
};

type Plan = {
  id: string;
  label?: string;
  price?: number;
  priceMultiplier?: number;
};

type ActivityInfo = {
  id?: string;
  title: string;
  priceTwd: number;
  schedules: Schedule[];
  plans?: Plan[] | null;
};

export default function CheckoutPage() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get('slug') || 'kaohsiung-chaishan-cave-experience';
  const planId = params.get('plan') || '';
  const urlScheduleId = params.get('scheduleId') || '';
  const urlDate = params.get('date') || '';

  const [activity, setActivity] = useState<ActivityInfo | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<null | { valid: boolean; discountAmount?: number; discountedTotal?: number; reason?: string }>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const bookingV2Href = useMemo(() => {
    const params = new URLSearchParams();
    if (planId) params.set('plan', planId);
    if (urlDate) params.set('date', urlDate);
    if (urlScheduleId) params.set('scheduleId', urlScheduleId);
    const qs = params.toString();
    return `/booking/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`;
  }, [slug, planId, urlDate, urlScheduleId]);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data?.user?.email) setContactEmail(data.user.email);
      setAuthChecked(true);
    });
  }, []);

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
        const schedules: Schedule[] = data.schedules || [];
        const initialSelection = resolveInitialCheckoutSelection({
          schedules,
          urlScheduleId,
          urlDate,
          planId,
        });
        setSelectedScheduleId(initialSelection.selectedScheduleId);
        setErr(initialSelection.validationError);
      })
      .catch(() => setErr('行程資料載入失敗'))
      .finally(() => setFetching(false));
  }, [slug, planId, urlScheduleId, urlDate]);

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
  }, [activity?.id, selectedScheduleId]);

  const applyPromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoValidation(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      // Compute current base price for discount preview
      const plan = planId ? (activity?.plans || []).find((p: Plan) => p.id === planId) : null;
      const basePriceTwd = (plan?.price != null && plan?.priceMultiplier != null)
        ? Math.round(plan.price * plan.priceMultiplier)
        : (activity?.priceTwd ?? 0);
      const originalTotal = basePriceTwd * 1; // peopleCount = 1

      const res = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, originalTotal }),
      });
      const json = await res.json();
      setPromoValidation(json);
    } catch {
      setPromoValidation({ valid: false, reason: 'NETWORK_ERROR' });
    } finally {
      setPromoLoading(false);
    }
  };

  const onSubmit = async () => {
    if (!selectedScheduleId) { setErr('請選擇排期'); return; }
    if (!contactName.trim()) { setErr('請填入聯絡人姓名'); return; }
    if (!contactPhone.trim()) { setErr('請填入聯絡電話'); return; }
    if (!contactEmail.trim() || !contactEmail.includes('@')) { setErr('請填入有效的 Email'); return; }
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
        planId: planId || undefined,
        peopleCount: 1,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        promoCode: promoCode.trim().toUpperCase() || undefined,
      });
      router.push(`/order/pay?orderId=${order.id}&email=${encodeURIComponent(contactEmail.trim())}`);
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

  if (fetching || !authChecked) return <main style={{ padding: 24 }}><p>載入中…</p></main>;

  return (
    <main style={{ padding: 24, maxWidth: 480, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Checkout</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 12 }}>
        行程：{activity?.title || slug}
      </p>

      <section
        data-testid="checkout-legacy-notice"
        style={{ marginBottom: 16, border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}
        aria-label="舊版結帳入口說明"
      >
        <p style={{ margin: '0 0 6px', fontSize: 12, color: '#92400e', fontWeight: 700 }}>
          舊版結帳入口（Legacy fallback）
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f' }}>
          你目前在舊版備援流程。一般旅客請改走新版 /booking 預約路徑；此頁僅保留相容與故障切換用途。
        </p>
        <Link
          href={bookingV2Href}
          style={{ color: '#7c3aed', fontSize: 12, fontWeight: 700, textDecoration: 'underline' }}
        >
          改走新版預約流程（/booking）
        </Link>
      </section>

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

      {/* 聯絡人資料 */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>聯絡人資料</p>
        {[
          { label: '姓名', value: contactName, setter: setContactName, placeholder: '王小明', type: 'text' },
          { label: '電話', value: contactPhone, setter: setContactPhone, placeholder: '0912345678', type: 'tel' },
          { label: 'Email', value: contactEmail, setter: setContactEmail, placeholder: 'email@example.com', type: 'email' },
        ].map(({ label, value, setter, placeholder, type }) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 3 }}>{label}</label>
            <input
              type={type}
              value={value}
              onChange={e => setter(e.target.value)}
              placeholder={placeholder}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        ))}
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>訂單確認 Email 將發送至上述地址</p>
      </div>

      {/* 折扣碼 */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>折扣碼（選填）</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            data-testid="promo-code-input"
            type="text"
            value={promoCode}
            onChange={e => { setPromoCode(e.target.value); setPromoValidation(null); }}
            placeholder="輸入折扣碼"
            style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, boxSizing: 'border-box' }}
          />
          <button
            data-testid="promo-apply-btn"
            onClick={applyPromoCode}
            disabled={promoLoading || !promoCode.trim()}
            style={{
              padding: '8px 16px', background: '#6b7280', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {promoLoading ? '套用中…' : '套用'}
          </button>
        </div>
        {promoValidation?.valid === true && (
          <p style={{ color: '#16a34a', fontSize: 13, marginTop: 6 }}>
            折扣 NT$ {promoValidation.discountAmount?.toLocaleString()} ✓
          </p>
        )}
        {promoValidation?.valid === false && (
          <p style={{ color: 'crimson', fontSize: 13, marginTop: 6 }}>
            折扣碼無效：{promoValidation.reason}
          </p>
        )}
      </div>

      {activity?.priceTwd && (() => {
        const plan = planId ? (activity.plans || []).find((p: Plan) => p.id === planId) : null;
        const basePrice = plan?.price != null && plan?.priceMultiplier != null
          ? Math.round(plan.price * plan.priceMultiplier)
          : activity.priceTwd;
        const discountAmount = promoValidation?.valid ? (promoValidation.discountAmount ?? 0) : 0;
        const displayPrice = basePrice - discountAmount;
        return (
          <div style={{ marginBottom: 20 }}>
            {discountAmount > 0 && (
              <p style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'line-through', marginBottom: 2 }}>
                NT$ {basePrice.toLocaleString()} / 人
              </p>
            )}
            <p style={{ fontSize: 15, fontWeight: 700, color: '#ec4899', marginBottom: 0 }}>
              NT$ {displayPrice.toLocaleString()} / 人
            </p>
          </div>
        );
      })()}

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
