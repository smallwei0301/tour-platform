'use client';

import { useLocale } from 'next-intl';
import { useSelectedPlan } from './SelectedPlanContext';
import { formatPlanConfirmation } from '../../lib/public-policy/copy.mjs';

export function SelectedPlanConfirmation() {
  const locale = useLocale();
  const { selected } = useSelectedPlan();
  const copy = formatPlanConfirmation(locale, selected?.confirmByDays);
  if (copy == null) return null;
  return <span className="kkd-policy-item" data-testid="selected-plan-confirmation">{copy}</span>;
}
