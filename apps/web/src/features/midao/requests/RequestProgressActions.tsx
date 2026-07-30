'use client';

import { useRef, useState } from 'react';
import { decideBookingRequest, type BookingDecisionAction } from './requests.api';

type Confirmation = BookingDecisionAction | null;

export function RequestProgressActions({
  bookingId,
  allowedActions,
  onReload,
}: {
  bookingId: string;
  allowedActions: { approve: boolean; reject: boolean };
  onReload: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectConfirmed, setRejectConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(false);
  const pendingRef = useRef(false);
  const trimmedRejectNote = rejectNote.trim();

  if (!allowedActions.approve && !allowedActions.reject) return null;

  const openConfirmation = (action: BookingDecisionAction) => {
    if (pendingRef.current) return;
    setConflict(false);
    setError(false);
    setConfirmation(action);
  };

  const submit = async (action: BookingDecisionAction) => {
    if (pendingRef.current || (action === 'reject' && (!rejectConfirmed || !trimmedRejectNote))) return;
    pendingRef.current = true;
    setPending(true);
    setError(false);
    setConflict(false);

    try {
      const result = await decideBookingRequest({
        bookingId,
        action,
        ...(action === 'reject' ? { note: trimmedRejectNote } : {}),
      });
      if (result.kind === 'success') {
        setConfirmation(null);
        await onReload();
      } else if (result.kind === 'conflict') {
        setConfirmation(null);
        setConflict(true);
      } else {
        setError(true);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <section aria-label="需求處理" className="midao-request-progress-actions">
      <p className="midao-home-eyebrow">處理需求</p>
      <div>
        {allowedActions.approve ? (
          <button type="button" disabled={pending} onClick={() => openConfirmation('approve')}>
            核准需求
          </button>
        ) : null}
        {allowedActions.reject ? (
          <button type="button" disabled={pending} onClick={() => openConfirmation('reject')}>
            婉拒需求
          </button>
        ) : null}
      </div>

      {confirmation === 'approve' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="approve-request-title">
          <h3 id="approve-request-title">確認核准需求</h3>
          <p>核准後將依最新需求狀態處理。</p>
          <button type="button" disabled={pending} onClick={() => setConfirmation(null)}>取消</button>
          <button type="button" disabled={pending} onClick={() => void submit('approve')}>確認核准</button>
        </div>
      ) : null}

      {confirmation === 'reject' ? (
        <div role="dialog" aria-modal="true" aria-labelledby="reject-request-title">
          <h3 id="reject-request-title">確認婉拒需求</h3>
          <label htmlFor="midao-reject-note">婉拒原因</label>
          <textarea
            id="midao-reject-note"
            value={rejectNote}
            disabled={pending}
            onChange={(event) => setRejectNote(event.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={rejectConfirmed}
              disabled={pending}
              onChange={(event) => setRejectConfirmed(event.target.checked)}
            />
            我確認要婉拒此需求
          </label>
          <button type="button" disabled={pending} onClick={() => setConfirmation(null)}>取消</button>
          <button
            type="button"
            disabled={pending || !rejectConfirmed || !trimmedRejectNote}
            onClick={() => void submit('reject')}
          >
            確認婉拒
          </button>
        </div>
      ) : null}

      {conflict ? (
        <div role="alert" aria-live="assertive">
          <p>需求狀態可能已變更，請重新載入後確認。</p>
          <button type="button" disabled={pending} onClick={() => void onReload()}>重新載入需求</button>
        </div>
      ) : null}
      {error ? <p role="alert">目前無法完成操作，請稍後再試。</p> : null}
    </section>
  );
}
