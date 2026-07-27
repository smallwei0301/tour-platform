import type { ReactNode } from 'react';
import { ImpersonationBanner, type VerifiedImpersonation } from '../../../components/midao/ImpersonationBanner';
import { MidaoBottomNav } from './MidaoBottomNav';
import { MidaoDesktopSidebar } from './MidaoDesktopSidebar';
import { MidaoPageHeader } from './MidaoPageHeader';

interface MidaoShellProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  impersonation?: VerifiedImpersonation | null;
  children: ReactNode;
}

export function MidaoShell({ title, subtitle, action, impersonation = null, children }: MidaoShellProps) {
  return (
    <div className="midao-theme midao-shell">
      <MidaoDesktopSidebar />
      <div className="midao-shell__workspace">
        <ImpersonationBanner impersonation={impersonation} />
        <MidaoPageHeader title={title} subtitle={subtitle} action={action} />
        <main className="midao-shell__content">{children}</main>
      </div>
      <MidaoBottomNav />
    </div>
  );
}
