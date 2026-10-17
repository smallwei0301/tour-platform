import { acceptRouteError } from './booking-confirmation.ts';

export function acceptUnexpected(message = 'Midao traveler confirmation backend failure') {
  const error = new Error(message);
  error.name = 'MidaoTravelerConfirmationBackendError';
  return error;
}

export function acceptNotFound() {
  return acceptRouteError('NOT_FOUND');
}
