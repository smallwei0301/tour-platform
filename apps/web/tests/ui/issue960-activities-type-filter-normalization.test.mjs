import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeActivityTypeForFilter,
  isActivityTypeMatch,
  isActivityTypeKeywordMatch,
  resolveCanonicalType,
} from '../../src/lib/activity-type-filter.mjs';

test('normalizes plus/space/emoji mismatch for URL type restore', () => {
  assert.equal(normalizeActivityTypeForFilter('柴山探洞+🔦'), '柴山探洞');
  assert.equal(normalizeActivityTypeForFilter('柴山探洞 🔦'), '柴山探洞');
  assert.equal(normalizeActivityTypeForFilter('柴山探洞'), '柴山探洞');
});

test('matches category when URL type carries emoji metadata', () => {
  assert.equal(isActivityTypeMatch('柴山探洞', '柴山探洞+🔦'), true);
  assert.equal(isActivityTypeMatch('柴山探洞 🔦', '柴山探洞+🔦'), true);
  assert.equal(isActivityTypeMatch('溯溪', '柴山探洞+🔦'), false);
});

test('restores canonical checkbox label from encoded URL type', () => {
  const options = ['文化歷史', '美食體驗', '戶外冒險', '柴山探洞 🔦', '溯溪 🌊'];
  assert.equal(resolveCanonicalType(options, '柴山探洞+🔦'), '柴山探洞 🔦');
  assert.equal(resolveCanonicalType(options, '柴山探洞%20🔦'), '柴山探洞 🔦');
});

test('falls back to keyword match when category metadata drifts', () => {
  const activity = {
    title: '高雄柴山探洞體驗',
    tagline: '在地嚮導帶路',
    shortDescription: '熱門洞穴路線',
  };

  assert.equal(isActivityTypeMatch('戶外冒險', '柴山探洞 🔦'), false);
  assert.equal(isActivityTypeKeywordMatch(activity, '柴山探洞 🔦'), true);
});
