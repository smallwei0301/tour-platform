import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const api = read('src/features/midao/services/service-api.ts');
const wizard = read('src/features/midao/services/ServiceWizard.tsx');
const publish = read('src/features/midao/services/ServicePublishAction.tsx');
const types = read('src/features/midao/services/service-types.ts');

const legacyOrigin = 'legacy_activity';
const legacyDisclosure = '只帶入既有服務文字';
const reviewDisclosure = '未安全套用';
const lifecycleDisclosure = '方案與檔期的後續決策完成前，無法發布';

test('draft client preserves the materialization provenance contract without parsing legacy overlays', () => {
  assert.match(types, /materializationOrigin: string;/u);
  assert.match(types, /materializationReviewState: string \| null;/u);
  assert.match(api, /normalizeDraftResponseData\(envelope\.data\)/u);
  assert.match(api, /materializationOrigin/u);
  assert.match(api, /materializationReviewState/u);
  assert.doesNotMatch(api, /pending_changes|pendingChanges|overlay/iu);
});

test('existing activity edit never hydrates an absent draft into an editable empty wizard', () => {
  assert.match(wizard, /if \(!response\.draft && requireDraft\) throw new Error\(/u);
  assert.match(wizard, /草稿尚未準備完成/u);
  assert.match(wizard, /if \(response\.draft\) \{\s+applyDraft\(response\.draft, response\.publicationPreview\);/u);
  assert.match(wizard, /loadDraft\(id, Boolean\(initialActivityId\)\)/u);
  assert.match(wizard, /setLoadAttempt\(\(current\) => current \+ 1\)/u);
  assert.match(wizard, /href="\/midao\/services"/u);
});

test('legacy-origin drafts disclose preserved images and plans, unresolved lifecycle, and unsafe overlay review', () => {
  assert.match(wizard, new RegExp(`materializationOrigin === '${legacyOrigin}'`, 'u'));
  assert.match(wizard, new RegExp(legacyDisclosure, 'u'));
  assert.match(wizard, /圖片不會在這裡被替換或編輯/u);
  assert.match(wizard, /既有方案與檔期維持不變/u);
  assert.match(wizard, new RegExp(lifecycleDisclosure, 'u'));
  assert.match(wizard, /materializationReviewState === 'needs_review'/u);
  assert.match(wizard, new RegExp(reviewDisclosure, 'u'));
});

test('legacy-origin drafts visibly disable publish while server 409 remains represented as an error', () => {
  assert.match(wizard, /disabled=\{!canPublish \|\| isLegacyMaterialized\}/u);
  assert.match(wizard, /伺服器端仍會阻擋發布/u);
  assert.match(publish, /details\.status === 422/u);
  assert.match(publish, /details\.message/u);
});
