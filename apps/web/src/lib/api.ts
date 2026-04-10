export function ok(data: unknown) {
  return { ok: true, data };
}

export function fail(code: string, message: string) {
  return { ok: false, error: { code, message } };
}

// V2 API Response Helpers (per API Spec V2)
export function successV2<T>(data: T) {
  return { success: true, data };
}

export function errorV2(code: string, message: string) {
  return { success: false, error: { code, message } };
}
