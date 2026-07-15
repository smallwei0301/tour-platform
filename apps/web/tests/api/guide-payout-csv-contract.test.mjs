import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// cwd 無關的路徑基準（run-checks.sh 從 repo root 跑、npm test 從 apps/web 跑皆可）
const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('guide payout CSV route contract', () => {
  const src = readFileSync(path.join(WEB_ROOT, 'app/api/v2/guide/payout/monthly/csv/route.ts'), 'utf8')

  it('only exports GET and dynamic', () => {
    assert.match(src, /export.*GET/)
    assert.match(src, /export.*dynamic/)
    // No extra named exports besides GET and dynamic
    const exportedFunctions = [...src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(m => m[1])
    const exportedConsts = [...src.matchAll(/^export\s+const\s+(\w+)/gm)].map(m => m[1])
    const allExports = [...exportedFunctions, ...exportedConsts]
    for (const name of allExports) {
      assert.ok(name === 'GET' || name === 'dynamic', `Unexpected export: ${name}`)
    }
  })
  it('returns text/csv content type', () => {
    assert.match(src, /text\/csv/)
  })
  it('sets Content-Disposition with filename', () => {
    assert.match(src, /Content-Disposition/)
    assert.match(src, /payout-/)
  })
  it('uses verifyGuideSession', () => {
    assert.match(src, /verifyGuideSession/)
  })
  it('validates month param', () => {
    assert.match(src, /\d{4}.*0\[1-9\]|month/)
  })
})

describe('page wiring', () => {
  const page = readFileSync(path.join(WEB_ROOT, 'app/(non-locale)/guide/dashboard/page.tsx'), 'utf8')
  it('page has CSV download link', () => {
    assert.match(page, /payout\/monthly\/csv/)
  })
  it('page shows 下載 CSV text', () => {
    assert.match(page, /下載\s*CSV/)
  })
})
