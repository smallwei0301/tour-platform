#!/usr/bin/env node
/**
 * 通用「排程/CI 失敗通知」— Telegram + Email（Resend）。
 *
 * 給 GitHub Actions 在 `if: failure()` 步驟呼叫，集中一支腳本，避免每個 workflow
 * 各寫一份 curl。只用 Node 內建（global fetch），不需 npm install。
 *
 * 環境變數（全部可選；缺哪個就略過哪個通道，best-effort）：
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  — Telegram 告警
 *   RESEND_API_KEY / ALERT_EMAIL_TO        — Email 告警（ALERT_EMAIL_FROM 預設 onboarding@resend.dev）
 *   ALERT_EMAIL_FROM                       — 寄件人（需為 Resend 已驗證網域，否則 Resend 會擋）
 * 內容上下文（GitHub Actions 會自動帶入）：
 *   WORKFLOW_NAME / GITHUB_WORKFLOW, GITHUB_REPOSITORY, RUN_URL, JOB_STATUS
 *
 * 退出碼一律 0：通知失敗不應再讓「已失敗的 job」變得更糟。
 */

/** 組出告警標題與內文（純函式，供測試）。 */
export function buildAlertMessage(env = process.env) {
  const workflow = env.WORKFLOW_NAME || env.GITHUB_WORKFLOW || 'unknown-workflow';
  const repo = env.GITHUB_REPOSITORY || 'unknown-repo';
  const status = env.JOB_STATUS || 'failure';
  const runUrl =
    env.RUN_URL ||
    (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : '');
  const subject = `🚨 GitHub Actions 失敗：${workflow}（${repo}）`;
  const lines = [
    subject,
    `狀態：${status}`,
    runUrl ? `Run：${runUrl}` : null,
    `時間：${env.__NOW__ || new Date().toISOString()}`,
  ].filter(Boolean);
  return { subject, text: lines.join('\n') };
}

async function sendTelegram(env, text, fetchFn = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = env.TELEGRAM_CHAT_ID ?? '';
  if (!token || !chatId) return { channel: 'telegram', skipped: true };
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return { channel: 'telegram', ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('[notify-failure] telegram failed:', err?.message ?? err);
    return { channel: 'telegram', ok: false, error: String(err?.message ?? err) };
  }
}

async function sendEmail(env, subject, text, fetchFn = globalThis.fetch) {
  const apiKey = env.RESEND_API_KEY ?? '';
  const to = env.ALERT_EMAIL_TO ?? '';
  const from = env.ALERT_EMAIL_FROM ?? 'onboarding@resend.dev';
  if (!apiKey || !to) return { channel: 'email', skipped: true };
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        text,
      }),
    });
    return { channel: 'email', ok: res.ok, status: res.status };
  } catch (err) {
    console.warn('[notify-failure] email failed:', err?.message ?? err);
    return { channel: 'email', ok: false, error: String(err?.message ?? err) };
  }
}

/** 同時送 Telegram + Email（各自 best-effort）。 */
export async function notifyFailure(env = process.env, fetchFn = globalThis.fetch) {
  const { subject, text } = buildAlertMessage(env);
  const results = await Promise.all([
    sendTelegram(env, text, fetchFn),
    sendEmail(env, subject, text, fetchFn),
  ]);
  return results;
}

import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const results = await notifyFailure();
  console.log('[notify-failure]', JSON.stringify(results));
  const anySent = results.some((r) => r.ok);
  const allSkipped = results.every((r) => r.skipped);
  if (allSkipped) {
    console.warn('[notify-failure] 沒有設定任何通知通道（Telegram / Email）— 略過。');
  } else if (!anySent) {
    console.warn('[notify-failure] 所有通知通道送出失敗（不影響 job 結果）。');
  }
  process.exit(0); // 通知失敗不再讓 job 更糟
}
