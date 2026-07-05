/**
 * v2 route request body 驗證（健檢 v2 S5 / issue #1600）。
 *
 * 全 repo 過去零 schema validation 庫，body 驗證手寫、品質不一。導入 zod 讓 v2 route
 * 的輸入面有一致、可組合、型別安全的驗證。範圍限 v2；legacy 凍結不回補。
 *
 * 用法：
 *   const parsed = await parseBody(request, RedeemSchema);
 *   if (!parsed.ok) return parsed.response;   // errorV2 400
 *   const { token } = parsed.data;            // 已驗證且型別收斂
 *
 * 原則：
 * - schema 是「收緊」不是「改變」——以現行手寫驗證的實際接受範圍為基準，先鎖現狀。
 * - 400 回應用 errorV2 shape，錯誤訊息只給欄位層級摘要（不外洩內部結構）。
 * - 非 JSON body → 400 INVALID_REQUEST（與既有 route 對齊）。
 */
import type { ZodType } from 'zod';

// errorV2 shape 內聯（等同 src/lib/api.ts 的 errorV2），讓本 helper 可被輕量單測直接載入。
function errorV2Body(code: string, message: string) {
  return { success: false, error: { code, message } };
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/** 把 zod issues 收斂成單行、不外洩內部結構的欄位摘要。 */
function summarizeIssues(issues: { path: (string | number)[]; message: string }[]): string {
  const parts = issues.slice(0, 5).map((i) => {
    const field = i.path.length ? i.path.join('.') : '(body)';
    return `${field}: ${i.message}`;
  });
  return parts.join('; ');
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(errorV2Body('INVALID_REQUEST', '請求內容不是有效的 JSON'), { status: 400 }),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: Response.json(
        errorV2Body('INVALID_REQUEST', summarizeIssues(result.error.issues)),
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: result.data };
}
