/**
 * Issue #1554 — 訂單完成鏈路自動化：auto-complete sweep＋漏單對帳告警
 *
 * 背景（健檢 v2 P0-1）：completed 推進原本純人工（admin 手動），settlement sweep
 * 只結算已 completed 的訂單 → 沒人按完成就永遠卡 confirmed、結算/評論漏單。
 *
 * 三道防線之一：本 sweep 將「出團開始時間已過寬限期、無退款爭議」的 confirmed
 * 訂單自動轉 completed（冪等），並偵測停滯訂單走 recordIncident 告警。
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const {
  evaluateAutoCompleteEligibility,
  AUTO_COMPLETE_DEFAULT_GRACE_HOURS,
} = await import('../../src/lib/auto-complete-eligibility.mjs');
const { autoCompleteConfirmedOrdersDb } = await import('../../src/lib/db-auto-complete.mjs');
const { orders, auditLogs } = await import('../../src/lib/store.mjs');

function listAuditLogs({ orderId }) {
  return auditLogs.filter((l) => l.orderId === orderId);
}

const NOW = '2026-07-02T12:00:00.000Z';
const HOURS = 3600_000;

function isoHoursAgo(h) {
  return new Date(Date.parse(NOW) - h * HOURS).toISOString();
}

function seedOrder(overrides = {}) {
  const order = {
    id: `ord_1554_${Math.random().toString(36).slice(2, 8)}`,
    experienceId: 'exp_chaishan_001',
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    scheduleStartAt: isoHoursAgo(72),
    status: 'confirmed',
    totalTwd: 4000,
    peopleCount: 2,
    contactName: '測試旅客',
    contactPhone: '0912000000',
    contactEmail: 'traveler-1554@example.com',
    createdAt: isoHoursAgo(120),
    paidAt: isoHoursAgo(100),
    updatedAt: isoHoursAgo(100),
    ...overrides,
  };
  orders.push(order);
  return order;
}

describe('evaluateAutoCompleteEligibility（純函式）', () => {
  it('confirmed＋出團開始已過寬限期 → eligible', () => {
    const r = evaluateAutoCompleteEligibility({
      status: 'confirmed',
      effectiveStartAt: isoHoursAgo(72),
      nowIso: NOW,
      graceHours: 48,
    });
    assert.equal(r.eligible, true);
  });

  it('confirmed 但仍在寬限期內 → not eligible（within_grace）', () => {
    const r = evaluateAutoCompleteEligibility({
      status: 'confirmed',
      effectiveStartAt: isoHoursAgo(12),
      nowIso: NOW,
      graceHours: 48,
    });
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'within_grace');
  });

  it('非 confirmed（refund_pending / reschedule_requested / paid）一律 not eligible', () => {
    for (const status of ['refund_pending', 'reschedule_requested', 'paid', 'completed']) {
      const r = evaluateAutoCompleteEligibility({
        status,
        effectiveStartAt: isoHoursAgo(72),
        nowIso: NOW,
        graceHours: 48,
      });
      assert.equal(r.eligible, false, `status=${status} 不得自動完成`);
      assert.equal(r.reason, 'not_confirmed');
    }
  });

  it('無時間來源 → not eligible（no_time_source），不誤傷', () => {
    const r = evaluateAutoCompleteEligibility({
      status: 'confirmed',
      effectiveStartAt: null,
      nowIso: NOW,
      graceHours: 48,
    });
    assert.equal(r.eligible, false);
    assert.equal(r.reason, 'no_time_source');
  });

  it('預設寬限期為 48 小時', () => {
    assert.equal(AUTO_COMPLETE_DEFAULT_GRACE_HOURS, 48);
  });
});

describe('autoCompleteConfirmedOrdersDb（in-memory fallback 行為）', () => {
  beforeEach(() => {
    // 清掉本測試 seed 的訂單（保留 store 原生 mock）
    for (let i = orders.length - 1; i >= 0; i--) {
      if (String(orders[i].id).startsWith('ord_1554_')) orders.splice(i, 1);
    }
  });

  it('過寬限期的 confirmed 訂單 → completed，寫 audit log', async () => {
    const o = seedOrder();
    const result = await autoCompleteConfirmedOrdersDb({ now: NOW });
    assert.equal(o.status, 'completed');
    assert.ok(result.completed >= 1);
    const logs = listAuditLogs({ orderId: o.id });
    assert.ok(
      logs.some((l) => l.action === 'order_auto_completed'),
      'audit log 必須記 order_auto_completed'
    );
  });

  it('冪等：重跑不重複轉移、不重複 audit log', async () => {
    const o = seedOrder();
    await autoCompleteConfirmedOrdersDb({ now: NOW });
    const logsAfterFirst = listAuditLogs({ orderId: o.id }).filter(
      (l) => l.action === 'order_auto_completed'
    ).length;
    const second = await autoCompleteConfirmedOrdersDb({ now: NOW });
    const logsAfterSecond = listAuditLogs({ orderId: o.id }).filter(
      (l) => l.action === 'order_auto_completed'
    ).length;
    assert.equal(o.status, 'completed');
    assert.equal(logsAfterSecond, logsAfterFirst, '重跑不得追加 audit log');
    assert.equal(second.completed, 0, '第二輪無可完成訂單');
  });

  it('寬限期內／非 confirmed 訂單不動', async () => {
    const recent = seedOrder({ scheduleStartAt: isoHoursAgo(2) });
    const refundPending = seedOrder({ status: 'refund_pending', scheduleStartAt: isoHoursAgo(72) });
    const reschedule = seedOrder({ status: 'reschedule_requested', scheduleStartAt: isoHoursAgo(72) });
    await autoCompleteConfirmedOrdersDb({ now: NOW });
    assert.equal(recent.status, 'confirmed');
    assert.equal(refundPending.status, 'refund_pending');
    assert.equal(reschedule.status, 'reschedule_requested');
  });

  it('回報停滯訂單（超過寬限期×2 仍 confirmed 且無法自動完成者不在此列——停滯定義為掃描前即超時甚久）', async () => {
    // 停滯偵測：completed 動作本身會消化正常件；無時間來源的 confirmed 老單會停滯
    const stalled = seedOrder({ scheduleStartAt: null, createdAt: isoHoursAgo(300), updatedAt: isoHoursAgo(300) });
    const result = await autoCompleteConfirmedOrdersDb({ now: NOW });
    assert.ok(Array.isArray(result.stalled));
    assert.ok(
      result.stalled.some((s) => s.orderId === stalled.id),
      '無時間來源的老 confirmed 單必須列入 stalled 告警'
    );
  });

  it('回傳 shape：{ scanned, completed, stalled, results }（與 Supabase 分支同 shape 契約）', async () => {
    seedOrder();
    const result = await autoCompleteConfirmedOrdersDb({ now: NOW });
    assert.equal(typeof result.scanned, 'number');
    assert.equal(typeof result.completed, 'number');
    assert.ok(Array.isArray(result.stalled));
    assert.ok(Array.isArray(result.results));
  });
});

describe('source contract — route／workflow／db.mjs strangler 準則', () => {
  const routeSrc = fs.readFileSync(
    path.join(ROOT, 'app/api/internal/bookings/auto-complete-sweep/route.ts'),
    'utf8'
  );

  it('route 以 x-internal-token 驗證（INTERNAL_ALERT_TOKEN）', () => {
    assert.match(routeSrc, /x-internal-token/);
    assert.match(routeSrc, /INTERNAL_ALERT_TOKEN/);
    assert.match(routeSrc, /status:\s*401/);
  });

  it('route 停滯訂單走 recordIncident 告警', () => {
    assert.match(routeSrc, /recordIncident/);
  });

  it('route 呼叫 db-auto-complete 領域檔（不進 db.mjs — #1385 strangler 硬規則）', () => {
    assert.match(routeSrc, /from '.*db-auto-complete\.mjs'/);
    const dbSrc = fs.readFileSync(path.join(ROOT, 'src/lib/db.mjs'), 'utf8');
    assert.ok(
      !/autoCompleteConfirmedOrders/.test(dbSrc),
      '自動完成邏輯不得寫進 db.mjs 單體'
    );
  });

  it('GitHub Actions workflow 存在且指向 sweep endpoint', () => {
    const wf = fs.readFileSync(
      path.resolve(ROOT, '../../.github/workflows/auto-complete-sweep.yml'),
      'utf8'
    );
    assert.match(wf, /api\/internal\/bookings\/auto-complete-sweep/);
    assert.match(wf, /workflow_dispatch/);
    assert.match(wf, /INTERNAL_ALERT_TOKEN/);
  });

  // 回歸鎖：#1560 為 orders 加了第二條 orders↔bookings FK（orders_booking_id_fkey），
  // 未指名 FK 的 `bookings(...)` 嵌入在 production 會 PGRST201 → 500（in-memory 測試抓不到）。
  // 鎖定 select 必須用具名關係 `bookings!fk_bookings_order_id(...)`，防回退。
  it('Supabase 分支 orders↔bookings 嵌入必須指名 FK（避免 PGRST201 歧義）', () => {
    const dbSrc = fs.readFileSync(path.join(ROOT, 'src/lib/db-auto-complete.mjs'), 'utf8');
    assert.match(
      dbSrc,
      /bookings!fk_bookings_order_id\(start_at\)/,
      'orders 的 bookings 嵌入須指名 fk_bookings_order_id，否則兩條 FK 造成 PGRST201',
    );
    assert.ok(
      !/[^!]bookings\(start_at\)/.test(dbSrc),
      '不得殘留未指名 FK 的 bookings(start_at) 嵌入',
    );
  });
});
