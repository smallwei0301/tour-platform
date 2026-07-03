'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '../../../../../src/lib/supabase/client';
import styles from '../shop-booking.module.css';

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
const BOOKING_STEPS = [
  { id: 1, label: '選路線' },
  { id: 2, label: '留時段' },
  { id: 3, label: '付款' },
] as const;

const STEP_COPY = {
  1: {
    eyebrow: 'Route',
    title: '先選一條想走的徑',
    intro: '每個方案都由引路人自己開出。先確認路線、人數與預估費用，再進下一步。',
  },
  2: {
    eyebrow: 'Date',
    title: '替這趟旅程留時間',
    intro: '月曆只亮出可預約日。選好日期後，再留下導遊出發前需要聯絡你的資訊。',
  },
  3: {
    eyebrow: 'Payment',
    title: '確認與付款',
    intro: '最後核對路線、日期與金額。付款完成後，你可以在會員專區追蹤訂單。',
  },
} as const;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function priceOf(plan: ShopPlan, guests: number): number {
  const base = plan.basePrice ?? 0;
  return plan.priceType === 'per_group' ? base : base * guests;
}

function fmtSlot(startAt: string): string {
  return new Date(startAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', timeZone: TZ, hour12: false });
}

function fmtPrice(amount: number | null): string {
  return `NT$${(amount ?? 0).toLocaleString()}`;
}

// ── 月曆日期選擇器（對齊 Midao 古紙／山墨視覺語言）──
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
    <div className={styles.calendar} data-testid="shop-calendar">
      <div className={styles.calendarHead}>
        <button type="button" aria-label="上個月" onClick={prev} className={styles.calendarNav}>‹</button>
        <span className={styles.calendarTitle}>{vy} 年 {CAL_MONTHS[vm]}</span>
        <button type="button" aria-label="下個月" onClick={next} className={styles.calendarNav}>›</button>
        <button type="button" onClick={goToday} className={styles.todayButton}>今天</button>
      </div>
      <div className={styles.calendarWeek}>
        {CAL_WEEK.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((c, i) => {
          if (!c) return <span key={`e${i}`} />;
          const day = Number(c.slice(-2));
          const isAvail = availableDates.has(c);
          const isSelected = selected === c;
          const isToday = c === todayKey;
          return (
            <button
              key={c}
              type="button"
              data-testid={isAvail ? 'shop-date' : undefined}
              disabled={!isAvail}
              onClick={() => isAvail && onSelect(c)}
              aria-label={`${c}${isAvail ? ' 可預約' : ' 不可預約'}`}
              className={cx(
                styles.calendarDay,
                isAvail && styles.calendarDayAvailable,
                isToday && styles.calendarDayToday,
                isSelected && styles.calendarDaySelected
              )}
            >
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

  const availableDateSet = useMemo(
    () => new Set(dates.filter((d) => d.state === 'available').map((d) => d.date)),
    [dates]
  );

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

  // ── 畫面 ─────────────────────────────────────────────────
  if (authState !== 'authed') {
    return (
      <main className={`tp-light-page tp-container ${styles.shell}`}>
        <div className={styles.statePanel}>
          <p className={styles.loadingText}>{authState === 'checking' ? '正在確認會員狀態…' : '請先登入會員'}</p>
        </div>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className={`tp-light-page tp-container ${styles.shell}`}>
        <div className={styles.statePanel}>
          <p className={styles.errorBanner}>{loadError}</p>
          <Link className="tp-link" href={`/guides/${slug}/shop`}>返回商店首頁</Link>
        </div>
      </main>
    );
  }
  if (!shop) {
    return (
      <main className={`tp-light-page tp-container ${styles.shell}`}>
        <div className={styles.statePanel}>
          <p className={styles.loadingText}>正在打開祕境...</p>
        </div>
      </main>
    );
  }

  const total = selectedPlan ? priceOf(selectedPlan, guests) : 0;
  const stepCopy = STEP_COPY[step];
  const stepOneDisabled = !selectedPlan;
  const stepTwoDisabled = !selectedSlotStartAt || busy || !contactName || !contactPhone;
  const stepThreeDisabled = busy || (payMethod === 'transfer' && !transferInfo?.configured);

  return (
    <main className={`tp-light-page tp-container ${styles.shell}`}>
      <div className={styles.backRow}>
        {step === 1 ? (
          <Link href={`/guides/${slug}/shop`} className={styles.subtleButton}>取消預約</Link>
        ) : (
          <button type="button" className={styles.subtleButton} onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>← 上一步</button>
        )}
        <span className={styles.currentGuide}>引路人 · {shop.guide.displayName}</span>
      </div>

      <section className={styles.fieldHeader}>
        <p className={styles.eyebrow}>{stepCopy.eyebrow}</p>
        <h1 className={styles.pageTitle}>{stepCopy.title}</h1>
        <p className={styles.pageIntro}>{stepCopy.intro}</p>
        <ol className={styles.stepper} aria-label="預約進度">
          {BOOKING_STEPS.map((item) => (
            <li
              key={item.id}
              className={cx(
                styles.stepPill,
                step === item.id && styles.stepPillCurrent,
                step > item.id && styles.stepPillDone
              )}
            >
              <span>{item.id}</span>
              {item.label}
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <div data-testid="shop-error" className={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* ── Step1：選方案 ── */}
      {step === 1 && (
        <div className={styles.bookContent}>
          {shop.activitiesByRegion.length === 0 && (
            <p className={styles.emptyText}>此導遊目前沒有可預約的行程。</p>
          )}
          {shop.activitiesByRegion.map((group) => (
            <section key={group.region} className={styles.regionSection}>
              <h2 className={styles.regionTitle}>{group.region}</h2>
              <div className={styles.optionStack}>
                {group.activities.flatMap((activity) =>
                  activity.plans.map((plan) => {
                    const active = selectedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        data-testid="shop-plan-card"
                        onClick={() => selectPlan(activity, plan)}
                        className={cx(styles.optionCard, active && styles.optionCardActive)}
                      >
                        <span className={styles.optionHead}>
                          <span className={styles.optionKicker}>{activity.region || group.region}</span>
                          <span className={styles.optionMarker}>{active ? '已選' : '選這條'}</span>
                        </span>
                        <span className={styles.optionTitle}>{activity.title}</span>
                        <span className={styles.optionMeta}>
                          {plan.duration && <span>{plan.duration}</span>}
                          <span>{fmtPrice(plan.basePrice)}{plan.priceType === 'per_group' ? ' / 組' : ' / 人'}</span>
                        </span>
                        <span className={styles.optionTag}>#{plan.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          ))}

          {/* 人數 */}
          {selectedPlan && (
            <section className={styles.counterCard}>
              <div className={styles.counterRow}>
                <div>
                  <p className={styles.sectionLabel}>同行人數</p>
                  <p className={styles.counterHint}>
                    最少 {selectedPlan.minParticipants || 1} 人{selectedPlan.maxParticipants ? `，最多 ${selectedPlan.maxParticipants} 人` : ''}
                  </p>
                </div>
                <div className={styles.counter}>
                  <button
                    type="button"
                    aria-label="減少人數"
                    disabled={guests <= (selectedPlan.minParticipants || 1)}
                    onClick={() => setGuests((g) => Math.max(selectedPlan.minParticipants || 1, g - 1))}
                    className={styles.counterButton}
                  >
                    −
                  </button>
                  <span data-testid="shop-guests" className={styles.counterValue}>{guests}</span>
                  <button
                    type="button"
                    aria-label="增加人數"
                    disabled={selectedPlan.maxParticipants != null && guests >= selectedPlan.maxParticipants}
                    onClick={() => setGuests((g) => (selectedPlan.maxParticipants != null ? Math.min(selectedPlan.maxParticipants, g + 1) : g + 1))}
                    className={styles.counterButton}
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Step2：選日期與時間 ── */}
      {step === 2 && selectedPlan && (
        <div className={styles.bookContent}>
          <div className={styles.selectedRoute}>
            <h2>{selectedActivity?.title}</h2>
            <p>#{selectedPlan.name}・{guests} 人</p>
          </div>

          <section className={styles.regionSection}>
            <h3 className={styles.sectionLabel}>選擇日期</h3>
            {slotsLoading && <p className={styles.loadingText}>正在載入可預約日期…</p>}
            {!slotsLoading && (
              <MonthCalendar
                availableDates={availableDateSet}
                selected={selectedDate}
                onSelect={(d) => { setSelectedDate(d); setSelectedSlotStartAt(''); }}
              />
            )}
          </section>

          {selectedDate && (
            <section className={styles.regionSection}>
              <h3 className={styles.sectionLabel}>{selectedDate.slice(5).replace('-', '/')} 可預約時間</h3>
              <div className={styles.slotGrid}>
                {slotsForSelectedDate.map((s) => (
                  <button
                    key={s.startAt}
                    type="button"
                    data-testid="shop-slot"
                    onClick={() => setSelectedSlotStartAt(s.startAt)}
                    className={cx(styles.slotButton, selectedSlotStartAt === s.startAt && styles.slotButtonSelected)}
                  >
                    {fmtSlot(s.startAt)}
                  </button>
                ))}
                {slotsForSelectedDate.length === 0 && <p className={styles.emptyText}>此日期沒有可預約時段。</p>}
              </div>
            </section>
          )}

          {/* 聯絡資訊（draft 必填，預填自會員資料）*/}
          <section className={styles.formCard}>
            <h3 className={styles.sectionLabel}>聯絡資訊</h3>
            <div className={styles.fieldStack}>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="姓名"
                aria-label="姓名"
                className={styles.input}
              />
              <input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="電話"
                aria-label="電話"
                inputMode="tel"
                className={styles.input}
              />
              <input
                value={contactEmail}
                readOnly
                placeholder="電子信箱"
                aria-label="電子信箱"
                className={styles.input}
              />
            </div>
          </section>
        </div>
      )}

      {/* ── Step3：付款 ── */}
      {step === 3 && selectedPlan && (
        <div className={styles.bookContent}>
          <div className={styles.paymentSummary}>
            <p className={styles.paymentTitle}>{selectedActivity?.title}　#{selectedPlan.name}</p>
            <p className={styles.paymentMeta}>
              {selectedDate} {selectedSlotStartAt ? fmtSlot(selectedSlotStartAt) : ''}・{guests} 人
            </p>
            <p className={styles.totalText}>總計 NT${total.toLocaleString()}</p>
          </div>

          <section className={styles.regionSection}>
            <h2 className={styles.sectionLabel}>付款方式</h2>
            <div className={styles.paymentStack}>
              <label className={cx(styles.paymentOption, payMethod === 'ecpay' && styles.paymentOptionActive)}>
                <input type="radio" name="pay" checked={payMethod === 'ecpay'} onChange={() => setPayMethod('ecpay')} />
                <span className={styles.paymentText}>
                  <strong>信用卡</strong>
                  <span>ECPay 安全付款，付款完成後自動確認。</span>
                </span>
              </label>
              <label className={cx(styles.paymentOption, payMethod === 'transfer' && styles.paymentOptionActive)} data-testid="shop-pay-transfer">
                <input type="radio" name="pay" checked={payMethod === 'transfer'} onChange={() => setPayMethod('transfer')} />
                <span className={styles.paymentText}>
                  <strong>自行匯款</strong>
                  <span>送出後由導遊人工核帳。</span>
                </span>
              </label>
            </div>

            {payMethod === 'transfer' && (
              <div data-testid="shop-transfer-info" className={styles.transferCard}>
                {transferInfo == null && <p className={styles.loadingText}>載入匯款資訊中…</p>}
                {transferInfo && !transferInfo.configured && (
                  <p className={styles.errorBanner}>此導遊尚未提供匯款資訊，請改用信用卡付款。</p>
                )}
                {transferInfo?.configured && (
                  <div className={styles.paymentMeta}>
                    <p>銀行：{transferInfo.bankName}</p>
                    <p>戶名：{transferInfo.accountName}</p>
                    <p>帳號：{transferInfo.accountNumber}</p>
                    {transferInfo.transferNote && <p>{transferInfo.transferNote}</p>}
                    <p>請完成匯款後按下方按鈕送出，我們將人工核對入帳後為您確認預約。</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── 固定底部 CTA ── */}
      <div className={styles.stickyCta}>
        <div className={styles.stickyInner}>
          {step === 1 && (
            <>
              <p className={styles.stickySummary}>
                {selectedPlan ? `已選擇 1 項 / ${selectedPlan.duration || '時間待確認'} / NT$${total.toLocaleString()}` : '請先選一條路線。'}
              </p>
              <button
                className={`tp-btn tp-btn-primary ${styles.primaryCta}`}
                disabled={stepOneDisabled}
                onClick={() => { setStep(2); }}
              >
                選擇日期和時間 →
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <p className={styles.stickySummary}>
                {selectedSlotStartAt ? `${selectedDate} ${fmtSlot(selectedSlotStartAt)} / ${guests} 人 / NT$${total.toLocaleString()}` : '選好日期後，再挑一個可預約時段。'}
              </p>
              <button
                className={`tp-btn tp-btn-primary ${styles.primaryCta}`}
                disabled={stepTwoDisabled}
                onClick={createDraft}
              >
                {busy ? '處理中…' : '確認這個時段 →'}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <p className={styles.stickySummary}>總計 NT${total.toLocaleString()}</p>
              <button
                className={`tp-btn tp-btn-primary ${styles.primaryCta}`}
                disabled={stepThreeDisabled}
                onClick={confirmPayment}
              >
                {busy ? '處理中…' : payMethod === 'transfer' ? '我已匯款，送出訂單' : `前往付款 NT$${total.toLocaleString()}`}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
