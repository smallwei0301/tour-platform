import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(WEB_ROOT, relPath), 'utf8');
}

test('guide bookings detail modal wires dialog focus management and keyboard controls', async () => {
  const src = await readSource('app/guide/bookings/page.tsx');

  assert.match(src, /const triggerRef = useRef<HTMLElement \| null>\(null\)/);
  assert.match(src, /const detailRequestIdRef = useRef\(0\)/);
  assert.match(src, /const detailDialogOpen = selected !== null \|\| detailLoading/);
  assert.match(src, /if \(trigger\) triggerRef\.current = trigger/);
  assert.match(src, /const requestId = detailRequestIdRef\.current \+ 1/);
  assert.match(src, /detailRequestIdRef\.current = requestId/);
  assert.match(src, /if \(detailRequestIdRef\.current !== requestId\) return/);
  assert.match(src, /if \(detailRequestIdRef\.current === requestId\) \{/);
  assert.match(src, /detailRequestIdRef\.current \+= 1/);
  assert.match(src, /setDetailLoading\(false\);/);
  assert.match(src, /if \(!detailDialogOpen\) \{/);
  assert.match(src, /triggerRef\.current\.focus\(\)/);
  assert.match(src, /const dialog = dialogRef\.current/);
  assert.match(src, /if \(!\(dialog instanceof HTMLElement\)\) return/);
  assert.match(src, /const dialogEl: HTMLElement = dialog/);
  assert.match(src, /const initialFocus = closeButtonRef\.current \|\| focusables\[0\] \|\| dialogEl/);
  assert.match(src, /if \(event\.key === 'Escape'\)/);
  assert.match(src, /if \(event\.key !== 'Tab'\) return/);
  assert.match(src, /if \(!event\.shiftKey && active === last\)/);
  assert.match(src, /else if \(event\.shiftKey && active === first\)/);
  assert.match(src, /else if \(active instanceof HTMLElement && !dialogEl\.contains\(active\)\)/);
  assert.match(src, /\}, \[detailDialogOpen, detailLoading, selected\]\);/);
});

test('guide bookings detail modal keeps a11y semantics and close button focus target', async () => {
  const src = await readSource('app/guide/bookings/page.tsx');

  assert.match(src, /role="dialog" aria-modal="true" aria-labelledby="booking-detail-modal-title" tabIndex=\{-1\}/);
  assert.match(src, /<button ref=\{closeButtonRef\} aria-label="關閉" onClick=\{closeDetail\}/);
  assert.match(src, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); openDetail\(b\.id, e\.currentTarget\); \}\}/);
});
