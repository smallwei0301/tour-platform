/**
 * GET/POST /api/v2/guide/midao/services/[activityId]/plans — /midao2 方案清單與新增（#1860 Stage 1B / F2）。
 *
 * 直接生效：POST 成功即寫入 canonical `activity_plans`，公開介面立即反映。
 * 認證／CSRF／mutations flag／Idempotency-Key／requestId 一律沿用 canonical boundary，
 * 不複製 legacy service route 的認證邏輯，也不發明新的錯誤外殼。
 */
import {
  createServicePlanDb,
  listServicePlansDb,
} from '../../../../../../../../src/lib/midao/db-midao-service-plans.mjs';
import { recordMidaoAuditEvent } from '../../../../../../../../src/lib/midao/db-midao-audit-events.mjs';
import {
  withMidaoGuideCommand,
  withMidaoGuideQuery,
} from '../../../../../../../../src/lib/midao/with-guide-route.ts';

const ROUTE = 'v2/guide/midao/services/[activityId]/plans';

type PlanRouteDeps = {
  recordAuditEvent?: typeof recordMidaoAuditEvent;
  [key: string]: unknown;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
  deps: PlanRouteDeps = {},
) {
  return withMidaoGuideQuery(
    request,
    async ({ guideId }) => {
      const { activityId } = await params;
      const plans = await listServicePlansDb(guideId, activityId);
      return { plans };
    },
    { route: ROUTE, ...deps },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
  deps: PlanRouteDeps = {},
) {
  const recordAuditEvent = deps.recordAuditEvent ?? recordMidaoAuditEvent;
  return withMidaoGuideCommand(
    request,
    async ({ guideId, requestId, requestHash, body }) => {
      const { activityId } = await params;
      const result = await createServicePlanDb({ guideId, activityId, input: body });

      // 稽核在 canonical 寫入成功之後；寫入失敗不得回滾資料也不得轉成 500（已知非原子缺口）。
      try {
        await recordAuditEvent({
          guideId,
          action: 'midao.plan.create',
          planId: result.plan.id,
          requestId,
          route: ROUTE,
          activityId,
          changedFields: result.changedFields,
          before: {},
          after: result.after,
          expectedUpdatedAt: null,
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
}
