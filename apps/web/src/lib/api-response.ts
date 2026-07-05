/**
 * #1614 — 共用 API 回應 helper（V2 契約）。
 *
 * 收斂 route 手刻 `Response.json(successV2(...))`／`Response.json(errorV2(...), {status})`
 * 的樣板。envelope 形狀完全沿用 `api.ts` 的 successV2/errorV2（V2 契約見
 * docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md），本檔只負責
 * 包裝成 Response——不發明新形狀。
 *
 * 新 v2 route 一律使用本 helper（tests/unit/issue1614-v2-response-helper-ratchet-guard
 * 鎖定手刻樣板數量只能降不能升）；與 #1600 parseBody（輸入驗證）、#1598
 * handleRouteError（catch 錯誤上報）組成新 route 標準骨架。
 */
import { successV2, errorV2 } from './api.ts';

/** 200（或自訂 init）成功回應：{ success: true, data } */
export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(successV2(data), init);
}

/** 業務錯誤回應：{ success: false, error: { code, message } } + HTTP status */
export function jsonError(
  code: string,
  message: string,
  status: number,
  init?: ResponseInit
): Response {
  return Response.json(errorV2(code, message), { ...init, status });
}
