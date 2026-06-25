import { readFileSync } from 'fs'
import assert from 'assert'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PAGE = join(__dirname, '../../app/me/orders/[orderId]/page.tsx')
// #multilingual: 面向使用者的退款文案已移到 messages/zh-Hant.json 的 orderDetail namespace，
// 頁面只保留 m.refundSuccess。針對「文案內容」的契約改讀繁中 catalog。
const ZH = join(__dirname, '../../messages/zh-Hant.json')
const src = readFileSync(PAGE, 'utf8') + '\n' + readFileSync(ZH, 'utf8')

describe('Issue 459 — refund success copy is auto-execute aware', () => {
  it('refundSuccess message does NOT contain 客服將於 2 個工作天', () => {
    assert.doesNotMatch(src, /客服將於 2 個工作天/)
  })
  it('refundSuccess message confirms auto-return to payment method', () => {
    assert.match(src, /退款申請已送出.*原付款工具|退回原付款工具/)
  })
  it('refundSuccess message is neutral (not auto-execute or manual specific)', () => {
    assert.doesNotMatch(src, /將自動退款|即時退款/)
  })
})
