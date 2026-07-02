/**
 * 純函式：管理活動照片（gallery）陣列的排序／增刪。
 *
 * 活動照片在 app 層以 `imageUrls: string[]` 儲存（見 db.mjs `image_urls`）。
 * 這些 helper 讓 UI 只需操作索引，不必自行處理 splice 邊界條件，
 * 並保證回傳「新陣列」而不 mutate 原陣列（配合 React state 更新）。
 */

function clampIndex(length: number, index: number): number {
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

/**
 * 把 `from` 位置的照片移動到 `to` 位置（drag-and-drop drop 用）。
 * 索引超出範圍會被夾到合法區間；`from === to` 或空陣列時回傳原順序的複本。
 */
export function reorderImage(urls: string[], from: number, to: number): string[] {
  const next = [...urls];
  if (next.length < 2) return next;
  const safeFrom = clampIndex(next.length, from);
  const safeTo = clampIndex(next.length, to);
  if (safeFrom === safeTo) return next;
  const [moved] = next.splice(safeFrom, 1);
  next.splice(safeTo, 0, moved);
  return next;
}

/**
 * 相對移動：`delta` 為正往後、為負往前（←／→ 或 ▲／▼ 按鈕用）。
 * 已在邊界時回傳原順序的複本（no-op），呼叫端不必先判斷。
 */
export function moveImageBy(urls: string[], index: number, delta: number): string[] {
  if (index < 0 || index >= urls.length) return [...urls];
  return reorderImage(urls, index, index + delta);
}

/** 移除指定索引的照片；索引不合法時回傳原順序的複本。 */
export function removeImageAt(urls: string[], index: number): string[] {
  if (index < 0 || index >= urls.length) return [...urls];
  return urls.filter((_, i) => i !== index);
}
