import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const bookingPageSrc = readFileSync(
  path.resolve(ROOT, 'app/booking/[activityId]/page.tsx'),
  'utf-8',
);
const resolverSrc = readFileSync(
  path.resolve(ROOT, 'src/lib/booking-plan-resolver.ts'),
  'utf-8',
);

describe('GH-903 Booking V2 surfaces Traditional-Chinese error messageZh on failure', () => {
  it('V2AvailableSlotsResponse error type now includes messageZh', () => {
    // Locate the error subtype block inside V2AvailableSlotsResponse and check shape.
    assert.match(
      bookingPageSrc,
      /error\?:\s*\{[\s\S]{0,400}?messageZh\?:\s*string;[\s\S]{0,400}?\}/,
      'expected V2AvailableSlotsResponse.error to declare messageZh?: string',
    );
  });

  it('available-slots failure handler prefers error.messageZh over error.message', () => {
    // The fix: setV2Error precedence must read error.messageZh before error.message.
    // Lock the exact ordering so a future refactor cannot silently flip it back.
    assert.match(
      bookingPageSrc,
      /setV2Error\(\s*json\?\.data\?\.messageZh\s*\|\|\s*json\?\.error\?\.messageZh\s*\|\|\s*json\?\.error\?\.message/,
      'expected setV2Error precedence: data.messageZh > error.messageZh > error.message',
    );
  });

  it('resolver still emits a Traditional-Chinese messageZh for AMBIGUOUS_PLAN (unchanged contract)', () => {
    // Regression guard for the resolver contract the UI now consumes.
    assert.match(
      resolverSrc,
      /AMBIGUOUS_PLAN:\s*\{[\s\S]{0,200}?zh:\s*['"]此活動有多個方案/,
    );
  });

  it('precedence helper mirrors UI ordering (data.messageZh > error.messageZh > error.message > default)', () => {
    // Logic-level lock so the precedence rule is verified independently of the source string.
    function deriveErrorMessage(json) {
      return (
        json?.data?.messageZh ||
        json?.error?.messageZh ||
        json?.error?.message ||
        '目前無法載入可預約日期，請稍後再試。'
      );
    }

    // AMBIGUOUS_PLAN: resolver returns Chinese in error.messageZh, English in error.message.
    // Before the fix, UI showed the English string. After the fix, Chinese wins.
    assert.equal(
      deriveErrorMessage({
        success: false,
        error: {
          code: 'AMBIGUOUS_PLAN',
          message: 'Multiple active plans match the requested schedule; cannot resolve unambiguously',
          messageZh: '此活動有多個方案,無法自動判斷,請從活動頁重新選擇明確方案',
        },
      }),
      '此活動有多個方案,無法自動判斷,請從活動頁重新選擇明確方案',
    );

    // data.messageZh wins over both error fields (no-slots case).
    assert.equal(
      deriveErrorMessage({
        success: true,
        data: { messageZh: '此日期已額滿' },
        error: { messageZh: 'should not win', message: 'EN' },
      }),
      '此日期已額滿',
    );

    // Fallback to English when no Chinese is provided.
    assert.equal(
      deriveErrorMessage({ success: false, error: { message: 'Server error' } }),
      'Server error',
    );

    // Final default kicks in when everything is empty.
    assert.equal(
      deriveErrorMessage({ success: false, error: {} }),
      '目前無法載入可預約日期，請稍後再試。',
    );

    // Empty string in messageZh must not be treated as a valid message — the OR short-circuit handles this.
    assert.equal(
      deriveErrorMessage({ success: false, error: { messageZh: '', message: 'EN fallback' } }),
      'EN fallback',
    );
  });
});
