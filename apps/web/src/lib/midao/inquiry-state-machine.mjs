const ALLOWED_TRANSITIONS = new Map([
  ['new', new Set(['opened', 'replied', 'closed', 'expired'])],
  ['replied', new Set(['ready_to_convert', 'converted', 'closed'])],
  ['ready_to_convert', new Set(['converted', 'closed'])],
]);

export function canTransitionInquiryState(from, to) {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}
