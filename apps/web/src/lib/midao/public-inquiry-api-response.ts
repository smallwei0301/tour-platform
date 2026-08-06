export function publicInquiryJsonSuccess<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ status: 'success', data }, init);
}

export function publicInquiryJsonError(code: string, message: string, retryable: boolean, status: number, init?: ResponseInit): Response {
  return Response.json({ status: 'error', code, message, retryable }, { ...init, status });
}
