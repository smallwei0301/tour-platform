import { ImpersonationBanner } from '../../../src/components/midao/ImpersonationBanner';

export default function MidaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="midao-root">
      <ImpersonationBanner />
      {children}
    </div>
  );
}
