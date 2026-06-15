'use client';

// #297 行程頁「詳細行程」區段：依旅客所選方案，呈現該方案後台「方案詳情 → 行程介紹」
// （plan_itinerary）的站點時間表。選方案的狀態由 DatePlanSection 寫入 SelectedPlanContext，
// 這裡是讀取端；未選方案時預設顯示第一個方案的行程介紹。
//
// 站點資料相容兩種格式：
//   - 新版站點時間表：{ icon?, title?, duration?, description?, imageUrl? }
//   - 舊版單行格式：  { text, imageUrl? }

import Image from 'next/image';
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
}

export function PlanItinerarySection({ plans }: PlanItinerarySectionProps) {
  const { selected } = useSelectedPlan();

  const safePlans = Array.isArray(plans) ? plans : [];
  // 依所選方案取行程介紹；未選時退回第一個方案。
  const activePlan =
    safePlans.find((p) => p.id === selected?.id) ?? safePlans[0] ?? null;
  const steps = Array.isArray(activePlan?.planItinerary) ? activePlan!.planItinerary : [];

  // 所選方案沒有行程介紹資料時，整個區段不顯示（避免空標題）。
  if (!activePlan || steps.length === 0) return null;

  return (
    <section id="section-itinerary" className="kkd-scroll-section">
      <h2 className="kkd-section-title"><PublicIcon name="route" size={18} /> 詳細行程</h2>
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
                    alt={heading || '行程站點圖片'}
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
    </section>
  );
}
