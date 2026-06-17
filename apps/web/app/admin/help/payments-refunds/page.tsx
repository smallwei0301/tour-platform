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

        {/* 4. 異常處理 */}
        <Card style={{ padding: 20, marginBottom: 16 }}>
          <section style={sectionStyle}>
            <h2 style={h2Style}>④ 異常處理與常見問題</h2>

            <div style={noteBox('#fef2f2', '#fecaca', '#991b1b')}>
              <strong>請勿用「狀態下拉」手動改成「取消／退款中」來退款。</strong>
              下拉只改訂單狀態，<strong>不會</strong>釋放名額、<strong>不會</strong>建立退款申請；
              改完後訂單還會被鎖定，造成「退款管理看不到、執行退款也失敗」的孤兒訂單。請改用「取消＋退款」按鈕。
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
