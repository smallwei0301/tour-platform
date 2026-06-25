import { BookingTypesGuide } from '../../../../src/components/help/BookingTypesGuide';

/**
 * 方案預約方式（即時／申請／排程）說明 — 導遊後台。
 * 由方案編輯表單「預約方式」旁的「📖 預約方式說明」連結進入。
 * 內容元件與管理者後台共用：src/components/help/BookingTypesGuide.tsx。
 */
export const metadata = {
  title: '預約方式說明 — 導遊',
};

export default function GuideBookingTypesHelpPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '8px 0 40px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>預約方式說明</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        即時預約／申請預約／排程預約的差異、怎麼選與舉例。
      </p>
      <BookingTypesGuide />
    </div>
  );
}
