/**
 * 旅客提問通知導遊 — sendGuideQuestionNotice（行為）＋ wrapper / route wiring（source-contract）。
 *
 * email.ts 可直接 spawn 載入（無相對 .ts 相依）故跑真實寄送行為；guide-question-notify.ts
 * 與 /api/qa route 為 .ts 且互相 import 其他 .ts，沿用本 repo notify wrapper 既有做法
 * （見 issue1411 order-messages）以 source-contract 鎖 wiring。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const emailPath = new URL('../../src/lib/email.ts', import.meta.url).pathname;
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const notifySrc = read('../../src/lib/guide-question-notify.ts');
const qaRouteSrc = read('../../app/api/qa/route.ts');

// ── 行為：sendGuideQuestionNotice ───────────────────────────────────────────
function runSend(data) {
  const script = `
    const email = await import(${JSON.stringify(emailPath)});
    const sent = [];
    email.__setEmailClientForTest({
      emails: { send: async (args) => { sent.push(args); return { data: { id: 'msg_1' } }; } },
    });
    const r = await email.sendGuideQuestionNotice(${JSON.stringify(data)});
    console.log('JSON_RESULT:' + JSON.stringify({ sent, result: r }));
  `;
  const res = spawnNodeEsm(script, { env: { ...process.env, RESEND_API_KEY: 'test-key' } });
  assert.equal(res.status, 0, res.stderr);
  const line = res.stdout.split('\n').map((l) => l.trim()).find((l) => l.startsWith('JSON_RESULT:'));
  assert.ok(line, `missing JSON_RESULT: ${res.stdout}\n${res.stderr}`);
  return JSON.parse(line.slice('JSON_RESULT:'.length));
}

test('sendGuideQuestionNotice 寄到導遊 email，主旨帶來源標籤，內文含提問', () => {
  const { sent, result } = runSend({
    to: 'guide@example.com',
    guideName: '阿哲',
    sourceLabel: '導遊頁面',
    question: '請問可以客製行程嗎？',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'guide@example.com');
  assert.match(sent[0].subject, /導遊頁面/);
  assert.match(sent[0].html, /請問可以客製行程嗎？/);
  assert.match(sent[0].html, /阿哲/);
  assert.match(sent[0].html, /\/guide\/dashboard/);
});

test('sendGuideQuestionNotice 對提問做 HTML escape（防注入）', () => {
  const { sent } = runSend({
    to: 'g@example.com', guideName: 'G', sourceLabel: '高雄柴山探洞體驗',
    question: '<script>alert(1)</script>',
  });
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].html, /<script>alert\(1\)<\/script>/);
  assert.match(sent[0].html, /&lt;script&gt;/);
});

// ── Wiring：guide-question-notify.ts ─────────────────────────────────────────
test('wrapper 對 sentinel 以 guideId 直查 guide_profiles，來源＝導遊頁面', () => {
  assert.match(notifySrc, /isGuideContactActivityId\(activityId\)/, '應辨識 sentinel');
  assert.match(notifySrc, /parseGuideContactGuideId\(activityId\)/, '應解析 sentinel guideId');
  assert.match(notifySrc, /sourceLabel\s*=\s*'導遊頁面'/, 'sentinel 來源標籤＝導遊頁面');
  assert.match(notifySrc, /from\('guide_profiles'\)[\s\S]*?\.eq\('id'/, '應以 id 查 guide_profiles');
});

test('wrapper 對真實行程：activities → guide_id → guide_profiles，來源＝行程名稱', () => {
  assert.match(notifySrc, /from\('activities'\)[\s\S]*?\.eq\('id',\s*activityId\)/, '應以 activityId 查 activities');
  assert.match(notifySrc, /act\?\.title/, '來源標籤取行程 title');
});

test('wrapper 無導遊 email 時不寄信，且整段 best-effort 不 throw', () => {
  assert.match(notifySrc, /if \(!guideEmail\) return;/, '無 email 應 early return');
  assert.match(notifySrc, /try \{[\s\S]*catch[\s\S]*\}/, '應包 try/catch 永不影響主流程');
});

// ── Wiring：/api/qa POST ─────────────────────────────────────────────────────
test('/api/qa POST insert 成功後呼叫 notifyGuideOfQuestion', () => {
  assert.match(qaRouteSrc, /import \{ notifyGuideOfQuestion \}/, '應 import notifyGuideOfQuestion');
  // 在 insert/error 檢查之後、回傳前呼叫通知
  assert.match(
    qaRouteSrc,
    /if \(error\) \{[\s\S]*?\}\s*[\s\S]*?notifyGuideOfQuestion\(\{[\s\S]*?activityId: activityIdStr[\s\S]*?\}\)/,
    '應於 insert 成功後以 activityIdStr/questionStr 通知導遊',
  );
});
