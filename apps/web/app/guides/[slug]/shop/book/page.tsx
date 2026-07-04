'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../../src/lib/supabase/client';
import { track } from '../../../../../src/lib/track';

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

// 延後登入：匿名可瀏覽方案／日期，登入前把精靈選擇存進 sessionStorage，
// 登入回跳後還原（OAuth 全頁跳轉會回到同分頁，sessionStorage 存活）。
const BOOK_STATE_TTL_MS = 30 * 60 * 1000;
function bookStateKey(slug: string): string {
  return `tp_shop_book_state:${slug}`;
}

function priceOf(plan: ShopPlan, guests: number): number {
  const base = plan.basePrice ?? 0;
  return plan.priceType === 'per_group' ? base : base * guests;
}

function fmtSlot(startAt: string): string {
  return new Date(startAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
}

// ── 月曆日期選擇器（對齊 PM 參考圖：整月格、可預約日可點、過去/無空檔灰階）──
const CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日']; // 週一起始
const CAL_MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function MonthCalendar({
  availableDates, selected, onSelect,
}: { availableDates: Set<string>; selected: string; onSelect: (d: string) => void }) {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());
  // 最早一個可預約日（用來把預設檢視月份帶到「有空檔的月份」）
  const firstAvail = useMemo(() => {
    let min = '';
    for (const d of availableDates) if (!min || d < min) min = d;
    return min;
  }, [availableDates]);
  const [vy, setVy] = useState(today.getFullYear());
  const [vm, setVm] = useState(today.getMonth());
  useEffect(() => {
    if (firstAvail) {
      setVy(Number(firstAvail.slice(0, 4)));
      setVm(Number(firstAvail.slice(5, 7)) - 1);
    }
  }, [firstAvail]);

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // 週一=0
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(firstDow).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(vy, vm, d));

  const prev = () => { if (vm === 0) { setVy(vy - 1); setVm(11); } else { setVm(vm - 1); } };
  const next = () => { if (vm === 11) { setVy(vy + 1); setVm(0); } else { setVm(vm + 1); } };
  const goToday = () => { setVy(today.getFullYear()); setVm(today.getMonth()); };

  return (
    <div className="tp-card" style={{ padding: 14 }} data-testid="shop-calendar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button type="button" aria-label="上個月" onClick={prev}
          style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--tp-text)', padding: '2px 8px' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{vy} 年 {CAL_MONTHS[vm]}</span>
        <button type="button" aria-label="下個月" onClick={next}
          style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--tp-text)', padding: '2px 8px' }}>›</button>
        <button type="button" onClick={goToday}
          style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--tp-primary)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>今天</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', color: 'var(--tp-muted)', fontSize: 13, marginBottom: 6 }}>
        {CAL_WEEK.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c) return <span key={`e${i}`} />;
          const day = Number(c.slice(-2));
          const isAvail = availableDates.has(c);
          const isSelected = selected === c;
          const isToday = c === todayKey;
          return (
            <button key={c} type="button" data-testid={isAvail ? 'shop-date' : undefined}
              disabled={!isAvail}
              onClick={() => isAvail && onSelect(c)}
              aria-label={`${c}${isAvail ? ' 可預約' : ' 不可預約'}`}
              style={{
                aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', borderRadius: '50%', fontSize: 15,
                cursor: isAvail ? 'pointer' : 'default',
                background: isSelected ? 'var(--tp-primary)' : 'transparent',
                color: isSelected ? '#fff' : isAvail ? 'var(--tp-text)' : '#cbd5e1',
                fontWeight: isAvail ? 600 : 400,
                boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px var(--tp-primary)' : 'none',
              }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
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

  // ── 登入狀態（延後登入：匿名可瀏覽 step 1–2，建立訂單前才要求登入）──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const user = data?.user;
        if (!user) {
          setAuthState('anon');
          return;
        }
        setContactEmail(user.email ?? '');
        setAuthState('authed');
        // 預填姓名/電話（只在已登入時打）
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
  }, [slug]);

  // 進入預約流程事件（涵蓋商店 CTA、方案卡深連結、直連三種入口）
  useEffect(() => {
    const sp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    track({
      event_name: 'shop_begin_booking',
      properties: { guide_slug: slug, plan_preselected: Boolean(sp?.get('planId')) },
    });
  }, [slug]);

  // ── 載入商店資料（公開 API，不需登入）───────────────────────
  useEffect(() => {
    let mounted = true;
    // 不帶 no-store：讓 Vercel CDN 的 s-maxage 邊緣快取生效（商店資料可接受 ~60s 延遲）。
    fetch(`/api/guides/${slug}/shop`)
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j?.ok && j.data) setShop(j.data as ShopData);
        else setLoadError(j?.error?.message || '找不到此導遊商店');
      })
      .catch(() => mounted && setLoadError('載入失敗，請稍後再試'));
    return () => { mounted = false; };
  }, [slug]);

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

  // ── 還原精靈狀態（登入回跳）／深連結預選 ─────────────────────
  // 優先序：sessionStorage 還原 > ?activityId&planId 預選。逐項驗證方案仍存在；
  // 還原的日期/時段由 step2 的 slots 載入後再驗（見下方清理 effect），draft API 為最終防線。
  const [restoreDone, setRestoreDone] = useState(false);
  useEffect(() => {
    if (!shop || restoreDone) return;
    setRestoreDone(true);
    const activities = (shop.activitiesByRegion || []).flatMap((g) => g.activities);
    try {
      const raw = sessionStorage.getItem(bookStateKey(slug));
      if (raw) {
        sessionStorage.removeItem(bookStateKey(slug)); // 一次性：還原即消費
        const saved = JSON.parse(raw) as {
          activityId?: string; planId?: string; guests?: number;
          date?: string; slotStartAt?: string; savedAt?: number;
        } | null;
        if (saved?.savedAt && Date.now() - saved.savedAt <= BOOK_STATE_TTL_MS) {
          const activity = activities.find((a) => a.id === saved.activityId) || null;
          const plan = activity?.plans.find((p) => p.id === saved.planId) || null;
          if (activity && plan) {
            setSelectedActivityId(activity.id);
            setSelectedPlanId(plan.id);
            const min = Math.max(1, plan.minParticipants || 1);
            const max = plan.maxParticipants ?? Infinity;
            setGuests(Math.min(Math.max(min, Number(saved.guests) || min), max));
            if (saved.date) setSelectedDate(saved.date);
            if (saved.slotStartAt) setSelectedSlotStartAt(saved.slotStartAt);
            setStep(2);
            return;
          }
        }
      }
    } catch { /* 還原失敗 → 靜默退回從頭選 */ }
    try {
      // 商店首頁的方案卡已完成「選方案」，深連結進來直接落在日期/時段
      //（step 2 摘要卡可改人數、可更換方案），不再重列一次方案。
      const sp = new URLSearchParams(window.location.search);
      const qActivityId = sp.get('activityId');
      const qPlanId = sp.get('planId');
      if (qActivityId && qPlanId) {
        const activity = activities.find((a) => a.id === qActivityId) || null;
        const plan = activity?.plans.find((p) => p.id === qPlanId) || null;
        if (activity && plan) {
          selectPlan(activity, plan);
          setStep(2);
          return;
        }
      }
    } catch { /* 預選失敗不阻擋流程 */ }
    // 全店只有一個方案：沒什麼好選，直接進日期/時段（小商店最常見情境）。
    const onlyPlans = activities.flatMap((a) => a.plans.map((p) => ({ activity: a, plan: p })));
    if (onlyPlans.length === 1) {
      selectPlan(onlyPlans[0].activity, onlyPlans[0].plan);
      setStep(2);
    }
  }, [shop, restoreDone, slug]);

  // 存下目前選擇並前往登入（登入回跳後由上方還原 effect 接手）
  function goLoginPreservingState() {
    try {
      sessionStorage.setItem(bookStateKey(slug), JSON.stringify({
        activityId: selectedActivityId, planId: selectedPlanId, guests,
        date: selectedDate, slotStartAt: selectedSlotStartAt, savedAt: Date.now(),
      }));
    } catch { /* 存不進去就退回重選，不阻擋登入 */ }
    router.push(`/login?next=${encodeURIComponent(`/guides/${slug}/shop/book`)}`);
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

  const availableDateSet = useMemo(
    () => new Set(dates.filter((d) => d.state === 'available').map((d) => d.date)),
    [dates]
  );

  // 還原的日期/時段驗證：slots 載入後，選中的日期已不可約或時段被訂走 → 清掉讓使用者重選。
  useEffect(() => {
    if (step !== 2 || slotsLoading || dates.length === 0) return;
    if (selectedDate && !availableDateSet.has(selectedDate)) {
      setSelectedDate('');
      setSelectedSlotStartAt('');
      return;
    }
    if (selectedSlotStartAt && !slots.some((s) => s.startAt === selectedSlotStartAt)) {
      setSelectedSlotStartAt('');
    }
  }, [step, slotsLoading, dates, slots, selectedDate, selectedSlotStartAt, availableDateSet]);

  // 防衛：匿名者理論上到不了 step 3（draft 前已 gate），若真的到了就走同一登入流程。
  useEffect(() => {
    if (step === 3 && authState === 'anon') {
      goLoginPreservingState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, authState]);

  // 切換步驟時回到頁面最上方（避免停在上一步底部 CTA 的位置）。
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step]);

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

  // ── 畫面（匿名與登入者都渲染精靈；登入要求延後到完成預約前）──
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
          <Link href={`/guides/${slug}/shop`} className="tp-btn tp-btn-ghost" style={{ fontSize: 14, padding: '6px 12px' }}
            onClick={() => { try { sessionStorage.removeItem(bookStateKey(slug)); } catch { /* noop */ } }}>取消預約</Link>
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
          {/* 方案摘要卡：深連結直落 step 2 時，這裡就是「已選方案」的確認點——
              可直接改人數（自動重抓時段）或更換方案，不用倒回方案列表重選。 */}
          <section data-testid="shop-plan-summary" className="tp-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 17, margin: 0 }}>{selectedActivity?.title}</h2>
                <p style={{ color: 'var(--tp-muted)', fontSize: 14, margin: '4px 0 0' }}>
                  #{selectedPlan.name}
                  {selectedPlan.duration ? `・${selectedPlan.duration}` : ''}
                  ・NT${(selectedPlan.basePrice ?? 0).toLocaleString()}{selectedPlan.priceType === 'per_group' ? ' / 組' : ' / 人'}
                </p>
              </div>
              <button type="button" data-testid="shop-change-plan" onClick={() => setStep(1)}
                style={{ border: '1px solid var(--tp-border)', background: 'transparent', borderRadius: 999,
                  padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--tp-primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                更換方案
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>👥 人數</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--tp-border)', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" aria-label="減少人數" disabled={guests <= (selectedPlan.minParticipants || 1)}
                  onClick={() => setGuests((g) => Math.max(selectedPlan.minParticipants || 1, g - 1))}
                  style={{ padding: '6px 14px', border: 'none', background: '#f9fafb', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>−</button>
                <span data-testid="shop-guests-step2" style={{ padding: '6px 16px', minWidth: 36, textAlign: 'center' }}>{guests}</span>
                <button type="button" aria-label="增加人數" disabled={selectedPlan.maxParticipants != null && guests >= selectedPlan.maxParticipants}
                  onClick={() => setGuests((g) => (selectedPlan.maxParticipants != null ? Math.min(selectedPlan.maxParticipants, g + 1) : g + 1))}
                  style={{ padding: '6px 14px', border: 'none', background: '#f9fafb', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>+</button>
              </div>
              <span style={{ color: 'var(--tp-muted)', fontSize: 12 }}>
                {selectedPlan.minParticipants || 1} 人起{selectedPlan.maxParticipants ? `，至多 ${selectedPlan.maxParticipants} 人` : ''}
              </span>
            </div>
          </section>

          <p style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>選擇日期</p>
          {slotsLoading && <p style={{ color: 'var(--tp-muted)' }}>載入可預約日期中…</p>}
          {!slotsLoading && (
            <MonthCalendar
              availableDates={availableDateSet}
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setSelectedSlotStartAt(''); }}
            />
          )}

          {selectedDate && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>{selectedDate.slice(5).replace('-', '/')} 可預約時間</p>
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

          {/* 聯絡資訊（draft 必填，預填自會員資料）；匿名者改顯示登入卡 */}
          {authState === 'authed' ? (
            <section style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>聯絡資訊</p>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="姓名"
                style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10 }} />
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="電話" inputMode="tel"
                style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10 }} />
              <input value={contactEmail} readOnly placeholder="電子信箱"
                style={{ padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, background: '#f3f4f6' }} />
            </section>
          ) : (
            <section data-testid="shop-login-card" className="tp-card" style={{ marginTop: 20, padding: 16 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>預約需要會員帳號</p>
              <p style={{ margin: '6px 0 0', color: 'var(--tp-muted)', fontSize: 14, lineHeight: 1.7 }}>
                用 Email 或 LINE 登入後即可完成預約，你選的日期與時段會保留。
              </p>
            </section>
          )}
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
          {step === 2 && authState === 'authed' && (
            <button className="tp-btn tp-btn-primary" disabled={!selectedSlotStartAt || busy || !contactName || !contactPhone} onClick={createDraft}
              style={{ width: '100%', padding: '14px 0', fontSize: 16, opacity: selectedSlotStartAt && contactName && contactPhone && !busy ? 1 : 0.5 }}>
              {busy ? '處理中…' : `完成預約 · NT$${total.toLocaleString()} →`}
            </button>
          )}
          {step === 2 && authState !== 'authed' && (
            <button className="tp-btn tp-btn-primary" data-testid="shop-login-cta"
              disabled={!selectedSlotStartAt || authState === 'checking'}
              onClick={goLoginPreservingState}
              style={{ width: '100%', padding: '14px 0', fontSize: 16, opacity: selectedSlotStartAt && authState === 'anon' ? 1 : 0.5 }}>
              登入以完成預約 →
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
