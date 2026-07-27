import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { MidaoShell } from '../../../src/features/midao/shell/MidaoShell';
import { isMidaoE2ELocal } from '../../../src/config/feature-flags.mjs';
import { resolveMidaoPageSession } from '../../../src/lib/midao/page-session';
import '../../../src/features/midao/styles/tokens.css';
import '../../../src/features/midao/styles/shell.css';

export default async function MidaoLayout({ children }: { children: React.ReactNode }) {
  const incoming = await headers();
  const request = new Request('http://midao.local/midao', {
    headers: { cookie: incoming.get('cookie') || '' },
  });
  const result = await resolveMidaoPageSession(request);
  if (isMidaoE2ELocal() && result.kind !== 'ready') {
    console.error(`MIDAO_E2E_PAGE_SESSION=${result.reason}`);
  }
  if (result.kind === 'redirect') redirect(result.location);
  if (result.kind === 'denied') notFound();

  return (
    <div data-testid="midao-root">
      <MidaoShell
        title="祕島導遊後台"
        subtitle={`歡迎回來，${result.session.guideName}`}
        impersonation={result.impersonation}
      >
        {children}
      </MidaoShell>
    </div>
  );
}
