import { PageHeader } from '../../../../../src/components/admin/ui';
import { BookingTypesGuide } from '../../../../../src/components/help/BookingTypesGuide';

/**
 * 方案預約方式（即時／申請／排程）說明 — 後台。
 * 由方案管理表單「預約方式」旁的「📖 預約方式說明」連結進入。
 * 內容元件與導遊後台共用：src/components/help/BookingTypesGuide.tsx。
 */
export const metadata = {
  title: '預約方式說明 — 後台',
};

export default function AdminBookingTypesHelpPage() {
  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <PageHeader title="預約方式說明" subtitle="即時預約／申請預約／排程預約的差異、怎麼選與舉例" />
      <div className="admin-page">
        <BookingTypesGuide />
      </div>
    </div>
  );
}
