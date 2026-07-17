import '../../../src/styles/admin-console.css'; // #1735 route-scoped（拆自 globals.css）
import type { ReactNode } from 'react';
import { AdminShell } from '../../../src/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
