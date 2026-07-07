/**
 * v2 金流輸入面 zod schemas（issue #1600 第一批）。
 *
 * 原則：以各 route 現行手寫驗證的實際接受範圍為基準——先鎖現狀，之後再逐步加嚴。
 *
 * 第一批只落地 redeem（body 語意乾淨、與 schema 一對一）。POS 補收/退款/手動收款與
 * draft/checkout 建單的既有驗證為 coercion-based（如 additional-payment 讀 `amount` 而非
 * `amountTwd`、多為 optional＋downstream Number 強制），需逐 route 鏡射現狀以免核心金流
 * 回歸，列為後續逐步收斂（見 #1600 追蹤留言）。
 */
import { z } from 'zod';

/** POST /api/v2/guide/orders/[orderId]/redeem — 掃碼核銷憑證。 */
export const RedeemBodySchema = z.object({
  // 憑證簽章 token（v1.<orderId>.<hmac>）。route 另行 verifyVoucherToken 驗簽＋綁定同一 orderId。
  token: z.string().min(1, '缺少憑證 token'),
});
export type RedeemBody = z.infer<typeof RedeemBodySchema>;

/** POST /api/v2/guide/redeem/by-code — 短碼核銷（#1637 導遊端核銷頁）。 */
export const RedeemByCodeBodySchema = z.object({
  // 旅客憑證卡上的人類可讀短碼（MID-XXXXXX；大小寫不拘、可省略 MID- 前綴）。
  code: z.string().min(4, '缺少憑證短碼').max(32, '短碼格式不正確'),
});
export type RedeemByCodeBody = z.infer<typeof RedeemByCodeBodySchema>;
