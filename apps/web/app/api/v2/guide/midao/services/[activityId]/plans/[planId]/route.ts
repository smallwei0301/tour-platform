/**
 * PATCH /api/v2/guide/midao/services/[activityId]/plans/[planId] — /midao2 單方案直接生效更新（#1860 Stage 1B / F3）。
 *
 * 樂觀鎖：body 必填 `expectedUpdatedAt`（ISO-8601），寫入以 planId + activityId + updated_at
 * 三重條件綁定單一列；影響 0 列時再讀一次分流 404（不存在／越權）與 409（版本衝突）。
 * 直接寫入不碰 booking/order 既有快照，也不寫任何審核狀態欄位。
 */
import {
  deactivateServicePlanDb,
  normalizeExpectedUpdatedAt,
  updateServicePlanDb,
} from '../../../../../../../../../src/lib/midao/db-midao-service-plans.mjs';
import { recordMidaoAuditEvent } from '../../../../../../../../../src/lib/midao/db-midao-audit-events.mjs';
import { withMidaoGuideCommand } from '../../../../../../../../../src/lib/midao/with-guide-route.ts';
import { jsonErrorWithExtras } from '../../../../../../../../../src/lib/api-response.ts';

const ROUTE = 'v2/guide/midao/services/[activityId]/plans/[planId]';

type PlanItemRouteDeps = {
  recordAuditEvent?: typeof recordMidaoAuditEvent;
  [key: string]: unknown;
};

type ConflictDetail = {
  message: string;
  currentUpdatedAt: string | null;
  currentPlan: unknown;
};

function isRevisionConflict(error: unknown): error is ConflictDetail & { code: string } {
  return Boolean(error)
    && typeof error === 'object'
    && (error as { code?: unknown }).code === 'PLAN_REVISION_CONFLICT';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ activityId: string; planId: string }> },
  deps: PlanItemRouteDeps = {},
) {
  const recordAuditEvent = deps.recordAuditEvent ?? recordMidaoAuditEvent;
  let conflict: ConflictDetail | null = null;

  const response = await withMidaoGuideCommand(
    request,
    async ({ guideId, requestId, requestHash, body }) => {
      const { activityId, planId } = await params;
      const payload = (body && typeof body === 'object' && !Array.isArray(body))
        ? body as Record<string, unknown>
        : {};
      const expectedUpdatedAt = normalizeExpectedUpdatedAt(payload.expectedUpdatedAt);

      const { expectedUpdatedAt: _ignored, deactivate, ...planFields } = payload;

      let result;
      try {
        result = deactivate === true
          ? await deactivateServicePlanDb({ guideId, activityId, planId, expectedUpdatedAt })
          : await updateServicePlanDb({ guideId, activityId, planId, input: planFields, expectedUpdatedAt });
      } catch (error) {
        if (isRevisionConflict(error)) {
          conflict = {
            message: error.message,
            currentUpdatedAt: error.currentUpdatedAt,
            currentPlan: error.currentPlan,
          };
        }
        throw error;
      }

      // 稽核在 canonical 寫入成功之後；寫入失敗不得回滾資料也不得轉成 500（已知非原子缺口）。
      try {
        await recordAuditEvent({
          guideId,
          action: 'midao.plan.update',
          planId: result.plan.id,
          requestId,
          route: ROUTE,
          activityId,
          changedFields: result.changedFields,
          before: result.before,
          after: result.after,
          expectedUpdatedAt,
          resultUpdatedAt: result.plan.updatedAt,
          requestHash: requestHash ?? null,
        });
      } catch {
        // recordMidaoAuditEvent 已自行回報；此處僅保證成功寫入不被稽核缺口反噬。
      }

      return { plan: result.plan, appliedToPublicSurface: true };
    },
    { route: ROUTE, ...deps },
  );

  if (conflict) {
    const detail: ConflictDetail = conflict;
    return jsonErrorWithExtras('PLAN_REVISION_CONFLICT', detail.message, 409, {
      currentUpdatedAt: detail.currentUpdatedAt,
      currentPlan: detail.currentPlan,
    });
  }
  return response;
}
