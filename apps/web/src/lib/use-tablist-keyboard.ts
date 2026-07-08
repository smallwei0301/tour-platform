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
      // 基準索引優先取「收到按鍵的那顆 tab」的註冊索引：對 onChange 觸發 URL 導航
      // 的 tablist（如 /admin/qa），`current` 要等 RSC 往返才會 commit——連續方向鍵
      // 期間讀到舊值會算錯目標（#1649 QA 實測：ArrowRight→ArrowLeft 跳到最後一顆）。
      // 事件目標永遠是「現在聚焦的 tab」，不受非同步 state 影響；找不到時退回 current。
      const targetIdx = tabRefs.current.indexOf(e.currentTarget);
      const idx = targetIdx >= 0 ? targetIdx : values.indexOf(current);
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
      // Defer so the re-render lands before we focus the new tab.
      // 單次 rAF 對「onChange 觸發 URL 導航」的 tablist（如 /admin/qa 的
      // router.replace）不夠：RSC 往返可能讓子樹 remount、按鈕節點被替換，
      // focus 落在已卸載的舊節點上（#1649 QA 實測）。改為有界重試：
      // 直到 focus 成功，或使用者已把 focus 移到其他存活元素，或逾時為止。
      if (typeof window !== 'undefined') {
        const startedAt = Date.now();
        const tryFocus = () => {
          const el = tabRefs.current[nextIdx];
          if (el && el.isConnected) {
            el.focus();
            if (document.activeElement === el) return; // 聚焦完成
          }
          const active = document.activeElement;
          const focusIsLost = !active || active === document.body || !active.isConnected;
          if (focusIsLost && Date.now() - startedAt < 800) {
            window.requestAnimationFrame(tryFocus);
          }
        };
        window.requestAnimationFrame(tryFocus);
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
