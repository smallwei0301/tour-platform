import type { ReactNode } from 'react';

interface MidaoPageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function MidaoPageHeader({ title, subtitle, action }: MidaoPageHeaderProps) {
  return (
    <header className="midao-page-header">
      <div>
        <h1 className="midao-heading">{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action ? <div className="midao-page-header__action">{action}</div> : null}
    </header>
  );
}
