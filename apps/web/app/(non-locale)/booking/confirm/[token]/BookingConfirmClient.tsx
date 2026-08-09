'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders, ensureCsrfToken } from '../../../../../src/lib/csrf-client';
import {
  BookingConfirmationCard,
  type ConfirmationPreviewView,
} from '../../../../../src/components/booking/BookingConfirmationCard';

/**
 * 旅客確認頁的互動層（#1759 Package 4／Task 43b）。
 *
 * 契約來源（唯一權威）：
 * docs/operations/session-handoffs/2026-08-08-issue1759-task43-traveler-confirm-page-plan.md
 * §2 D7（safe next）／§2 D8（accept 成功導向）／§3.3（GET 投影）／§4.4（六態與 accept 分支）。
 *
 * 誠實邊界（計畫 §2 D3，必須寫進 UI 行為）：GET 是**預測**，accept 才是權威。
 * 兩次呼叫之間存在 TOCTOU 窗口（期限跨越、他處併發 accept、容量被吃滿），
 * 所以 accept 的 410／409（含 CAPACITY_EXCEEDED）各自有分支，
 * 不得假設「GET 說 pending 就一定 accept 成功」。
 *
 * 授權真值來源只有一個：GET preview 的 401。頁面不在 server 端預先判斷登入態
 * （`/booking/*` 在 middleware 已被歸為 traveler public path 直接放行，計畫 F18），
 * 否則會多開一條授權路徑。
 */

/** 六態（計畫 §4.4 表格，不得增減）。 */
type ConfirmViewState = 'loading' | 'login-required' | 'invalid' | 'expired' | 'used' | 'ready';

const GENERIC_ERROR = '暫時無法完成確認，請稍後再試。';
const SERVICE_UNAVAILABLE_ERROR = '服務暫時無法使用，請稍後再試。';
const CAPACITY_ERROR = '此日期名額已滿，請聯絡導遊。';
const IN_PROGRESS_ERROR = '處理中，請稍候再試。';

export function BookingConfirmClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<ConfirmViewState>('loading');
  const [preview, setPreview] = useState<ConfirmationPreviewView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * 同一次確認的 idempotency-key 必須在整個頁面生命週期重放同一把
   * （計畫 §4.4 步驟 3）：換鑰匙重試會撞 `IDEMPOTENCY_CONFLICT`，或製造第二筆紀錄。
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  const loginHref = `/login?next=${encodeURIComponent(`/booking/confirm/${token}`)}`;

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        const response = await fetch(
          `/api/v2/me/booking-confirmations/${encodeURIComponent(token)}`,
          { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
        );
        if (cancelled) return;

        if (response.status === 401) {
          setState('login-required');
          return;
        }
        if (response.status === 404) {
          setState('invalid');
          return;
        }
        if (!response.ok) {
          // 503（讀取閘關閉）與 5xx 皆屬「暫時不可用」；不謊報連結無效。
          setState('invalid');
          setErrorMessage(
            response.status === 503 ? SERVICE_UNAVAILABLE_ERROR : GENERIC_ERROR,
          );
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: ConfirmationPreviewView }
          | null;
        const data = payload?.data;
        if (cancelled) return;
        if (!data || typeof data.status !== 'string') {
          setState('invalid');
          setErrorMessage(GENERIC_ERROR);
          return;
        }

        setPreview(data);
        if (data.status === 'expired') setState('expired');
        else if (data.status === 'used') setState('used');
        else setState('ready');
      } catch {
        if (cancelled) return;
        setState('invalid');
        setErrorMessage(GENERIC_ERROR);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    // 首次才產生；之後每次重試都重放同一把鑰匙。
    idempotencyKeyRef.current ??= crypto.randomUUID();

    try {
      await ensureCsrfToken();
      const response = await fetch(
        `/api/v2/me/booking-confirmations/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: csrfHeaders({
            'content-type': 'application/json',
            'idempotency-key': idempotencyKeyRef.current,
          }),
          body: '{}',
        },
      );

      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { data?: { orderId?: string } }
          | null;
        const orderId = payload?.data?.orderId;
        if (!orderId) {
          setErrorMessage(GENERIC_ERROR);
          return;
        }
        router.replace(`/order/pay?orderId=${encodeURIComponent(orderId)}`);
        return;
      }

      if (response.status === 401) {
        setState('login-required');
        return;
      }
      if (response.status === 404) {
        setState('invalid');
        return;
      }
      if (response.status === 410) {
        setState('expired');
        return;
      }
      if (response.status === 503) {
        setErrorMessage(SERVICE_UNAVAILABLE_ERROR);
        return;
      }
      if (response.status === 409) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string } }
          | null;
        const code = payload?.error?.code ?? '';
        if (code === 'CONFIRMATION_TOKEN_ALREADY_CONSUMED') {
          setState('used');
          return;
        }
        if (code === 'CAPACITY_EXCEEDED') {
          // 停在 ready：這不是連結問題，旅客改人數／改日期前需要先聯絡導遊。
          setErrorMessage(CAPACITY_ERROR);
          return;
        }
        if (code === 'IDEMPOTENCY_IN_PROGRESS') {
          setErrorMessage(IN_PROGRESS_ERROR);
          return;
        }
        setErrorMessage(GENERIC_ERROR);
        return;
      }

      setErrorMessage(GENERIC_ERROR);
    } catch {
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setSubmitting(false);
    }
  }, [router, submitting, token]);

  if (state === 'loading') {
    return (
      <main className="booking-confirm-page">
        <p className="booking-confirm-status" data-testid="booking-confirm-loading" aria-live="polite">
          載入中…
        </p>
      </main>
    );
  }

  if (state === 'login-required') {
    return (
      <main className="booking-confirm-page">
        <section className="booking-confirm-status" data-testid="booking-confirm-login-required">
          <p>請先登入以確認此預訂。</p>
          <Link
            className="booking-confirm-status__action"
            data-testid="booking-confirm-login-link"
            href={loginHref}
          >
            前往登入
          </Link>
        </section>
      </main>
    );
  }

  if (state === 'invalid') {
    const isServiceIssue =
      errorMessage === SERVICE_UNAVAILABLE_ERROR || errorMessage === GENERIC_ERROR;

    return (
      <main className="booking-confirm-page">
        <section className="booking-confirm-status" data-testid="booking-confirm-invalid" role="alert">
          <p>{isServiceIssue ? errorMessage : '此確認連結無效，或不屬於目前登入的帳號。'}</p>
          {!isServiceIssue && errorMessage ? (
            <p className="booking-confirm-status__hint">{errorMessage}</p>
          ) : null}
        </section>
      </main>
    );
  }

  if (state === 'expired') {
    return (
      <main className="booking-confirm-page">
        <section className="booking-confirm-status" data-testid="booking-confirm-expired" role="alert">
          <p>此確認連結已過期，請聯絡導遊重新發送。</p>
        </section>
      </main>
    );
  }

  if (state === 'used') {
    return (
      <main className="booking-confirm-page">
        <section className="booking-confirm-status" data-testid="booking-confirm-used">
          <p>此預訂已完成確認。</p>
          {preview?.orderId ? (
            <Link
              className="booking-confirm-status__action"
              data-testid="booking-confirm-pay-link"
              href={`/order/pay?orderId=${encodeURIComponent(preview.orderId)}`}
            >
              前往付款
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  if (!preview) {
    // 型別收斂用：ready 一定有 preview（設定順序在 setState 之前）。
    return (
      <main className="booking-confirm-page">
        <p className="booking-confirm-status" data-testid="booking-confirm-loading" aria-live="polite">
          載入中…
        </p>
      </main>
    );
  }

  return (
    <main className="booking-confirm-page">
      <BookingConfirmationCard
        preview={preview}
        submitting={submitting}
        errorMessage={errorMessage}
        onAccept={() => {
          void handleAccept();
        }}
      />
    </main>
  );
}
