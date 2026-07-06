'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../../src/lib/supabase/client';
import { track } from '../../../../../src/lib/track';
import {
  ArrowRight, MountainCircleLogo, PersonIcon,
  ClockIcon, TagIcon, RadioIcon, PinIcon, CalPrev, CalNext, PhoneIcon, MailIcon, BackIcon,
} from '../sib-icons';

type ShopPlan = {
  id: string;
  name: string;
  basePrice: number | null;
  priceType: 'per_person' | 'per_group';
  duration: string;
  minParticipants: number;
  maxParticipants: number | null;
};
type ShopActivity = { id: string; slug: string; title: string; region: string; regionSlug: string | null; coverImageUrl: string | null; plans: ShopPlan[] };
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

// ── 月曆日期選擇器（對齊 Midao mockup：日起始、可預約日金點、選中綠圈金環）──
const CAL_WEEK = ['日', '一', '二', '三', '四', '五', '六']; // 週日起始（同 mockup）
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

  const firstDow = new Date(vy, vm, 1).getDay(); // 週日=0
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(firstDow).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(vy, vm, d));

  const prev = () => { if (vm === 0) { setVy(vy - 1); setVm(11); } else { setVm(vm - 1); } };
  const next = () => { if (vm === 11) { setVy(vy + 1); setVm(0); } else { setVm(vm + 1); } };

  return (
    <div className="sib-cal" data-testid="shop-calendar">
      <div className="sib-cal-head">
        <button type="button" aria-label="上個月" className="sib-cal-nav" onClick={prev}><CalPrev size={20} /></button>
        <span className="m">{vy} 年 {CAL_MONTHS[vm]}</span>
        <button type="button" aria-label="下個月" className="sib-cal-nav" onClick={next}><CalNext size={20} /></button>
      </div>
      <div className="sib-cal-wk">{CAL_WEEK.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="sib-cal-grid">
        {cells.map((c, i) => {
          if (!c) return <span key={`e${i}`} />;
          const day = Number(c.slice(-2));
          const isAvail = availableDates.has(c);
          const isSelected = selected === c;
          const cls = ['sib-cal-day', isAvail ? 'avail' : 'dim', isSelected ? 'sel' : ''].filter(Boolean).join(' ');
          void todayKey;
          return (
            <button key={c} type="button" data-testid={isAvail ? 'shop-date' : undefined}
              disabled={!isAvail} className={cls}
              onClick={() => isAvail && onSelect(c)}
              aria-label={`${c}${isAvail ? ' 可預約' : ' 不可預約'}`}>
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
  // 4 步：1 選行程（活動）→ 2 選方案 → 3 選日期+人數 → 4 付款
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

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

  // 深連結預選（同時帶 activity+plan）——直接落到日期步驟
  function selectPlan(activity: ShopActivity, plan: ShopPlan) {
    setSelectedActivityId(activity.id);
    setSelectedPlanId(plan.id);
    setGuests(Math.max(1, plan.minParticipants || 1));
    setSelectedDate('');
    setSelectedSlotStartAt('');
  }
  // 頁1：選行程（活動）→ 頁2 選方案
  function selectActivity(activity: ShopActivity) {
    setSelectedActivityId(activity.id);
    setSelectedPlanId('');
    setSelectedDate('');
    setSelectedSlotStartAt('');
    setStep(2);
  }
  // 頁2：選方案 → 頁3 選日期+人數（人數預設為方案下限）
  function choosePlan(plan: ShopPlan) {
    setSelectedPlanId(plan.id);
    setGuests(Math.max(1, plan.minParticipants || 1));
    setSelectedDate('');
    setSelectedSlotStartAt('');
    setStep(3);
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
            setStep(3);
            return;
          }
        }
      }
    } catch { /* 還原失敗 → 靜默退回從頭選 */ }
    try {
      // 深連結同時帶 activity+plan（已完成選行程＋選方案）→ 直接落到日期步驟。
      const sp = new URLSearchParams(window.location.search);
      const qActivityId = sp.get('activityId');
      const qPlanId = sp.get('planId');
      if (qActivityId && qPlanId) {
        const activity = activities.find((a) => a.id === qActivityId) || null;
        const plan = activity?.plans.find((p) => p.id === qPlanId) || null;
        if (activity && plan) {
          selectPlan(activity, plan);
          setStep(3);
          return;
        }
      }
    } catch { /* 預選失敗不阻擋流程 */ }
    // 其餘一律從頁1「選行程」開始（使用者要求：先選行程，再選方案，最後選人數/日期）。
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
    if (step !== 3 || !selectedActivity || !selectedPlan) return;
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
    if (step !== 3 || slotsLoading || dates.length === 0) return;
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
    if (step === 4 && authState === 'anon') {
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
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立預約失敗');
    } finally {
      setBusy(false);
    }
  }

  // ── 選擇匯款時載入匯款資訊 ───────────────────────────────
  useEffect(() => {
    if (step !== 4 || payMethod !== 'transfer' || !createdBookingId) return;
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

  const STEP_LABELS = ['選擇行程', '選擇方案', '選擇日期', '填寫資料'];
  // 步驟指示器（泛化 N 點：點與點之間以連接線 flex 撐開，可容 4 步）
  const stepIndicator = (
    <div className="sib-ind">
      {STEP_LABELS.map((lbl, i) => (
        <Fragment key={lbl}>
          {i > 0 && <span className={`sib-ind-conn${step >= i + 1 ? ' on' : ''}`} />}
          <div className={`sib-ind-item${step >= i + 1 ? ' on' : ''}`}>
            <span className="sib-ind-dot">{i + 1}</span>
            <span className="sib-ind-lbl">{lbl}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );

  return (
    <main className="sib sib-book">
      <div className="sib-topbar">
        {step === 1 ? (
          <Link href={`/guides/${slug}/shop`} className="sib-back"
            onClick={() => { try { sessionStorage.removeItem(bookStateKey(slug)); } catch { /* noop */ } }}><BackIcon size={13} /> 取消預約</Link>
        ) : (
          <button className="sib-back" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}><BackIcon size={13} /> 上一步</button>
        )}
        <span className="sib-current">目前選擇：{String(shop.guide.displayName || '').replace(/[（(].*?[）)]/g, '').trim()}<PersonIcon size={16} /></span>
      </div>

      {error && (
        <div data-testid="shop-error" style={{ marginTop: 8, background: '#fbeae4', border: '1px solid #e0a58c', color: '#a3401f', borderRadius: 12, padding: '10px 14px', fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Step1：選行程（活動）── 點卡片直接進 step2 選方案 */}
      {step === 1 && (
        <div style={{ marginTop: 6 }}>
          <h1 className="sib-book-h1">選一條想走的徑</h1>
          {stepIndicator}
          {shop.activitiesByRegion.length === 0 && (
            <p style={{ color: 'var(--sib-muted)', marginTop: 16 }}>此導遊目前沒有可預約的行程。</p>
          )}
          {shop.activitiesByRegion.map((group) => (
            <section key={group.region}>
              <p className="sib-region"><PinIcon size={18} /> {group.region}</p>
              {group.activities.map((activity) => {
                const prices = activity.plans.map((p) => p.basePrice ?? 0).filter((n) => n > 0);
                const fromPrice = prices.length ? Math.min(...prices) : 0;
                const active = selectedActivityId === activity.id;
                return (
                  <button key={activity.id} type="button" data-testid="shop-activity-card"
                    onClick={() => selectActivity(activity)}
                    className={`sib-plan-rcard${active ? ' on' : ''}`}>
                    <span className="sib-plan-thumb">
                      {activity.coverImageUrl && (
                        <Image src={activity.coverImageUrl} alt={activity.title} width={118} height={108} />
                      )}
                    </span>
                    <span className="sib-plan-info">
                      <h3>{activity.title}</h3>
                      <span className="sib-plan-line"><TagIcon size={15} />NT${fromPrice.toLocaleString()} 起</span>
                      <span className="sib-plan-tag">{activity.plans.length} 種方案可選</span>
                    </span>
                    <span className="sib-radio-slot"><ArrowRight style={{ width: 20, height: 20, color: 'var(--sib-gold)' }} /></span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {/* ── Step2：選方案（純文字、無照片、無人數）── 點方案直接進 step3 選日期 */}
      {step === 2 && selectedActivity && (
        <div style={{ marginTop: 6 }}>
          <h1 className="sib-book-h1">選擇方案</h1>
          <p className="sib-book-sub">{selectedActivity.title}</p>
          {stepIndicator}
          {selectedActivity.plans.map((plan) => {
            const active = selectedPlanId === plan.id;
            const cap = plan.maxParticipants ? `${plan.minParticipants}–${plan.maxParticipants} 人` : `${plan.minParticipants} 人起`;
            return (
              <button key={plan.id} type="button" data-testid="shop-plan-card"
                onClick={() => choosePlan(plan)}
                className={`sib-plan-opt${active ? ' on' : ''}`}>
                <span className="sib-plan-opt-info">
                  <h3>{plan.name}</h3>
                  {plan.duration && (
                    <span className="sib-plan-line"><ClockIcon size={15} />約 {plan.duration.replace(/^約\s*/, '')}</span>
                  )}
                  <span className="sib-plan-line"><TagIcon size={15} />NT${(plan.basePrice ?? 0).toLocaleString()} / {plan.priceType === 'per_group' ? '組' : '人'}</span>
                  <span className="sib-plan-tag">{cap}</span>
                </span>
                <span className="sib-radio-slot" data-testid="shop-plan-radio"><RadioIcon on={active} size={24} /></span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Step2：選日期與時間 ── */}
      {step === 3 && selectedPlan && (
        <div style={{ marginTop: 6 }}>
          {/* 標題（活動 | 方案）＋ tag；shop-plan-summary 保留（深連結直落此步的確認錨點） */}
          <section data-testid="shop-plan-summary">
            <div className="sib-title-row">
              <h1>{selectedActivity?.title}</h1>
            </div>
            <p className="sib-title-tag">
              #{selectedPlan.name}　·　{guests} 人
              <button type="button" data-testid="shop-change-plan" onClick={() => setStep(2)}
                style={{ marginLeft: 10, border: 'none', background: 'transparent', color: 'var(--sib-gold)', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                更換方案
              </button>
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span className="sib-stepper">
                <button type="button" aria-label="減少人數" disabled={guests <= (selectedPlan.minParticipants || 1)}
                  onClick={() => setGuests((g) => Math.max(selectedPlan.minParticipants || 1, g - 1))}>−</button>
                <span className="val" data-testid="shop-guests-step2">{guests}</span>
                <button type="button" aria-label="增加人數" disabled={selectedPlan.maxParticipants != null && guests >= selectedPlan.maxParticipants}
                  onClick={() => setGuests((g) => (selectedPlan.maxParticipants != null ? Math.min(selectedPlan.maxParticipants, g + 1) : g + 1))}>+</button>
              </span>
              <span style={{ color: 'var(--sib-muted)', fontSize: 12 }}>可調整同行人數</span>
            </div>
          </section>

          {stepIndicator}

          {/* 選擇日期 */}
          <div className="sib-sec-head">
            <MountainCircleLogo style={{ width: 26, height: 26, color: 'var(--sib-gold)' }} />
            <span className="t">選擇日期</span>
            <span className="line" />
          </div>
          {slotsLoading && <p style={{ color: 'var(--sib-muted)' }}>載入可預約日期中…</p>}
          {!slotsLoading && (
            <MonthCalendar
              availableDates={availableDateSet}
              selected={selectedDate}
              onSelect={(d) => { setSelectedDate(d); setSelectedSlotStartAt(''); }}
            />
          )}

          {selectedDate && (
            <>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '18px 0 10px', color: 'var(--sib-ink)' }}>{selectedDate.slice(5).replace('-', '/')} 可預約時間</p>
              <div className="sib-slot-grid">
                {slotsForSelectedDate.map((s) => (
                  <button key={s.startAt} type="button" data-testid="shop-slot"
                    onClick={() => setSelectedSlotStartAt(s.startAt)}
                    className={`sib-slot${selectedSlotStartAt === s.startAt ? ' on' : ''}`}>
                    {fmtSlot(s.startAt)}
                  </button>
                ))}
                {slotsForSelectedDate.length === 0 && <p style={{ color: 'var(--sib-muted)', gridColumn: '1 / -1' }}>此日期沒有可預約時段。</p>}
              </div>
            </>
          )}

          {/* 聯絡資訊 */}
          <div className="sib-sec-head">
            <PersonIcon size={24} />
            <span className="t">聯絡資訊</span>
            <span className="line" />
          </div>
          {authState === 'authed' ? (
            <div>
              <div className="sib-field">
                <PersonIcon size={20} /><span className="lbl">姓名</span>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="請填寫姓名" />
              </div>
              <div className="sib-field">
                <PhoneIcon size={20} /><span className="lbl">電話</span>
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="請填寫電話" inputMode="tel" />
              </div>
              <div className="sib-field">
                <MailIcon size={20} /><span className="lbl">電子信箱</span>
                <input value={contactEmail} readOnly placeholder="電子信箱" />
              </div>
            </div>
          ) : (
            <section data-testid="shop-login-card" className="sib-field" style={{ display: 'block', padding: 16 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--sib-ink)' }}>預約需要會員帳號</p>
              <p style={{ margin: '6px 0 0', color: 'var(--sib-muted)', fontSize: 14, lineHeight: 1.7 }}>
                用 Email 或 LINE 登入後即可完成預約，你選的日期與時段會保留。
              </p>
            </section>
          )}

          {/* 已選時段缺口卡 */}
          {selectedSlotStartAt && (
            <div className="sib-picked">
              <span className="sib-picked-badge"><MountainCircleLogo style={{ width: 26, height: 26 }} /></span>
              <p>已選擇 {selectedDate.replace(/-/g, ' / ')}　·　{fmtSlot(selectedSlotStartAt)} 出發</p>
            </div>
          )}
        </div>
      )}

      {/* ── Step3：付款 ── */}
      {step === 4 && selectedPlan && (
        <div style={{ marginTop: 6 }}>
          <h1 className="sib-book-h1" style={{ fontSize: 26 }}>確認與付款</h1>
          {stepIndicator}
          <div style={{ background: 'var(--sib-card)', border: '1px solid var(--sib-gold-line)', borderRadius: 16, padding: 16, margin: '10px 0 18px' }}>
            <p style={{ margin: 0, fontFamily: 'var(--tp-serif)', fontWeight: 800, fontSize: 16, color: 'var(--sib-ink)' }}>{selectedActivity?.title}　#{selectedPlan.name}</p>
            <p style={{ margin: '6px 0 0', color: 'var(--sib-muted)', fontSize: 14 }}>
              {selectedDate} {selectedSlotStartAt ? fmtSlot(selectedSlotStartAt) : ''}・{guests} 人
            </p>
            <p style={{ margin: '10px 0 0', fontFamily: 'var(--tp-serif)', fontWeight: 800, fontSize: 20, color: 'var(--sib-ink)' }}>總計 NT${total.toLocaleString()}</p>
          </div>

          <div className="sib-sec-head"><span className="t" style={{ fontSize: 18 }}>付款方式</span><span className="line" /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, cursor: 'pointer', borderRadius: 14,
              background: 'var(--sib-card)', border: payMethod === 'ecpay' ? '1.5px solid var(--sib-green)' : '1px solid var(--sib-gold-line)' }}>
              <input type="radio" name="pay" checked={payMethod === 'ecpay'} onChange={() => setPayMethod('ecpay')} />
              💳 信用卡（ECPay 安全付款）
            </label>
            <label data-testid="shop-pay-transfer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, cursor: 'pointer', borderRadius: 14,
              background: 'var(--sib-card)', border: payMethod === 'transfer' ? '1.5px solid var(--sib-green)' : '1px solid var(--sib-gold-line)' }}>
              <input type="radio" name="pay" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} />
              🏦 自行匯款（人工核帳）
            </label>
          </div>

          {payMethod === 'transfer' && (
            <div data-testid="shop-transfer-info" style={{ marginTop: 12, padding: 16, borderRadius: 14, background: 'var(--sib-card)', border: '1px solid var(--sib-gold-line)' }}>
              {transferInfo == null && <p style={{ color: 'var(--sib-muted)', margin: 0 }}>載入匯款資訊中…</p>}
              {transferInfo && !transferInfo.configured && (
                <p style={{ color: '#a3401f', margin: 0 }}>此導遊尚未提供匯款資訊，請改用信用卡付款。</p>
              )}
              {transferInfo?.configured && (
                <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--sib-ink-soft)' }}>
                  <p style={{ margin: 0 }}>銀行：{transferInfo.bankName}</p>
                  <p style={{ margin: 0 }}>戶名：{transferInfo.accountName}</p>
                  <p style={{ margin: 0 }}>帳號：{transferInfo.accountNumber}</p>
                  {transferInfo.transferNote && <p style={{ margin: '6px 0 0', color: 'var(--sib-muted)' }}>{transferInfo.transferNote}</p>}
                  <p style={{ margin: '8px 0 0', color: 'var(--sib-muted)', fontSize: 13 }}>
                    請完成匯款後按下方按鈕送出，我們將人工核對入帳後為您確認預約。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 固定底部 CTA（step1 選行程、step2 選方案皆點卡片直接前進，無底部按鈕）── */}
      {step >= 3 && (
        <div className="sib-cta-bar-fx">
          <div>
            {step === 3 && authState === 'authed' && (
              <button className="sib-cta" disabled={!selectedSlotStartAt || busy || !contactName || !contactPhone} onClick={createDraft}
                style={{ opacity: selectedSlotStartAt && contactName && contactPhone && !busy ? 1 : 0.5, fontSize: 19 }}>
                {busy ? '處理中…' : '確認這個時段'}
                <span className="sib-cta-arrow"><ArrowRight style={{ color: '#f6ecd9' }} /></span>
              </button>
            )}
            {step === 3 && authState !== 'authed' && (
              <button className="sib-cta" data-testid="shop-login-cta"
                disabled={!selectedSlotStartAt || authState === 'checking'} onClick={goLoginPreservingState}
                style={{ opacity: selectedSlotStartAt && authState === 'anon' ? 1 : 0.5, fontSize: 19 }}>
                登入以完成預約
                <span className="sib-cta-arrow"><ArrowRight style={{ color: '#f6ecd9' }} /></span>
              </button>
            )}
            {step === 4 && (
              <button className="sib-cta"
                disabled={busy || (payMethod === 'transfer' && !transferInfo?.configured)} onClick={confirmPayment}
                style={{ opacity: busy || (payMethod === 'transfer' && !transferInfo?.configured) ? 0.5 : 1, fontSize: 19 }}>
                {busy ? '處理中…' : payMethod === 'transfer' ? '我已匯款，送出訂單' : `前往付款 NT$${total.toLocaleString()}`}
                <span className="sib-cta-arrow"><ArrowRight style={{ color: '#f6ecd9' }} /></span>
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
