import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this file: tests/api/ -> ../.. -> apps/web/
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const emailSrc = readFileSync(resolve(ROOT, 'src', 'lib', 'email.ts'), 'utf-8');

describe('sendReviewInvitation email source contracts (#1106)', () => {
  it('exports sendReviewInvitation function', () => {
    assert.ok(/export async function sendReviewInvitation/.test(emailSrc));
  });
  it('exports ReviewInvitationData interface', () => {
    assert.ok(/export interface ReviewInvitationData/.test(emailSrc));
  });
  it('ReviewInvitationData has required fields: contactEmail, activityTitle, reviewUrl', () => {
    assert.ok(emailSrc.includes('contactEmail: string'));
    assert.ok(emailSrc.includes('activityTitle: string'));
    assert.ok(emailSrc.includes('reviewUrl: string'));
  });
  it('uses sendEmailWithContract for failure-safe delivery', () => {
    // Extract the sendReviewInvitation function body
    const fnStart = emailSrc.indexOf('export async function sendReviewInvitation');
    const fnBody = emailSrc.slice(fnStart, fnStart + 1000);
    assert.ok(fnBody.includes('sendEmailWithContract'), 'must use failure-safe wrapper');
  });
  it("fn name is 'sendReviewInvitation' in contract call", () => {
    assert.ok(emailSrc.includes("fn: 'sendReviewInvitation'"), 'fn must match for delivery logging');
  });
  it('returns EmailDeliveryResult type', () => {
    assert.ok(/sendReviewInvitation.*Promise<EmailDeliveryResult>/.test(emailSrc));
  });
});
