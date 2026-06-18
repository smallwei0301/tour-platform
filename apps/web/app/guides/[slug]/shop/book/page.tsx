'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../../src/lib/supabase/client';

type ShopPlan = {
  id: string;
  name: string;
  basePrice: number | null;
  priceType: 'per_person' | 'per_group';
  duration: string;
  minParticipants: number;
  maxParticipants: number | null;
};
type ShopActivity = { id: string; slug: string; title: string; region: string; regionSlug: string | null; plans: ShopPlan[] };
type ShopData = {
  guide: { id: string; slug: string; displayName: string; region: string };
  activitiesByRegion: Array<{ region: string; activities: ShopActivity[] }>;
};

type V2Slot = { startAt: string; endAt: string; capacityLeft: number; isAvailable: boolean };
type V2DateAvailability = { date: string; state: 'available' | 'blocked' | 'no_slots'; capacityLeft: number };

const TZ = 'Asia/Taipei';

function priceOf(plan: ShopPlan, guests: number): number {
  const base = plan.basePrice ?? 0;
  return plan.priceType === 'per_group' ? base : base * guests;
}

function fmtSlot(startAt: string): string {
  return new Date(startAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
}

export default function GuideShopBookingPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [authState, setAuthState] = useState<'checking' | 'authed' | 'anon'>('checking');
  const [contactEmail, setContactEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [shop, setShop] = useState<ShopData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // 選擇狀態
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [guests, setGuests] = useState(1);

  // 日期/時間
  const [dates, setDates] = useState<V2DateAvailability[]>([]);
  const [slots, setSlots] = useState<V2Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);

  // 訂單/付款
  const [createdBookingId, setCreatedBookingId] = useState('');
  const [payMethod, setPayMethod] = useState<'ecpay' | 'transfer'>('ecpay');
  const [transferInfo, setTransferInfo] = useState<null | {
    configured: boolean; guideName?: string; bankName?: string; accountName?: string; accountNumber?: string; transferNote?: string | null;
  }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // ── 登入 gate（預約必須先登入）─────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const user = data?.user;
        if (!user) {
          const next = `/guides/${slug}/shop/book`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          setAuthState('anon');
          return;
        }
        setContactEmail(user.email ?? '');
        setAuthState('authed');
        // 預填姓名/電話
        try {
          const r = await fetch('/api/me/profile', { cache: 'no-store' });
          const j = await r.json().catch(() => null);
          const d = j?.data ?? j;
          if (d?.displayName) setContactName(d.displayName);
          if (d?.phone) setContactPhone(d.phone);
        } catch { /* 預填失敗不阻擋流程 */ }
      } catch {
        if (mounted) setAuthState('anon');
      }
    })();
    return () => { mounted = false; };
  }, [slug, router]);

  // ── 載入商店資料 ─────────────────────────────────────────
  useEffect(() => {
    if (authState !== 'authed') return;
    let mounted = true;
    fetch(`/api/guides/${slug}/shop`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j?.ok && j.data) setShop(j.data as ShopData);
        else setLoadError(j?.error?.message || '找不到此導遊商店');
      })
      .catch(() => mounted && setLoadError('載入失敗，請稍後再試'));
    return () => { mounted = false; };
  }, [authState, slug]);

  const allActivities = useMemo(
    () => (shop?.activitiesByRegion || []).flatMap((g) => g.activities),
    [shop]
  );
  const selectedActivity = allActivities.find((a) => a.id === selectedActivityId) || null;
  const selectedPlan = selectedActivity?.plans.find((p) => p.id === selectedPlanId) || null;

  function selectPlan(activity: ShopActivity, plan: ShopPlan) {
    setSelectedActivityId(activity.id);
    setSelectedPlanId(plan.id);
    setGuests(Math.max(1, plan.minParticipants || 1));
    setSelectedDate('');
    setSelectedSlotStartAt('');
  }

  // ── Step2：載入可預約日期/時段 ───────────────────────────
  useEffect(() => {
    if (step !== 2 || !selectedActivity || !selectedPlan) return;
    let mounted = true;
    (async () => {
      try {
        setSlotsLoading(true);
        setError('');
        const today = new Date().toISOString().slice(0, 10);
        // available-slots API 上限為 31 天，取 30 天視窗（原本 60 天會被擋下 →「無可預約日期」）。
        const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const url = `/api/v2/activities/${selectedActivity.id}/available-slots?planId=${encodeURIComponent(selectedPlan.id)}&dateFrom=${today}&dateTo=${end}&timezone=${encodeURIComponent(TZ)}&participants=${guests}`;
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!mounted) return;
        if (!r.ok || !j?.success) {
          setDates([]); setSlots([]);
          setError(j?.error?.messageZh || j?.error?.message || '目前無法載入可預約日期');
          return;
        }
        const da: V2DateAvailability[] = (j.data?.dateAvailability || j.data?.dates || [])
          .slice()
          .sort((a: V2DateAvailability, b: V2DateAvailability) => a.date.localeCompare(b.date));
        setDates(da);
        setSlots((j.data?.slots || []).filter((s: V2Slot) => s.isAvailable));
      } catch {
        if (mounted) { setDates([]); setSlots([]); setError('目前無法載入可預約日期'); }
      } finally {
        if (mounted) setSlotsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [step, selectedActivity, selectedPlan, guests]);

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return slots
      .filter((s) => new Date(s.startAt).toLocaleDateString('sv-SE', { timeZone: TZ }) === selectedDate)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [slots, selectedDate]);

  // ── 建立草稿訂單 ─────────────────────────────────────────
  async function createDraft() {
    if (!selectedActivity || !selectedPlan || !selectedSlotStartAt) return;
    if (!contactName || !contactPhone || !contactEmail) {
      setError('請填寫聯絡姓名與電話');
      return;
    }
    try {
      setBusy(true); setError('');
      const r = await fetch('/api/v2/bookings/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityId: selectedActivity.id,
          planId: selectedPlan.id,
          startAt: selectedSlotStartAt,
          timezone: TZ,
          participants: guests,
          sourceChannel: 'web',
          contactName, contactPhone, contactEmail,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success || !j?.data?.bookingId) {
        throw new Error(j?.error?.messageZh || j?.error?.message || '此時段目前無法預約，請改選其他時間');
      }
      setCreatedBookingId(j.data.bookingId);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立預約失敗');
    } finally {
      setBusy(false);
    }
  }

  // ── 選擇匯款時載入匯款資訊 ───────────────────────────────
  useEffect(() => {
    if (step !== 3 || payMethod !== 'transfer' || !createdBookingId) return;
    let mounted = true;
    (async () => {
      try {
        const r = await fetch(`/api/v2/bookings/${createdBookingId}/transfer-info`, { cache: 'no-store' });
        const j = await r.json();
        if (!mounted) return;
        if (r.ok && j?.success) setTransferInfo(j.data);
        else setTransferInfo({ configured: false });
      } catch {
        if (mounted) setTransferInfo({ configured: false });
      }
    })();
    return () => { mounted = false; };
  }, [step, payMethod, createdBookingId]);

  // ── 確認付款 ─────────────────────────────────────────────
  async function confirmPayment() {
    if (!createdBookingId) return;
    try {
      setBusy(true); setError('');
      const r = await fetch(`/api/v2/bookings/${createdBookingId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: payMethod }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        throw new Error(j?.error?.messageZh || j?.error?.message || '付款失敗，請稍後再試');
      }
      if (payMethod === 'transfer') {
        // 匯款：訂單待人工查帳，導向訂單頁
        router.push(`/guides/${slug}/shop/orders?paid=transfer`);
        return;
      }
      const html = j?.data?.paymentFormHtml;
      if (!html) throw new Error('付款表單不存在');
      const container = document.createElement('div');
      container.style.display = 'none';
      container.innerHTML = html;
      document.body.appendChild(container);
      const form = container.querySelector('form') as HTMLFormElement | null;
      if (!form) throw new Error('付款表單格式錯誤');
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : '付款失敗');
    } finally {
      setBusy(false);
    }
  }

  // ── 畫面 ─────────────────────────────────────────────────
  if (authState !== 'authed') {
    return (
      <main className="tp-light-page tp-container" style={{ padding: '60px 0', textAlign: 'center', maxWidth: 560 }}>
        <p style={{ color: 'var(--tp-muted)' }}>{authState === 'checking' ? '確認登入狀態中…' : '請先登入會員'}</p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="tp-light-page tp-container" style={{ padding: '60px 0', textAlign: 'center', maxWidth: 560 }}>
        <p style={{ color: 'var(--tp-danger)' }}>{loadError}</p>
        <Link className="tp-link" href={`/guides/${slug}/shop`}>返回商店首頁</Link>
      </main>
    );
  }
  if (!shop) {
    return (
      <main className="tp-light-page tp-container" style={{ padding: '60px 0', textAlign: 'center', maxWidth: 560 }}>
        <p style={{ color: 'var(--tp-muted)' }}>載入中…</p>
      </main>
    );
  }

  const total = selectedPlan ? priceOf(selectedPlan, guests) : 0;

  return (
    <main className="tp-light-page tp-container" style={{ paddingBottom: 110, maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
        {step === 1 ? (
          <Link href={`/guides/${slug}/shop`} className="tp-btn tp-btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }}>取消預約</Link>
        ) : (
          <button className="tp-btn tp-btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }} onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>← 上一步</button>
        )}
        <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>目前選擇：{shop.guide.displayName}</span>
      </div>

      {error && (
        <div data-testid="shop-error" style={{ marginTop: 14, background: '#fff4f4', border: '1px solid #f5c2c2', color: '#b42318', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Step1：選方案 ── */}
      {step === 1 && (
        <div style={{ marginTop: 16 }}>
          {shop.activitiesByRegion.length === 0 && (
            <p style={{ color: 'var(--tp-muted)' }}>此導遊目前沒有可預約的行程。</p>
          )}
          {shop.activitiesByRegion.map((group) => (
            <section key={group.region} style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>{group.region}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.activities.flatMap((activity) =>
                  activity.plans.map((plan) => {
                    const active = selectedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        data-testid="shop-plan-card"
                        onClick={() => selectPlan(activity, plan)}
                        className="tp-card"
                        style={{
                          textAlign: 'left', cursor: 'pointer', padding: 16,
                          border: active ? '2px solid var(--tp-primary)' : '1px solid var(--tp-border)',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{activity.title}</p>
                        <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)', fontSize: 14 }}>
                          {plan.duration ? `🕐 ${plan.duration}　` : ''}💲 NT${(plan.basePrice ?? 0).toLocaleString()}
                          {plan.priceType === 'per_group' ? ' / 組' : ' / 人'}
                        </p>
                        <p style={{ margin: '6px 0 0', color: 'var(--tp-primary)', fontSize: 13, fontWeight: 600 }}>#{plan.name}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          ))}

          {/* 人數 */}
          {selectedPlan && (
            <section style={{ marginTop: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>👥 參加人數</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--tp-border)', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" aria-label="減少人數" disabled={guests <= (selectedPlan.minParticipants || 1)}
                  onClick={() => setGuests((g) => Math.max(selectedPlan.minParticipants || 1, g - 1))}
                  style={{ padding: '8px 16px', border: 'none', background: '#f9fafb', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>−</button>
                <span data-testid="shop-guests" style={{ padding: '8px 20px', minWidth: 40, textAlign: 'center' }}>{guests}</span>
                <button type="button" aria-label="增加人數" disabled={selectedPlan.maxParticipants != null && guests >= selectedPlan.maxParticipants}
                  onClick={() => setGuests((g) => (selectedPlan.maxParticipants != null ? Math.min(selectedPlan.maxParticipants, g + 1) : g + 1))}
                  style={{ padding: '8px 16px', border: 'none', background: '#f9fafb', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>+</button>
              </div>
              <p style={{ marginTop: 6, color: 'var(--tp-muted)', fontSize: 13 }}>
                最少 {selectedPlan.minParticipants || 1} 人{selectedPlan.maxParticipants ? `，最多 ${selectedPlan.maxParticipants} 人` : ''}
              </p>
            </section>
          )}
        </div>
      )}

      {/* ── Step2：選日期與時間 ── */}
      {step === 2 && selectedPlan && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>{selectedActivity?.title}</h2>
          <p style={{ color: 'var(--tp-muted)', fontSize: 14, marginTop: 0 }}>#{selectedPlan.name}・{guests} 人</p>

          <p style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>選擇日期</p>
          {slotsLoading && <p style={{ color: 'var(--tp-muted)' }}>載入可預約日期中…</p>}
          {!slotsLoading && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8 }}>
              {dates.filter((d) => d.state === 'available').map((d) => (
                <button key={d.date} type="button" data-testid="shop-date"
                  onClick={() => { setSelectedDate(d.date); setSelectedSlotStartAt(''); }}
                  className="tp-card"
                  style={{ padding: '8px 0', cursor: 'pointer', textAlign: 'center', fontSize: 13,
                    border: selectedDate === d.date ? '2px solid var(--tp-primary)' : '1px solid var(--tp-border)' }}>
                  {d.date.slice(5)}
                </button>
              ))}
              {dates.filter((d) => d.state === 'available').length === 0 && (
                <p style={{ color: 'var(--tp-muted)', gridColumn: '1 / -1' }}>近期沒有可預約日期。</p>
              )}
            </div>
          )}

          {selectedDate && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>{selectedDate} 可預約時間</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                {slotsForSelectedDate.map((s) => (
                  <button key={s.startAt} type="button" data-testid="shop-slot"
                    onClick={() => setSelectedSlotStartAt(s.startAt)}
                    className="tp-card"
                    style={{ padding: '10px 0', cursor: 'pointer', textAlign: 'center', fontWeight: 600,
                      border: selectedSlotStartAt === s.startAt ? '2px solid var(--tp-primary)' : '1px solid var(--tp-border)' }}>
                    {fmtSlot(s.startAt)}
                  </button>
                ))}
                {slotsForSelectedDate.length === 0 && <p style={{ color: 'var(--tp-muted)', gridColumn: '1 / -1' }}>此日期沒有可預約時段。</p>}
              </div>
            </>
          )}

          {/* 聯絡資訊（draft 必填，預填自會員資料）*/}
          <section style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>聯絡資訊</p>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="姓名"
              style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10 }} />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="電話" inputMode="tel"
              style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10 }} />
            <input value={contactEmail} readOnly placeholder="電子信箱"
              style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, background: '#f3f4f6' }} />
          </section>
        </div>
      )}

      {/* ── Step3：付款 ── */}
      {step === 3 && selectedPlan && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>確認與付款</h2>
          <div className="tp-card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{selectedActivity?.title}　#{selectedPlan.name}</p>
            <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)', fontSize: 14 }}>
              {selectedDate} {selectedSlotStartAt ? fmtSlot(selectedSlotStartAt) : ''}・{guests} 人
            </p>
            <p style={{ margin: '8px 0 0', fontWeight: 700, fontSize: 18 }}>總計 NT${total.toLocaleString()}</p>
          </div>

          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>付款方式</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label className="tp-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, cursor: 'pointer',
              border: payMethod === 'ecpay' ? '2px solid var(--tp-primary)' : '1px solid var(--tp-border)' }}>
              <input type="radio" name="pay" checked={payMethod === 'ecpay'} onChange={() => setPayMethod('ecpay')} />
              💳 信用卡（ECPay 安全付款）
            </label>
            <label className="tp-card" data-testid="shop-pay-transfer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, cursor: 'pointer',
              border: payMethod === 'transfer' ? '2px solid var(--tp-primary)' : '1px solid var(--tp-border)' }}>
              <input type="radio" name="pay" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} />
              🏦 自行匯款（人工核帳）
            </label>
          </div>

          {payMethod === 'transfer' && (
            <div data-testid="shop-transfer-info" className="tp-card" style={{ marginTop: 12, padding: 16, background: 'var(--tp-bg-soft, #f9fafb)' }}>
              {transferInfo == null && <p style={{ color: 'var(--tp-muted)', margin: 0 }}>載入匯款資訊中…</p>}
              {transferInfo && !transferInfo.configured && (
                <p style={{ color: 'var(--tp-danger)', margin: 0 }}>此導遊尚未提供匯款資訊，請改用信用卡付款。</p>
              )}
              {transferInfo?.configured && (
                <div style={{ fontSize: 14, lineHeight: 1.9 }}>
                  <p style={{ margin: 0 }}>銀行：{transferInfo.bankName}</p>
                  <p style={{ margin: 0 }}>戶名：{transferInfo.accountName}</p>
                  <p style={{ margin: 0 }}>帳號：{transferInfo.accountNumber}</p>
                  {transferInfo.transferNote && <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)' }}>{transferInfo.transferNote}</p>}
                  <p style={{ margin: '8px 0 0', color: 'var(--tp-muted)', fontSize: 13 }}>
                    請完成匯款後按下方按鈕送出，我們將人工核對入帳後為您確認預約。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 固定底部 CTA ── */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 16px', background: 'var(--tp-card-bg, #fff)', borderTop: '1px solid var(--tp-border)', zIndex: 20 }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {step === 1 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--tp-muted)' }}>
                {selectedPlan ? `已選擇 1 項 / ${selectedPlan.duration || '—'} / NT$${total.toLocaleString()}` : '請選擇一個方案'}
              </p>
              <button className="tp-btn tp-btn-primary" disabled={!selectedPlan} onClick={() => { setStep(2); }}
                style={{ width: '100%', padding: '14px 0', fontSize: 16, opacity: selectedPlan ? 1 : 0.5 }}>
                選擇日期和時間 →
              </button>
            </>
          )}
          {step === 2 && (
            <button className="tp-btn tp-btn-primary" disabled={!selectedSlotStartAt || busy || !contactName || !contactPhone} onClick={createDraft}
              style={{ width: '100%', padding: '14px 0', fontSize: 16, opacity: selectedSlotStartAt && contactName && contactPhone && !busy ? 1 : 0.5 }}>
              {busy ? '處理中…' : '完成預約 →'}
            </button>
          )}
          {step === 3 && (
            <button className="tp-btn tp-btn-primary"
              disabled={busy || (payMethod === 'transfer' && !transferInfo?.configured)}
              onClick={confirmPayment}
              style={{ width: '100%', padding: '14px 0', fontSize: 16, opacity: busy || (payMethod === 'transfer' && !transferInfo?.configured) ? 0.5 : 1 }}>
              {busy ? '處理中…' : payMethod === 'transfer' ? '我已匯款，送出訂單' : `前往付款 NT$${total.toLocaleString()}`}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
