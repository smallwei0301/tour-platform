import { ok, fail } from '../../../src/lib/api';
import { normalizeIntake, buildActivityIntakePrompt } from '../../../src/lib/guide-activity-intake.mjs';
import { sendGuideActivityIntakeNotification } from '../../../src/lib/email';

/**
 * 導遊新行程投稿。
 *
 * 公開端點（不在 /api/guide/ 前綴下，故不受 guide session / CSRF 中介層限制，
 * 與 /api/guide-applications 同樣對外開放）。
 *
 * 流程：驗證最小資訊 → 組裝給 AI 的提示詞 → 寄信給 ADMIN_EMAIL_ALLOWLIST。
 * 管理者收到後把提示詞貼給 AI，產出可匯入後台的行程 JSON。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const normalized = normalizeIntake(body);
  if (!normalized.ok) {
    return Response.json(fail('VALIDATION_ERROR', normalized.message), { status: 400 });
  }

  const answers = normalized.value as {
    title: string;
    guideName?: string;
    guideContactEmail?: string;
  };
  const prompt = buildActivityIntakePrompt(answers);

  try {
    const results = await sendGuideActivityIntakeNotification({
      title: answers.title,
      prompt,
      guideName: answers.guideName,
      guideContactEmail: answers.guideContactEmail,
    });

    const delivered = results.filter((r) => r.ok).length;
    // 無管理者信箱設定 / Resend 未設定時 results 可能為空或 skipped；
    // 仍視為「已收件」回 200，避免導遊端因環境設定看到錯誤（log 已記錄）。
    return Response.json(
      ok({ received: true, recipients: results.length, delivered }),
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
