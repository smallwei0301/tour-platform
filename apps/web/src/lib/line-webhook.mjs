// LINE webhook core handler — Tour Platform (#302b)
//
// Authored as .mjs so it is unit-testable under node:test (the route.ts wrapper
// uses extensionless imports that only the Next bundler resolves). The route
// stays thin: rate-limit + delegate here + always 200.
//
// PII: only lineUserId + event type are persisted (for dedupe). No message text.

import { verifyLineSignature } from './line-messaging.ts';
import {
  upsertLineMapping,
  setLineBlocked,
  markWebhookEventProcessed,
} from './line-binding.mjs';

async function handleEvent(ev) {
  const lineUserId = ev?.source?.userId;
  const type = ev?.type;

  // Idempotency: skip replays of an event we've already processed.
  const { firstTime } = await markWebhookEventProcessed(ev?.webhookEventId, {
    eventType: type,
    lineUserId,
  });
  if (!firstTime) return;

  if (!lineUserId) return;

  switch (type) {
    case 'follow':
      await upsertLineMapping({ lineUserId });
      await setLineBlocked(lineUserId, false);
      break;
    case 'unfollow':
      await setLineBlocked(lineUserId, true);
      break;
    case 'message':
    case 'postback':
      // Register the lineUserId; traveler correlation happens via LIFF verify.
      await upsertLineMapping({ lineUserId });
      break;
    default:
      break;
  }
}

/**
 * Verify + process a raw LINE webhook body.
 * Invalid signatures are NOT processed (prevents forged bindings); the caller
 * still responds 200 so LINE does not retry.
 * @returns {{ verified: boolean, processed: number }}
 */
export async function processLineWebhook(rawBody, signature) {
  if (!verifyLineSignature(rawBody, signature)) {
    return { verified: false, processed: 0 };
  }

  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return { verified: true, processed: 0 };
  }

  const events = Array.isArray(body?.events) ? body.events : [];
  let processed = 0;
  for (const ev of events) {
    try {
      await handleEvent(ev);
      processed += 1;
    } catch {
      // Never let one event failure block the others / the 200 response.
    }
  }
  return { verified: true, processed };
}
