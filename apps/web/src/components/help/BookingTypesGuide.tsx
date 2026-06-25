import React from 'react';

/**
 * 三種方案預約方式（booking_type）的說明內容,管理者與導遊後台共用。
 * 由方案編輯表單「預約方式」旁的說明連結進入
 * （/admin/help/booking-types 與 /guide/help/booking-types）。
 * 純展示元件,無 admin/guide 專屬相依,兩個 realm 都可掛載。
 */

const h2Style: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#111827', margin: '0 0 10px' };
const h3Style: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#111827', margin: '14px 0 6px' };
const pStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9, margin: '0 0 8px' };
const liStyle: React.CSSProperties = { fontSize: 13, color: '#374151', lineHeight: 1.9 };
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 };
const thtd: React.CSSProperties = { border: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 13, textAlign: 'left', verticalAlign: 'top', lineHeight: 1.7 };
const noteBox = (bg: string, border: string, color: string): React.CSSProperties => ({
  padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, color, lineHeight: 1.8, margin: '8px 0',
});

function Tag({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700, color, background: bg }}>
      {children}
    </span>
  );
}

export function BookingTypesGuide() {
  return (
    <div style={{ maxWidth: 900 }}>
      {/* 總覽 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>三種預約方式總覽</h2>
        <p style={pStyle}>
          「預約方式」決定旅客<strong>怎麼選時段</strong>、以及訂單<strong>怎麼成立</strong>。核心差別只有兩點:
          時段從哪裡來、以及付款前要不要先過一道關卡。
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 640 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ ...thtd, fontWeight: 700 }}>預約方式</th>
                <th style={{ ...thtd, fontWeight: 700 }}>時段從哪來</th>
                <th style={{ ...thtd, fontWeight: 700 }}>付款前關卡</th>
                <th style={{ ...thtd, fontWeight: 700 }}>成立方式</th>
                <th style={{ ...thtd, fontWeight: 700 }}>適合情境</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={thtd}><Tag color="#166534" bg="#dcfce7">即時預約</Tag></td>
                <td style={thtd}>導遊可預約時段規則(動態產生)</td>
                <td style={thtd}>無</td>
                <td style={thtd}>付款成功 → 自動確認</td>
                <td style={thtd}>希望旅客在你開放的時間內自由挑時段、立即成交</td>
              </tr>
              <tr style={{ background: '#fcfcfd' }}>
                <td style={thtd}><Tag color="#92400e" bg="#fef3c7">申請預約</Tag></td>
                <td style={thtd}>導遊可預約時段規則(動態產生)</td>
                <td style={thtd}><strong>導遊審核</strong></td>
                <td style={thtd}>送出申請 → 導遊通過 → 旅客付款 → 確認</td>
                <td style={thtd}>需要先確認能不能接、再讓旅客付款</td>
              </tr>
              <tr>
                <td style={thtd}><Tag color="#3730a3" bg="#e0e7ff">排程預約</Tag></td>
                <td style={thtd}><strong>預先建立的固定場次</strong></td>
                <td style={thtd}>無</td>
                <td style={thtd}>付款成功 → 自動確認</td>
                <td style={thtd}>固定梯次出團(如每週六 09:00 的團體行程)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 即時預約 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>① 即時預約(instant)</h2>
        <p style={pStyle}>
          旅客在你設定的「可預約時段規則」範圍內自由挑一個時間,填資料、付款,
          <strong>付款成功後系統自動把訂單確認</strong>,不需要你再按確認。
        </p>
        <h3 style={h3Style}>舉例</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={liStyle}>你設定「每週六 09:00–17:00、每 2 小時一個時段」→ 旅客看到 09:00／11:00／13:00／15:00 可選。</li>
          <li style={liStyle}>旅客選 11:00、付款 → 立刻成為「已確認」。</li>
        </ul>
      </div>

      {/* 申請預約 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>② 申請預約(request)</h2>
        <p style={pStyle}>
          時段來源與即時預約相同(動態規則),但<strong>多了一道導遊審核關卡,而且是「先審核後付款」</strong>:
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li style={liStyle}>旅客送出預約申請(此時<strong>不收費</strong>)。</li>
          <li style={liStyle}>導遊在後台審核 → 通過或婉拒。</li>
          <li style={liStyle}>通過 → 系統通知旅客前往付款 → 付款成功後確認。</li>
          <li style={liStyle}>婉拒 → 申請取消,旅客不需付款。</li>
        </ol>
        <h3 style={h3Style}>舉例</h3>
        <p style={pStyle}>
          客製化深度導覽,你想先確認當天能不能接、人數合不合適,再讓旅客付款。旅客送出申請後你收到審核通知,
          按下「通過」後旅客才會收到付款連結。
        </p>
      </div>

      {/* 排程預約 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>③ 排程預約(scheduled)</h2>
        <p style={pStyle}>
          旅客<strong>只能預約你預先建立好的固定場次</strong>(梯次),不能自由挑時間。付款成功後自動確認。
        </p>
        <div style={noteBox('#fffbeb', '#fde68a', '#92400e')}>
          <strong>重要:設成排程預約後,一定要先建立「場次」,旅客才訂得到。</strong>
          沒有建場次的排程方案,旅客頁會顯示「目前沒有開放的預約場次」。
          建立場次的位置:<strong>管理者後台 → 活動編輯頁 → 場次管理 → 新增場次</strong>(可一次批次建立多天)。
        </div>
        <h3 style={h3Style}>舉例</h3>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={liStyle}>無人島一日團,你開固定梯次:6/28(六)09:00、6/29(日)09:00、7/5(六)09:00。</li>
          <li style={liStyle}>旅客只能從這三個梯次挑一個;每個梯次各有自己的名額上限。</li>
        </ul>
      </div>

      {/* 怎麼選 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>怎麼選?</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={liStyle}><strong>固定梯次出團</strong>(時間你說了算、團體共乘)→ 選<Tag color="#3730a3" bg="#e0e7ff">排程預約</Tag>。</li>
          <li style={liStyle}><strong>旅客在開放時間內自由挑、想立即成交</strong> → 選<Tag color="#166534" bg="#dcfce7">即時預約</Tag>。</li>
          <li style={liStyle}><strong>想先確認再收款</strong>(客製、需評估)→ 選<Tag color="#92400e" bg="#fef3c7">申請預約</Tag>。</li>
        </ul>
      </div>

      {/* 注意事項 */}
      <div style={cardStyle}>
        <h2 style={h2Style}>共同注意事項</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={liStyle}>
            <strong>同一位導遊、時間重疊只能接一團。</strong>不論哪種方式,某時段被預約後(即使只是尚未付款的草稿),
            重疊時段就會被擋下,跨方案、跨活動都一樣。
          </li>
          <li style={liStyle}>
            <strong>未付款的草稿會暫時占住時段</strong>,要等該草稿取消後才會釋出。
          </li>
          <li style={liStyle}>
            排程預約的「固定場次」只適用排程方案;即時／申請方案請用「可預約時段規則」,不要另外建固定場次。
          </li>
        </ul>
      </div>
    </div>
  );
}
