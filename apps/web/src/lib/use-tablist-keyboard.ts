'use client';

import { useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Wire ArrowRight / ArrowLeft / Home / End keyboard navigation to a
 * `role="tablist"` group, per the WAI-ARIA Authoring Practices for Tabs.
 * Wraps around at both ends; ArrowDown/ArrowUp behave like Right/Left so
 * vertical tablists work too.
 *
 * Caller is responsible for:
 *   - rendering each tab button with role="tab" + aria-selected.
 *   - calling registerTab(i)(el) as the button ref so this hook can focus
 *     the newly-selected tab after navigation.
 *   - passing the same `values` array (and matching `current`) it uses
 *     to render the tabs, so indexOf(current) is meaningful.
 *
 * Click + Enter/Space activation continue to work unchanged — we only
 * preventDefault on the keys we actually handle.
 */
export function useTablistKeyboard<T>(
  values: readonly T[],
  current: T,
  onChange: (next: T) => void,
) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      const idx = values.indexOf(current);
      if (idx < 0) return;

      let nextIdx: number;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIdx = (idx + 1) % values.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIdx = (idx - 1 + values.length) % values.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = values.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      const next = values[nextIdx];
      onChange(next);
      // Defer so the re-render lands before we focus the new tab. rAF is
      // close enough — Tab + Click paths are unaffected because they don't
      // go through this branch.
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => tabRefs.current[nextIdx]?.focus());
      }
    },
    [values, current, onChange],
  );

  // Curried ref setter — call as `ref={registerTab(i)}` on each <button>.
  const registerTab = useCallback(
    (i: number) => (el: HTMLButtonElement | null) => {
      tabRefs.current[i] = el;
    },
    [],
  );

  return { onKeyDown, registerTab };
}
