// 互動式裁切的純幾何運算（導遊大頭照／封面共用）。
//
// 為什麼抽成獨立純函式：裁切框的縮放、平移、邊界夾擠與「畫到 canvas 的
// 來源矩形」全是無 DOM 依賴的數學，抽出來才能用 node --test 直接驗證
// （見 tests/unit/guide-avatar-crop-geometry.test.mjs），UI 元件只負責
// 綁定指標事件與呼叫這些函式。
//
// 座標系說明（皆以裁切框 viewport 左上角為原點，單位為顯示像素）：
//   - 影像以 object-fit: cover 的方式至少填滿 viewport；scale 為「自然像素
//     → 顯示像素」的倍率。
//   - offset 為影像左上角相對 viewport 左上角的位移（恆為 0 或負值，因為
//     影像必須完全覆蓋 viewport）。
//   - viewport 內任一點 p 對應到的影像來源座標為 (p - offset) / scale。

export type Offset = { x: number; y: number };
export type SourceRect = { sx: number; sy: number; sw: number; sh: number };

/**
 * cover 模式的基準倍率：讓自然尺寸的影像剛好填滿（覆蓋）viewport。
 * zoom = 1 時用此倍率，zoom > 1 進一步放大。
 */
export function coverBaseScale(natW: number, natH: number, viewW: number, viewH: number): number {
  if (natW <= 0 || natH <= 0) return 1;
  return Math.max(viewW / natW, viewH / natH);
}

/**
 * 夾擠位移，確保放大／平移後影像仍完全覆蓋 viewport（不露出底色）。
 * 顯示尺寸 dispW/dispH 必 >= viewport，故合法區間為 [view - disp, 0]。
 */
export function clampOffset(
  x: number,
  y: number,
  dispW: number,
  dispH: number,
  viewW: number,
  viewH: number,
): Offset {
  const minX = Math.min(0, viewW - dispW);
  const minY = Math.min(0, viewH - dispH);
  return {
    x: Math.min(0, Math.max(minX, x)),
    y: Math.min(0, Math.max(minY, y)),
  };
}

/**
 * 由目前的位移與倍率，換算出要從原圖擷取、再畫到輸出 canvas 的來源矩形。
 */
export function sourceRect(
  offsetX: number,
  offsetY: number,
  scale: number,
  viewW: number,
  viewH: number,
): SourceRect {
  const s = scale > 0 ? scale : 1;
  return {
    sx: -offsetX / s,
    sy: -offsetY / s,
    sw: viewW / s,
    sh: viewH / s,
  };
}

/**
 * 以 viewport 中心為錨點縮放：改變倍率時，維持中心對準的影像點不動，
 * 縮放手感才自然（slider 拉動時不會「往左上飄」）。回傳「未夾擠」的新位移，
 * 呼叫端應再以 clampOffset 收斂。
 */
export function zoomAboutCenter(
  prev: Offset,
  prevScale: number,
  nextScale: number,
  viewW: number,
  viewH: number,
): Offset {
  const ps = prevScale > 0 ? prevScale : 1;
  const centerSrcX = (viewW / 2 - prev.x) / ps;
  const centerSrcY = (viewH / 2 - prev.y) / ps;
  return {
    x: viewW / 2 - centerSrcX * nextScale,
    y: viewH / 2 - centerSrcY * nextScale,
  };
}
