import type { ReactNode } from 'react';
import { MidaoBottomNav } from './MidaoBottomNav';
import { MidaoDesktopSidebar } from './MidaoDesktopSidebar';
import { MidaoImpersonationBanner, type VerifiedImpersonation } from './MidaoImpersonationBanner';
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
        <MidaoImpersonationBanner impersonation={impersonation} />
        <MidaoPageHeader title={title} subtitle={subtitle} action={action} />
        <main className="midao-shell__content">{children}</main>
      </div>
      <MidaoBottomNav />
    </div>
  );
}
