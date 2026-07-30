/**
 * 嚮導申請 → 管理者通知信。
 *
 * 內容＝申請表**所有欄位**（含未填的，標示「未填寫」），讓審核者在信裡就看得
 * 完整、不必先登入後台。欄位清單取自 ./summary，與後台詳情頁／Telegram 同源。
 *
 * 放在領域子資料夾而非併進 email.ts：email.ts 已達 architecture ratchet 的行數
 * 天花板（863 行），且 CLAUDE.md 的 strangler 規則要求新領域另開檔。這裡只借用
 * email.ts 的寄送契約（sendEmailWithContract）與外框（wrapEmail）。
 */
import { sendEmailWithContract, wrapEmail, type EmailDeliveryResult } from '../email.ts';
// env 一律經 src/config 的 getter（architecture ratchet 禁止新增直讀 env 的檔案）。
import { getAdminAuthEnv } from '../../config/security-env.mjs';
import { buildGuideApplicationFields, type GuideApplicationLike } from './summary.ts';

const FN = 'sendGuideApplicationNotification';

/** email.ts 的 escapeHtml 未匯出，此處自帶一份（同語意：擋標籤注入）。 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function adminRecipients(): string[] {
  return String(getAdminAuthEnv().adminEmailAllowlist || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * 寄給 ADMIN_EMAIL_ALLOWLIST 全員；無管理者信箱時回空陣列（自然 self-skip）。
 * 回傳每位管理者的寄送結果。
 */
export async function sendGuideApplicationNotification(
  app: GuideApplicationLike,
): Promise<EmailDeliveryResult[]> {
  const adminEmails = adminRecipients();
  if (adminEmails.length === 0) return [];

  const applicantName = String(app?.fullName || '').trim() || '（未具名）';
  const subject = `[Midao 祕島｜嚮導申請] ${applicantName}`;
  const fields = buildGuideApplicationFields(app);
  const unfilled = fields.filter((f) => !f.filled);

  const rows = fields
    .map((f) => {
      const valueStyle = f.filled ? 'color:#111827;' : 'color:#9ca3af;font-style:italic;';
      const wrap = f.multiline ? 'white-space:pre-wrap;' : '';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;vertical-align:top;">${escapeHtml(f.label)}${f.required ? ' *' : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;${valueStyle}${wrap}">${escapeHtml(f.value)}</td>
      </tr>`;
    })
    .join('');

  const unfilledBlock = unfilled.length
    ? `<div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
         <p style="margin:0;font-size:13px;color:#92400e;font-weight:600;">⚠️ 未填寫欄位（${unfilled.length}）</p>
         <p style="margin:4px 0 0;font-size:13px;color:#92400e;">${escapeHtml(unfilled.map((f) => f.label).join('、'))}</p>
       </div>`
    : `<div style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
         <p style="margin:0;font-size:13px;color:#065f46;font-weight:600;">✅ 所有欄位都已填寫</p>
       </div>`;

  const meta = [
    app?.id ? `申請編號：${app.id}` : '',
    app?.createdAt
      ? `申請時間：${new Date(app.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
      : '',
  ]
    .filter(Boolean)
    .join('　·　');

  // wrapEmail 會把 title 原樣插進 <title>，而 subject 含申請人自填姓名
  // （公開端點輸入）→ 這裡先 escape，否則 `<script>` 會原樣進 HTML。
  const html = wrapEmail(escapeHtml(subject), `
    <h1 style="font-size:20px;font-weight:800;color:#111827;margin:0 0 8px;">🧭 有人申請成為嚮導</h1>
    <p style="font-size:14px;color:#374151;margin:0 0 4px;">申請人：<strong>${escapeHtml(applicantName)}</strong></p>
    ${meta ? `<p style="font-size:12px;color:#9ca3af;margin:0 0 16px;">${escapeHtml(meta)}</p>` : ''}
    ${unfilledBlock}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      ${rows}
    </table>
    <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">到後台「嚮導管理 → 申請」點申請人姓名，可看完整詳情並審核上線。</p>
  `);

  const results: EmailDeliveryResult[] = [];
  for (const to of adminEmails) {
    const result = await sendEmailWithContract({ fn: FN, to, subject, html }).catch(
      (): EmailDeliveryResult => ({
        fn: FN,
        to,
        subject,
        ok: false,
        status: 'failed',
        errorCode: 'EMAIL_SEND_FAILED',
        retriable: true,
      }),
    );
    results.push(result);
  }
  return results;
}
