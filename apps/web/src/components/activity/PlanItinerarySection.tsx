'use client';

// #297 行程頁「詳細行程」區段：依旅客所選方案，呈現該方案後台「方案詳情 → 行程介紹」
// （plan_itinerary）的站點時間表。選方案的狀態由 DatePlanSection 寫入 SelectedPlanContext，
// 這裡是讀取端。
//
// 顯示規則：
//   - 未選方案 → 顯示提示「請選擇上方的方案，以獲取行程詳細資訊」。
//   - 已選方案且有填行程介紹 → 顯示該方案站點時間表，標題後標上「{方案名稱}」。
//   - 已選方案但未填行程介紹 → 退回顯示頁面級「詳細行程」（fallbackItinerary）。
//
// 站點資料相容兩種格式：
//   - 新版站點時間表：{ icon?, title?, duration?, description?, imageUrl? }
//   - 舊版單行格式：  { text, imageUrl? }

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PublicIcon } from '../ui/PublicIcon';
import { useSelectedPlan } from './SelectedPlanContext';

export interface PlanItineraryStep {
  icon?: string;
  title?: string;
  duration?: string;
  description?: string;
  imageUrl?: string;
  /** 舊版單行格式欄位 */
  text?: string;
}

interface PlanLike {
  id: string;
  label?: string;
  planItinerary?: PlanItineraryStep[];
}

interface PlanItinerarySectionProps {
  plans: PlanLike[];
  /** 頁面級「詳細行程」— 所選方案未填行程介紹時的退回來源 */
  fallbackItinerary?: PlanItineraryStep[];
}

function normalizeSteps(steps?: PlanItineraryStep[]): PlanItineraryStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((step) => {
    if (!step || typeof step !== 'object') return false;
    return Boolean(
      (step.title && step.title.trim()) ||
      (step.text && step.text.trim()) ||
      (step.description && step.description.trim()) ||
      (step.imageUrl && step.imageUrl.trim()),
    );
  });
}

function ItineraryTimeline({ steps }: { steps: PlanItineraryStep[] }) {
  const t = useTranslations('planItinerary');
  return (
    <div className="kkd-itinerary">
      {steps.map((step, i) => {
        const heading = (step.title || step.text || '').trim();
        const description = (step.description || '').trim();
        const icon = (step.icon || '').trim();
        return (
          <div key={i} className="kkd-itinerary-step">
            <div className="kkd-itinerary-icon">
              {icon ? <span aria-hidden="true">{icon}</span> : <PublicIcon name="pin" size={18} />}
            </div>
            <div className="kkd-itinerary-content">
              <div className="kkd-itinerary-header">
                {heading && <strong className="kkd-itinerary-title">{heading}</strong>}
                {step.duration && <span className="kkd-itinerary-duration">{step.duration}</span>}
              </div>
              {description && <p className="kkd-itinerary-desc">{description}</p>}
              {step.imageUrl && (
                <Image
                  src={step.imageUrl}
                  alt={heading || t('imageAlt')}
                  loading="lazy"
                  className="kkd-itinerary-img"
                  width={480}
                  height={320}
                />
              )}
            </div>
            {i < steps.length - 1 && <div className="kkd-itinerary-connector" />}
          </div>
        );
      })}
    </div>
  );
}

export function PlanItinerarySection({ plans, fallbackItinerary }: PlanItinerarySectionProps) {
  const t = useTranslations('planItinerary');
  const { selected } = useSelectedPlan();

  const safePlans = Array.isArray(plans) ? plans : [];
  const selectedPlan = safePlans.find((p) => p.id === selected?.id) ?? null;
  const planSteps = normalizeSteps(selectedPlan?.planItinerary);
  const fallbackSteps = normalizeSteps(fallbackItinerary);

  // 標題後方標上所選方案名稱（優先用 context 的 label，相容方案清單與 DatePlanSection 預設）
  const planLabel = (selected?.label || selectedPlan?.label || '').trim();

  let body: React.ReactNode;
  let titleSuffix: string | null = null;

  if (!selected?.id) {
    // 未選方案：有方案可選 → 提示；完全沒有方案 → 退回頁面級行程（無則隱藏整段）
    if (safePlans.length === 0) {
      if (fallbackSteps.length === 0) return null;
      body = <ItineraryTimeline steps={fallbackSteps} />;
    } else {
      body = (
        <p className="kkd-itinerary-empty" style={{ color: 'var(--tp-muted)', fontSize: 14, margin: 0 }} role="status">
          {t('selectPlanPrompt')}
        </p>
      );
    }
  } else {
    // 已選方案：有填行程介紹用方案的；未填則退回頁面級行程
    titleSuffix = planLabel || null;
    const steps = planSteps.length > 0 ? planSteps : fallbackSteps;
    if (steps.length > 0) {
      body = <ItineraryTimeline steps={steps} />;
    } else {
      body = (
        <p className="kkd-itinerary-empty" style={{ color: 'var(--tp-muted)', fontSize: 14, margin: 0 }} role="status">
          {t('planNoItinerary')}
        </p>
      );
    }
  }

  return (
    <section id="section-itinerary" className="kkd-scroll-section">
      <h2 className="kkd-section-title">
        <PublicIcon name="route" size={18} /> {t('title')}
        {titleSuffix && (
          <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 600, color: 'var(--tp-muted)' }}>
            {titleSuffix}
          </span>
        )}
      </h2>
      {body}
    </section>
  );
}
