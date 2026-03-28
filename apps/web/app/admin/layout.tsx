import type { ReactNode } from 'react';
import { AdminSessionBar } from '../../src/components/admin/AdminSessionBar';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminSessionBar />
      {children}
    </>
  );
}
