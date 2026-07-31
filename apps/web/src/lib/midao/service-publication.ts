// #1758 S3 · Task 24 — 服務草稿「可否送出發布」的 application-layer 前置驗證。
//
// 這是發布流程的最後一道把關（純驗證，不碰資料庫層、不觸發 publish RPC）。呼叫端
// 先把 guide_service_drafts 這一列（status）與其 payload（名稱／說明／方案）組成單一
// 驗證輸入物件，連同該活動的自訂問卷題目一起傳入；本函式回傳 { valid, errors[] }，
// 逐條列出所有不合格原因，不 throw，由呼叫端決定如何回應（例如 422）。
//
// 驗證規則：
//   1. draft.status 必須是 'active'（discarded/published 不可再送出發布）。
//   2. 活動名稱（name）非空。
//   3. 至少一則說明文字（descriptions[] 或 description 皆可，至少一段非空）。
//   4. 至少一個有效方案／時段（plans[]，每個方案需有非空 name 與合法 booking_type）。
//   5. 所有自訂問卷題目皆通過 S2 的 validateIntakeQuestion（直接 import 重用，不重寫）。

import { validateIntakeQuestion } from './questionnaire-schema.mjs';

// booking_type 沿用 canonical activity_plans 概念（見
// apps/web/src/components/admin/activity-plans/plan-types.ts 的 ActivityPlan.booking_type
// 以及 design §5.6：scheduled / request / instant）。此處以本地常數表達同一組列舉，
// 避免耦合到 React 相鄰模組，並非重新定義衝突的 shape。
export const PUBLISHABLE_BOOKING_TYPES = Object.freeze([
  'scheduled',
  'request',
  'instant',
]);

// 草稿唯一可送出發布的狀態；對照 S1 midao_guide_service_drafts_status_check。
const PUBLISHABLE_DRAFT_STATUS = 'active';

interface PlanLike {
  name?: unknown;
  booking_type?: unknown;
}

interface ServiceDraftLike {
  status?: unknown;
  name?: unknown;
  description?: unknown;
  descriptions?: unknown;
  plans?: unknown;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// 蒐集草稿的說明文字：支援 descriptions[]（多段）或單一 description 字串。
function collectDescriptions(draft: ServiceDraftLike): string[] {
  const collected: string[] = [];
  if (Array.isArray(draft.descriptions)) {
    for (const item of draft.descriptions) {
      if (isNonEmptyString(item)) collected.push(item);
    }
  }
  if (isNonEmptyString(draft.description)) {
    collected.push(draft.description);
  }
  return collected;
}

/**
 * 驗證一份 service draft 是否可送出發布。
 *
 * @param draft 已由呼叫端組好的草稿驗證輸入（status + name + descriptions/description + plans）。
 * @param questions 該活動的自訂問卷題目陣列（可為空；空陣列視為沒有自訂問卷，通過）。
 * @returns { valid: boolean, errors: string[] }（不 throw）。
 */
export function validateServiceForPublication(
  draft: unknown,
  questions: unknown = [],
): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(draft)) {
    return {
      valid: false,
      errors: ['draft 必須是物件（{ status, name, descriptions, plans }）。'],
    };
  }

  const draftLike = draft as ServiceDraftLike;

  // --- 1. draft 狀態 ---
  const { status } = draftLike;
  if (status !== PUBLISHABLE_DRAFT_STATUS) {
    const shown = status === undefined ? '（缺漏）' : JSON.stringify(status);
    errors.push(
      `draft 狀態 ${shown} 不可送出發布，只有 active 草稿才能發布（discarded/published 皆不可）。`,
    );
  }

  // --- 2. 活動名稱 ---
  if (!isNonEmptyString(draftLike.name)) {
    errors.push('活動名稱（name）為必填，不可為空白。');
  }

  // --- 3. 至少一則說明文字 ---
  const descriptions = collectDescriptions(draftLike);
  if (descriptions.length === 0) {
    errors.push('至少需要一則說明文字（description / descriptions 不可全部為空）。');
  }

  // --- 4. 至少一個有效方案／時段 ---
  const { plans } = draftLike;
  if (!Array.isArray(plans) || plans.length === 0) {
    errors.push('至少需要一個有效方案／時段（plans 不可為空）。');
  } else {
    let validPlanCount = 0;
    plans.forEach((plan, index) => {
      const planErrors: string[] = [];
      if (!isPlainObject(plan)) {
        planErrors.push('必須是物件（{ name, booking_type }）。');
      } else {
        const planLike = plan as PlanLike;
        if (!isNonEmptyString(planLike.name)) {
          planErrors.push('name 不可為空白。');
        }
        if (
          typeof planLike.booking_type !== 'string' ||
          !PUBLISHABLE_BOOKING_TYPES.includes(planLike.booking_type)
        ) {
          const shown =
            planLike.booking_type === undefined
              ? '（缺漏）'
              : JSON.stringify(planLike.booking_type);
          planErrors.push(
            `booking_type ${shown} 不合法，必須是 ${PUBLISHABLE_BOOKING_TYPES.join(' / ')} 其中之一。`,
          );
        }
      }
      if (planErrors.length === 0) {
        validPlanCount += 1;
      } else {
        errors.push(`方案 #${index + 1} 無效：${planErrors.join(' ')}`);
      }
    });
    if (validPlanCount === 0) {
      errors.push('至少需要一個有效方案／時段，但目前沒有任何方案通過驗證。');
    }
  }

  // --- 5. 自訂問卷題目全部通過 S2 的 validateIntakeQuestion（重用，不重寫）---
  if (questions !== undefined && questions !== null && !Array.isArray(questions)) {
    errors.push('questions 必須是陣列（自訂問卷題目清單；沒有題目時傳空陣列）。');
  } else if (Array.isArray(questions)) {
    questions.forEach((question, index) => {
      const result = validateIntakeQuestion(question);
      if (!result.valid) {
        const keyLabel =
          isPlainObject(question) && isNonEmptyString(question.question_key)
            ? String(question.question_key)
            : `#${index + 1}`;
        for (const message of result.errors) {
          errors.push(`問卷題目「${keyLabel}」：${message}`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
