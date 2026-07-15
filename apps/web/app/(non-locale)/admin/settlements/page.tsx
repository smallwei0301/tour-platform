// 結算 / 出款管理已整合於 /admin/payouts，本路由作為相容別名導向該頁。
import { redirect } from 'next/navigation';

export default function SettlementsPage() {
  redirect('/admin/payouts');
}
