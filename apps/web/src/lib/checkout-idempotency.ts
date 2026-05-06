const REUSABLE_PAYMENT_STATUSES = new Set(['pending', 'processing', 'created']);

type CheckoutPaymentCandidate = {
  id: string;
  trade_no: string | null;
  status: string | null;
};

export function isReusableCheckoutPayment(status: string | null | undefined): boolean {
  if (!status) return false;
  return REUSABLE_PAYMENT_STATUSES.has(status);
}

export function findReusableCheckoutPayment(
  payments: CheckoutPaymentCandidate[] | null | undefined
): CheckoutPaymentCandidate | null {
  if (!payments || payments.length === 0) {
    return null;
  }

  return (
    payments.find(
      (payment) =>
        Boolean(payment.trade_no) &&
        Boolean(payment.id) &&
        isReusableCheckoutPayment(payment.status)
    ) || null
  );
}
