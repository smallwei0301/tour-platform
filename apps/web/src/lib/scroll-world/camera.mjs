/**
 * 3D 滾動首頁（/world）相機引擎 — 純函式層。
 *
 * 概念移植自 oso95/scroll-world 的 scrub 引擎：滾動進度驅動一台「只前進」的
 * 攝影機，自每個場景外部飛入內部（linger 停留），再無縫飛向下一景。
 * 原作以預渲染影片 scrub 實現；本站無影片素材，改以 CSS 3D（perspective +
 * translateZ）實現，因此把「滾動進度 → 相機 Z 位置／場景可見度」的數學
 * 抽成本檔純函式，client 元件與 node --test 共用（.mjs＝免編譯直測）。
 */

/** 相鄰場景在 Z 軸上的間距（px）。 */
export const SCENE_DEPTH = 1400;

/** 每景停留（linger）權重；一段景到景的飛行權重＝1。 */
export const DEFAULT_LINGER = 0.45;

/** 平滑插值（Hermite）：讓每段飛行有進出景的加減速。 */
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/**
 * 滾動進度 → 相機 Z 位置。
 *
 * 節奏軸為「停留、飛行」交錯：dwell(0) → travel → dwell(1) → … → dwell(n-1)。
 * dwell 段相機停在 waypoint（i * depth）上（scroll-world 的 linger），
 * travel 段以 smoothstep 前進一個 depth。輸出保證單調不減、只前進不回拉
 * （scroll-world 架構 A「連續前向推進」的硬規則）。
 *
 * @param {number} progress 0..1 的滾動進度（超界自動夾住）
 * @param {number} sceneCount 場景數 n（≥1）
 * @returns {number} 相機 Z ∈ [0, (n-1) * depth]
 */
export function cameraZ(progress, sceneCount, { depth = SCENE_DEPTH, linger = DEFAULT_LINGER } = {}) {
  const n = Math.max(1, Math.floor(sceneCount));
  if (n === 1 || !Number.isFinite(progress)) return 0;
  const p = clamp01(progress);
  let u = p * (n * linger + (n - 1));
  let z = 0;
  for (let i = 0; i < n; i += 1) {
    if (u <= linger) return z; // dwell：停在第 i 景
    u -= linger;
    if (i === n - 1) break;
    if (u <= 1) return z + smoothstep(u) * depth; // travel：飛向第 i+1 景
    u -= 1;
    z += depth;
  }
  return (n - 1) * depth;
}

/** 第 index 景與相機的有向距離（>0 在前方、<0 已飛越）。 */
export function sceneDistance(camZ, index, depth = SCENE_DEPTH) {
  return index * depth - camZ;
}

/**
 * 場景不透明度：目前景完全清晰主導畫面，前方景隨縱深霧化成「幽靈」
 * 漸近（下一景於 waypoint 上約 0.4，維持世界連續感又不搶戲），
 * 相機穿越（distance < 0）時快速淡出——即「飛入場景內部」的視覺。
 */
export function sceneOpacity(distance, depth = SCENE_DEPTH) {
  const fadeOut = 0.45 * depth; // 穿越後淡出距離
  const clearUntil = 0.35 * depth; // 此距離內完全清晰
  const fogUntil = 2.4 * depth; // 此距離外完全隱藏
  if (distance <= -fadeOut || distance >= fogUntil) return 0;
  if (distance < 0) return clamp01(1 + distance / fadeOut);
  if (distance <= clearUntil) return 1;
  // 冪次霧化：靠近時快速轉清晰、遠處長尾壓低
  return clamp01((1 - (distance - clearUntil) / (fogUntil - clearUntil)) ** 2.5);
}

/** 目前所在（最接近）場景 index，夾在 [0, n-1]。 */
export function activeSceneIndex(camZ, sceneCount, depth = SCENE_DEPTH) {
  const n = Math.max(1, Math.floor(sceneCount));
  return Math.min(Math.max(Math.round(camZ / depth), 0), n - 1);
}

/** 文案面板不透明度：靠近 waypoint 才顯示，飛行途中收起。 */
export function copyOpacity(camZ, index, depth = SCENE_DEPTH) {
  const d = Math.abs(sceneDistance(camZ, index, depth));
  const inner = 0.18 * depth;
  const outer = 0.5 * depth;
  if (d <= inner) return 1;
  if (d >= outer) return 0;
  return 1 - (d - inner) / (outer - inner);
}

/**
 * 第 index 景 dwell 區段中點對應的滾動進度（0..1）——進度導軌點擊跳景用。
 * 保證 cameraZ(progressForScene(i, n), n) === i * depth。
 */
export function progressForScene(index, sceneCount, { linger = DEFAULT_LINGER } = {}) {
  const n = Math.max(1, Math.floor(sceneCount));
  if (n === 1) return 0;
  const i = Math.min(Math.max(Math.floor(index), 0), n - 1);
  return (i * (1 + linger) + linger / 2) / (n * linger + (n - 1));
}

/**
 * 第 index 景影片的 scrub 進度（0..1）——scroll-world 的「滾動＝播放進度」。
 *
 * 章節切分在節奏軸（dwell/travel 交錯）上：第 i 景章節＝
 * 「travel (i-1)→i 的中點」到「travel i→(i+1) 的中點」（首尾景延伸到端點）。
 * travel 中點正是縱深交叉淡化最深處——出景影片在此播到最後一幀（相機拉遠），
 * 入景影片從第 0 幀（遠景）接手拉近，接縫兩側鏡頭語言連續（scroll-world
 * Step 5 幀對接原則的 scrub 版）。dwell（linger）期間相機停在 waypoint，
 * 但滾動仍在推進章節 → 影片持續前播，畫面不會凍結。
 *
 * @returns {number} 0..1；p 在章節前回 0、章節後回 1（clamp）
 */
export function clipProgress(progress, index, sceneCount, { linger = DEFAULT_LINGER } = {}) {
  const n = Math.max(1, Math.floor(sceneCount));
  if (n === 1) return clamp01(progress);
  const i = Math.min(Math.max(Math.floor(index), 0), n - 1);
  const total = n * linger + (n - 1);
  const u = clamp01(progress) * total;
  // travel i→i+1 的中點（節奏軸座標）：i*(1+l) + l + 0.5
  const midBefore = i === 0 ? 0 : (i - 1) * (1 + linger) + linger + 0.5;
  const midAfter = i === n - 1 ? total : i * (1 + linger) + linger + 0.5;
  return clamp01((u - midBefore) / (midAfter - midBefore));
}
