'use client';

// Lightweight client context shared between DatePlanSection (writer) and
// ActivityBottomBar (reader) on the activity detail page. Server-rendered
// children pass through untouched — the provider only owns the state.
//
// #919: prevents the bottom CTA from navigating to a booking page that can't
// resolve a plan (multiple active plans -> empty plan param -> error). When the
// traveler selects a plan, the bar reflects it and the CTA carries it through.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface SelectedPlanSnapshot {
  id: string;
  label: string;
  price: number;
  priceType: 'per_person' | 'per_group';
  date?: string;
  scheduleId?: string;
}

interface SelectedPlanContextValue {
  selected: SelectedPlanSnapshot | null;
  setSelected: (next: SelectedPlanSnapshot | null) => void;
}

const SelectedPlanContext = createContext<SelectedPlanContextValue | null>(null);

export function SelectedPlanProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelectedState] = useState<SelectedPlanSnapshot | null>(null);
  const setSelected = useCallback((next: SelectedPlanSnapshot | null) => {
    setSelectedState(next);
  }, []);
  const value = useMemo(() => ({ selected, setSelected }), [selected, setSelected]);
  return <SelectedPlanContext.Provider value={value}>{children}</SelectedPlanContext.Provider>;
}

// Safe to call outside a provider — returns a no-op pair so components don't
// crash if rendered without the wrapper (e.g. in isolation or older surfaces).
export function useSelectedPlan(): SelectedPlanContextValue {
  const ctx = useContext(SelectedPlanContext);
  if (ctx) return ctx;
  return { selected: null, setSelected: () => {} };
}
