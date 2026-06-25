import React from 'react';
import { Card, PageHeader } from '../../../../src/components/admin/ui';

/**
 * 例外開放衝突時段（conflict override）逐步操作說明 — 後台。
 * 由導遊詳情頁的「📖 例外開放衝突時段說明」連結進入。
 * 對應功能:/admin/guides/[guideId]/availability 的「例外開放此場」。
 */
export const metadata = {
  title: '例外開放衝突時段說明 — 後台',
};

const h2Style: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 10px' };
const pStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9, margin: '0 0 8px' };
const liStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9 };
const codeStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 };
const noteBox = (bg: string, border: string, color: string): React.CSSProperties => ({
  padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, color, lineHeight: 1.8, margin: '8px 0',
});

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ ...liStyle, marginBottom: 6 }}>
      <strong style={{ color: '#1B6B4A' }}>步驟 {n}：</strong> {children}
    </li>
  );
}

export default function ConflictOverrideGuidePage() {
  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="例外開放衝突時段說明" subtitle="導遊找到幫手等情況下,管理者繞過衝突阻擋、為旅客加開時段（含跨方案加開）" />

      <div className="admin-page" style={{ maxWidth: 880 }}>
        {/* 這是什麼 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section>
            <h2 style={h2Style}>這個功能在做什麼</h2>
            <p style={pStyle}>
              當某時段已被既有預約占用時,系統會把<strong>同一位導遊、時間重疊</strong>的其他時段擋下(顯示「既有衝突」),
              避免一人接兩團。但有時你確實要加開——例如<strong>導遊臨時找到幫手</strong>,想在已有半日團的那天再加開一個全日方案。
              「例外開放」就是讓管理者<strong>在留下原因與幫手狀態紀錄的前提下,人工繞過這道衝突阻擋</strong>。
            </p>
            <div style={noteBox('#eff6ff', '#bfdbfe', '#1e40af')}>
              支援<strong>跨方案加開</strong>:被半日團擋住的那天,可以加開「全日方案」給旅客預約。即時、申請、排程三種方案都適用。
            </div>
          </section>
        </Card>

        {/* 前提 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section>
            <h2 style={h2Style}>開始前的前提</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}>該時段必須<strong>確實有重疊的既有預約</strong>(這正是被擋下的原因);沒有衝突的時段不需要、也無法例外開放。</li>
              <li style={liStyle}>例外開放只繞過「<strong>既有預約衝突</strong>」。<strong>不會</strong>繞過導遊休假(黑名單)、不在開放季節、或名額已滿——這些仍會擋。</li>
            </ul>
          </section>
        </Card>

        {/* 逐步操作 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section>
            <h2 style={h2Style}>逐步操作</h2>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <Step n={1}>
                進入該導遊的<strong>時間管理</strong>頁(導遊詳情頁的「📅 時間管理」,即 <span style={codeStyle}>/admin/guides/[導遊]/availability</span>)。
              </Step>
              <Step n={2}>捲到「<strong>時段預覽</strong>」區塊。</Step>
              <Step n={3}>
                在「<strong>預覽方案篩選</strong>」下拉<strong>選擇你要加開的方案</strong>(例如「全日方案」)。
                <em>　此步必做——沒有選具體方案,加開按鈕不會出現。</em>
              </Step>
              <Step n={4}>設定<strong>預覽日期範圍</strong>,涵蓋要加開的那一天,按「<strong>更新預覽</strong>」。</Step>
              <Step n={5}>
                預覽列出各時段。被擋住的會標「<strong>既有衝突</strong>」,其下方有紫色按鈕「<strong>例外開放此場</strong>」→ 點它。
              </Step>
              <Step n={6}>
                在「例外開放衝突時段」視窗填寫:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li style={liStyle}><strong>例外開放原因</strong>(必填,例:「導遊找到幫手,加開全日」)。</li>
                  <li style={liStyle}>勾選「<strong>需要助手</strong>」→「<strong>助手狀態</strong>」選「需要助手」。</li>
                  <li style={liStyle}><strong>導遊可見備註</strong>:寫給導遊看的提醒,例:「已找到幫手李小幫,請協調」。</li>
                  <li style={liStyle}>(選填)<strong>內部管理備註</strong>:只有後台看得到,不會給導遊或旅客。</li>
                </ul>
              </Step>
              <Step n={7}>按「<strong>確認例外開放</strong>」。該時段會變成「<strong>管理員覆寫後可開放</strong>」。</Step>
            </ol>
          </section>
        </Card>

        {/* 之後會怎樣 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section>
            <h2 style={h2Style}>加開之後會發生什麼</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}><strong>旅客端</strong>:該時段變成可預約,旅客可正常下單、付款。</li>
              <li style={liStyle}><strong>訂單紀錄</strong>:該筆預約會保留例外開放的原因與幫手狀態快照,供日後查核。</li>
              <li style={liStyle}>
                <strong>導遊端</strong>:導遊會在訂單詳情看到「此預約涉及衝突例外時段」的提醒與你寫的「導遊可見備註」
                (內部管理備註不會外洩)。
              </li>
            </ul>
            <div style={noteBox('#fffbeb', '#fde68a', '#92400e')}>
              目前導遊是在<strong>訂單詳情頁被動看到</strong>提醒,系統尚未主動寄信／推播通知導遊,導遊端也尚無「確認/婉拒幫手」按鈕。
              加開後建議另以既有管道(電話／訊息)知會導遊確認幫手到位。
            </div>
          </section>
        </Card>
      </div>
    </div>
  );
}
