import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const testDir = dirname(fileURLToPath(import.meta.url))

const readFixture = (relativePath) => {
  return readFileSync(resolve(testDir, '..', '..', relativePath), 'utf8')
}

describe('refund policy v2 copy sync', () => {
  it('legal/refund page uses refund-v2 exact boundaries (>=168h / >72h<168h / <=72h)', () => {
    // legal/refund 已搬進 app/[locale]/legal 並抽文案到 messages（#multilingual）；
    // 退款條款 v2 邊界文字現存於 zh-Hant catalog 的 legalRefund namespace。
    const src = readFixture('messages/zh-Hant.json')
    assert.match(src, /出團\s*168\s*小時前（含）[^\n]*?(?:100%|全額)\s*退款/)
    assert.match(src, /出團前\s*超過\s*72\s*小時且少於\s*168\s*小時取消.*?70%/)
    assert.match(src, /出團前\s*72\s*小時內（含）取消.*?不予退款/)
  })

  it('FAQ page keeps v2 wording', () => {
    // FAQ 頁已搬進 app/[locale]/faq 並抽文案到 messages（#multilingual 全面搬遷）；
    // 退款條款 v2 文字現存於 zh-Hant catalog 的 faq namespace。
    const src = readFixture('messages/zh-Hant.json')
    assert.match(src, /出團\s*168\s*小時前（含）以上取消.*?全額退款/)
    assert.match(src, /出團前\s*超過\s*72\s*小時且少於\s*168\s*小時取消.*?70%/)
    assert.match(src, /出團前\s*72\s*小時內（含）取消.*?不予退款/)
  })

  it('home FaqSection keeps v2 wording', () => {
    const src = readFixture('src/components/home/FaqSection.tsx')
    assert.match(src, /出團\s*168\s*小時前（含）以上可全額退款.*?70%/)
    assert.match(src, /出團前\s*超過\s*72\s*小時且少於\s*168\s*小時可退\s*70%/)
  })
})
