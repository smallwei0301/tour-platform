import React from 'react';
import { Card, PageHeader, StatusBadge } from '../../../../src/components/admin/ui';

/**
 * 後台金流／退款處理使用說明（ECPay vs 現金、正常流程與異常處理）。
 * 由訂單詳情頁的「📖 金流／退款處理說明」連結進入。內容對應
 * docs/operations/admin-payments-refunds-guide.md，更新時請兩處同步。
 */
export const metadata = {
  title: '金流／退款處理說明 — 後台',
};

const sectionStyle: React.CSSProperties = { marginBottom: 18 };
const h2Style: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 10px' };
const pStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9, margin: '0 0 8px' };
const liStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9 };
const codeStyle: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 };
const noteBox = (bg: string, border: string, color: string): React.CSSProperties => ({
  padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, color, lineHeight: 1.8, margin: '0 0 8px',
});

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ ...liStyle, marginBottom: 4 }}>
      <strong style={{ color: '#1B6B4A' }}>步驟 {n}：</strong> {children}
    </li>
  );
}

export default function PaymentsRefundsGuidePage() {
  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="金流／退款處理說明" subtitle="ECPay 與現金訂單的正常流程與異常處理（維運用）" />

      <div className="admin-page" style={{ maxWidth: 860 }}>
        {/* 1. 訂單金流類型識別 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>① 先分辨：ECPay 訂單 vs 現金訂單</h2>
            <p style={pStyle}>
              系統以訂單的 <span style={codeStyle}>trade_no</span> 欄位判斷金流類型，兩者的退款處理方式不同：
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}>
                <strong>ECPay 線上付款訂單</strong>：有 <span style={codeStyle}>trade_no</span>（ECPay 交易序號）。退款需透過 ECPay API 沖銷／退刷。
              </li>
              <li style={liStyle}>
                <strong>現金／線下訂單</strong>：<span style={codeStyle}>trade_no</span> 為空。退款由維運人工結案（系統只記錄狀態，金錢於線下處理）。
              </li>
            </ul>
            <div style={{ ...noteBox('#eff6ff', '#bfdbfe', '#1e40af'), marginTop: 10 }}>
              訂單詳情下方的「付款紀錄 trade_no」區塊可確認是否為 ECPay 訂單；退款執行時系統會自動依此選擇 ECPay 沖銷或現金結案。
            </div>
          </section>
        </Card>

        {/* 2. 正常流程 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>② 正常流程（無退款）</h2>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>ECPay 線上付款</p>
            <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              <Step n={1}>旅客送出訂單 → <StatusBadge status="pending_payment" /> 占用名額等待付款。</Step>
              <Step n={2}>ECPay 付款成功 callback → 自動轉 <StatusBadge status="paid" />（計入 GMV、發通知）。</Step>
              <Step n={3}>（可選）維運／導遊確認 → <StatusBadge status="confirmed" />。</Step>
              <Step n={4}>行程結束 → <StatusBadge status="completed" />；唯一進入出帳結算的狀態，並觸發評價邀請。</Step>
            </ol>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>現金／線下付款</p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <Step n={1}>建立訂單 → <StatusBadge status="pending_payment" />。</Step>
              <Step n={2}>收到現金後，維運於訂單詳情把狀態改為 <StatusBadge status="paid" /> 並儲存。</Step>
              <Step n={3}>行程結束 → <StatusBadge status="completed" />。</Step>
            </ol>
          </section>
        </Card>

        {/* 3. 退款流程 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>③ 退款流程（正常）</h2>
            <div style={noteBox('#fffbeb', '#fde68a', '#92400e')}>
              <strong>重點觀念：</strong>「退款管理」頁面列的是<strong>退款申請（refund_requests）</strong>，
              不是「狀態為退款中的訂單」。只有真正建立退款申請，訂單才會出現在退款管理。
            </div>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>建立退款的兩個正規入口</p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              <li style={liStyle}><strong>旅客自行申請退款</strong> → 自動建立退款申請、訂單轉 <StatusBadge status="refund_pending" />。</li>
              <li style={liStyle}>
                <strong>後台「取消＋退款」</strong>（訂單詳情按鈕）→ 一次完成：取消訂單、釋放名額、建立<strong>全額</strong>退款記錄並結案為 <StatusBadge status="refunded" />。
              </li>
            </ul>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>「執行退款」按鈕（訂單已是退款中時）</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}>訂單為 <StatusBadge status="refund_pending" /> 時，詳情下方出現「執行退款」。</li>
              <li style={liStyle}><strong>ECPay 訂單</strong>：系統自動向 ECPay 送出全額沖銷／退刷，成功後轉 <StatusBadge status="refunded" />。</li>
              <li style={liStyle}><strong>現金訂單</strong>：必須填寫退款原因，按下後系統標記為已退款（金錢於線下退還）。</li>
            </ul>
          </section>
        </Card>

        {/* 3.5 部分退款機制（現況） */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>④ 部分退款機制（目前現況）</h2>

            <div style={noteBox('#fffbeb', '#fde68a', '#92400e')}>
              <strong>一句話：平台目前「有部分退款的政策計算與預覽，但執行端一律退全額」。</strong>
              需要部分退款時，請見下方維運處置。
            </div>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>① 退款政策（會算出部分比例）</p>
            <p style={pStyle}>
              系統有分層退款政策（資料表 <span style={codeStyle}>refund_policies</span>，欄位 <span style={codeStyle}>tiers</span>），
              依「距出發剩餘時數」決定可退比例（<span style={codeStyle}>refund_pct</span>）。例如：愈早取消退愈多、接近出發退較少或不退。
              計算函式為 <span style={codeStyle}>calculateRefundAmount()</span>，回傳 <span style={codeStyle}>refundable_amount</span>（部分金額）。
            </p>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>② 旅客預覽與快照</p>
            <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
              <li style={liStyle}>旅客申請退款前，會透過退款預覽（refund-preview）看到「預計可退金額／比例」。</li>
              <li style={liStyle}>送出申請當下，會把該比例快照寫入 <span style={codeStyle}>refund_requests.policy_snapshot</span>（保存當時報價）。</li>
            </ul>

            <div style={noteBox('#fef2f2', '#fecaca', '#991b1b')}>
              <strong>⚠️ 重要落差：實際「執行退款」目前一律退全額（{`total_twd`}）。</strong>
              不論是 ECPay 全額沖銷（AllRefund）、現金結案、或「取消＋退款」，都是退全額；
              <strong>政策算出的 <span style={codeStyle}>refundable_amount</span>（部分比例）目前不會被執行端採用</strong>
              （即使開啟自動退款 <span style={codeStyle}>REFUND_AUTO_EXECUTE</span>，該值也只用來判斷「是否可退／是否大於 0」，實退仍為全額）。
              因此「部分退款」目前<strong>尚未有端到端的自動執行能力</strong>。
            </div>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>③ 需要部分退款時的維運處置</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}><strong>暫不要</strong>用「取消＋退款」或「執行退款」按鈕（那會退全額）。</li>
              <li style={liStyle}>
                <strong>ECPay 訂單</strong>：ECPay 的 DoAction 退款 API 技術上支援指定金額，但本平台目前固定帶全額。
                需部分退款請先於 <strong>ECPay 廠商後台</strong>手動執行指定金額退刷，再於本後台該訂單 <strong>Admin Note</strong> 記錄實退金額與原因（保留稽核）。
              </li>
              <li style={liStyle}>
                <strong>現金訂單</strong>：於線下退還部分金額後，同樣在 Admin Note 記錄實退金額與原因。
              </li>
              <li style={liStyle}>
                出帳結算公式為 <span style={codeStyle}>(總額 − 已退款) × 85%</span>，已支援部分金額；但目前沒有寫入「部分 <span style={codeStyle}>refunded_amount</span>」的入口，
                若部分退款需正確反映導遊出帳，請聯繫工程協助調整 <span style={codeStyle}>refunded_amount</span>。
              </li>
            </ul>
          </section>
        </Card>

        {/* 4. 異常處理 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>⑤ 異常處理與常見問題</h2>

            <div style={noteBox('#fef2f2', '#fecaca', '#991b1b')}>
              <strong>「狀態下拉」已停用「取消／退款中／已退款」等終端狀態（防呆）。</strong>
              這些狀態若用下拉手動設定，只會改狀態、<strong>不會</strong>釋放名額也<strong>不會</strong>建立退款申請，
              會造成「退款管理看不到、執行退款也失敗」的孤兒訂單；因此前端已停用、後端也會擋下（回 409）。
              退款一律改用「<strong>取消＋退款</strong>」按鈕或退款中訂單的「執行退款」。
            </div>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>鎖定（terminal）狀態</p>
            <p style={pStyle}>
              下列狀態切換後訂單即鎖定、無法再用下拉編輯：
              <StatusBadge status="completed" /> <StatusBadge status="refunded" /> <StatusBadge status="refund_pending" />{' '}
              <StatusBadge status="cancelled_by_user" /> <StatusBadge status="cancelled_by_guide" />。
              若需退款請走上述正規入口。
            </p>

            <p style={{ ...pStyle, fontWeight: 600, color: '#111827' }}>「執行退款」失敗時的常見錯誤</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li style={liStyle}><span style={codeStyle}>INVALID_STATUS</span>：訂單不在退款中、或已無可沖銷記錄 → 改走「退款管理」人工處理。</li>
              <li style={liStyle}><span style={codeStyle}>REASON_REQUIRED</span>：現金訂單未填退款原因。</li>
              <li style={liStyle}><span style={codeStyle}>PAYMENT_NOT_REVERSIBLE</span>：找不到可沖銷付款或多筆無法判定 → 人工處理。</li>
              <li style={liStyle}><span style={codeStyle}>ECPAY_*</span>：ECPay 查詢／沖銷失敗 → 稍後再試或改人工退款。</li>
              <li style={liStyle}><span style={codeStyle}>DB_UPDATE_FAILED</span>：資料庫寫入失敗，退款未完成 → 重試。</li>
            </ul>
          </section>

          <div style={{ ...noteBox('#f0fdf4', '#86efac', '#166534'), marginTop: 8 }}>
            <strong>一句話結論：</strong>要退款就用「取消＋退款」按鈕（進行中訂單）或「執行退款」按鈕（已是退款中），
            不要手動拉狀態。退款管理頁是審核／追蹤退款申請用的，不是改訂單狀態用的。
          </div>
        </Card>
      </div>
    </div>
  );
}
