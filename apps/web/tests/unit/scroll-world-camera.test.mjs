import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_DEPTH,
  DEFAULT_LINGER,
  activeSceneIndex,
  cameraZ,
  clipProgress,
  copyOpacity,
  progressForScene,
  sceneDistance,
  sceneOpacity,
  sceneScale,
} from '../../src/lib/scroll-world/camera.mjs';

const N = 7; // /world 目前場景數（intro＋五主題＋finale）
const D = SCENE_DEPTH;

test('cameraZ 端點：p=0 → 0、p=1 → (n-1)*depth', () => {
  assert.equal(cameraZ(0, N), 0);
  assert.equal(cameraZ(1, N), (N - 1) * D);
});

test('cameraZ 單調不減（scroll-world 架構 A：相機只前進不回拉）', () => {
  let prev = -Infinity;
  for (let step = 0; step <= 2000; step += 1) {
    const z = cameraZ(step / 2000, N);
    assert.ok(z >= prev, `p=${step / 2000} 時 z=${z} < 前值 ${prev}`);
    assert.ok(z >= 0 && z <= (N - 1) * D);
    prev = z;
  }
});

test('cameraZ 超界與非法輸入夾住', () => {
  assert.equal(cameraZ(-1, N), 0);
  assert.equal(cameraZ(2, N), (N - 1) * D);
  assert.equal(cameraZ(Number.NaN, N), 0);
});

test('cameraZ 單場景（n=1）恆為 0', () => {
  assert.equal(cameraZ(0.5, 1), 0);
  assert.equal(cameraZ(1, 1), 0);
});

test('每景 waypoint 有 linger 平台：dwell 區段內相機 Z 恆等於 i*depth', () => {
  const total = N * DEFAULT_LINGER + (N - 1);
  const dwellHalfWidth = DEFAULT_LINGER / 2 / total; // dwell 半寬（progress 座標）
  for (let i = 0; i < N; i += 1) {
    const center = progressForScene(i, N);
    assert.equal(cameraZ(center, N), i * D, `第 ${i} 景 dwell 中點`);
    // dwell 區段內部（避開邊界浮點）仍停在 waypoint 上
    for (const offset of [-0.8 * dwellHalfWidth, 0.8 * dwellHalfWidth]) {
      const p = Math.min(1, Math.max(0, center + offset));
      assert.equal(cameraZ(p, N), i * D, `第 ${i} 景 dwell 內 offset=${offset}`);
    }
  }
});

test('progressForScene：遞增且邊界夾住', () => {
  for (let i = 1; i < N; i += 1) {
    assert.ok(progressForScene(i, N) > progressForScene(i - 1, N));
  }
  assert.equal(progressForScene(-3, N), progressForScene(0, N));
  assert.equal(progressForScene(99, N), progressForScene(N - 1, N));
  assert.equal(progressForScene(0, 1), 0);
});

test('sceneOpacity：對稱交叉淡化——中心全顯、過場中點各半、0.85D 外全隱', () => {
  assert.equal(sceneOpacity(0), 1); // 相機正在景上
  assert.equal(sceneOpacity(0.15 * D), 1); // 全顯區邊界
  assert.equal(sceneOpacity(-0.15 * D), 1);
  // 過場中點（±0.5D）：相鄰兩景各 0.5、總和恆 1（純交叉淡化，無暗谷）
  assert.ok(Math.abs(sceneOpacity(0.5 * D) - 0.5) < 1e-9);
  assert.ok(Math.abs(sceneOpacity(-0.5 * D) - 0.5) < 1e-9);
  assert.ok(Math.abs(sceneOpacity(0.5 * D) + sceneOpacity(-0.5 * D) - 1) < 1e-9);
  assert.equal(sceneOpacity(0.85 * D), 0); // 淡化區外全隱
  assert.equal(sceneOpacity(-0.85 * D), 0);
  assert.equal(sceneOpacity(D), 0); // 下一 waypoint 上不可見（不堆疊）
  // 對稱＋|d| 遞增時單調遞減、值域 [0,1]
  let prev = 1;
  for (let d = 0; d <= 1.2 * D; d += D / 40) {
    const o = sceneOpacity(d);
    assert.ok(Math.abs(o - sceneOpacity(-d)) < 1e-9, `distance=±${d} 應對稱`);
    assert.ok(o <= prev + 1e-9, `distance=${d} 不應回升`);
    assert.ok(o >= 0 && o <= 1);
    prev = o;
  }
});

test('sceneScale：恆 ≥ 1（不露邊框）、waypoint 上為 1、隨距離漸增有上限', () => {
  assert.equal(sceneScale(0), 1);
  for (let d = -1.5 * D; d <= 1.5 * D; d += D / 30) {
    const s = sceneScale(d);
    assert.ok(s >= 1, `distance=${d} scale=${s} 不得小於 1`);
    assert.ok(s <= 1.07 + 1e-9, `distance=${d} scale=${s} 超過上限`);
  }
  assert.ok(sceneScale(0.5 * D) > sceneScale(0.2 * D)); // 入景側漸增
  assert.ok(sceneScale(-0.5 * D) > sceneScale(-0.2 * D)); // 出景側漸增
  assert.ok(Math.abs(sceneScale(0.85 * D) - 1.07) < 1e-9); // 入景上限
  assert.ok(Math.abs(sceneScale(-0.85 * D) - 1.05) < 1e-9); // 出景上限
});

test('sceneDistance：正值在前方、負值已飛越', () => {
  assert.equal(sceneDistance(0, 2), 2 * D);
  assert.equal(sceneDistance(3 * D, 2), -D);
});

test('activeSceneIndex：取最近景並夾在 [0, n-1]', () => {
  assert.equal(activeSceneIndex(0, N), 0);
  assert.equal(activeSceneIndex(2 * D + 0.2 * D, N), 2);
  assert.equal(activeSceneIndex(99 * D, N), N - 1);
  assert.equal(activeSceneIndex(-D, N), 0);
});

// travel i→i+1 中點對應的全域 progress（節奏軸 → 0..1）
function travelMidProgress(i, n, linger = DEFAULT_LINGER) {
  return (i * (1 + linger) + linger + 0.5) / (n * linger + (n - 1));
}

test('clipProgress：端點——首景從 0 起、末景到 1 收', () => {
  assert.equal(clipProgress(0, 0, N), 0);
  assert.equal(clipProgress(1, N - 1, N), 1);
});

test('clipProgress：過場中點幀交接——出景播畢（1）、入景起播（0）', () => {
  for (let i = 0; i < N - 1; i += 1) {
    const p = travelMidProgress(i, N);
    assert.ok(Math.abs(clipProgress(p, i, N) - 1) < 1e-9, `過場 ${i}→${i + 1} 中點，第 ${i} 景影片應為 1`);
    assert.ok(Math.abs(clipProgress(p, i + 1, N)) < 1e-9, `過場 ${i}→${i + 1} 中點，第 ${i + 1} 景影片應為 0`);
  }
});

test('clipProgress：對 p 單調不減且值域 [0,1]', () => {
  for (let i = 0; i < N; i += 1) {
    let prev = -1;
    for (let step = 0; step <= 400; step += 1) {
      const v = clipProgress(step / 400, i, N);
      assert.ok(v >= prev - 1e-12, `第 ${i} 景在 p=${step / 400} 回退`);
      assert.ok(v >= 0 && v <= 1);
      prev = v;
    }
  }
});

test('clipProgress：內部景 dwell 中點＝影片中點（0.5）', () => {
  for (let i = 1; i < N - 1; i += 1) {
    const v = clipProgress(progressForScene(i, N), i, N);
    assert.ok(Math.abs(v - 0.5) < 1e-9, `第 ${i} 景 dwell 中點應為 0.5，得 ${v}`);
  }
});

test('clipProgress：dwell（linger）期間影片仍前進（不凍結）', () => {
  const i = 2;
  const center = progressForScene(i, N);
  const total = N * DEFAULT_LINGER + (N - 1);
  const dwellHalf = DEFAULT_LINGER / 2 / total;
  const before = clipProgress(center - 0.8 * dwellHalf, i, N);
  const after = clipProgress(center + 0.8 * dwellHalf, i, N);
  assert.ok(after > before, `dwell 內影片應持續前進（${before} → ${after}）`);
});

test('copyOpacity：waypoint 上全顯、兩景中間全隱', () => {
  for (let i = 0; i < N; i += 1) {
    assert.equal(copyOpacity(i * D, i), 1);
  }
  assert.equal(copyOpacity(0.5 * D, 0), 0);
  assert.equal(copyOpacity(0.5 * D, 1), 0);
  const mid = copyOpacity(0.3 * D, 0);
  assert.ok(mid > 0 && mid < 1);
});
