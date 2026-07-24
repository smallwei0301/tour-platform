'use client';

import { InlineError } from '../../../src/features/midao/ui/InlineError';

export default function MidaoError({ reset }: { error: Error; reset: () => void }) {
  return <InlineError message="祕島導遊後台暫時無法載入" onRetry={reset} />;
}
