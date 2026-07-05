// Notification matrix gateway — Tour Platform (#920 admin-controllable fan-out).
//
// The admin back-office can toggle, per order event, which audience
// (traveler / guide / admin group) receives a notification on which channel
// (LINE / Telegram). This module is the single source of truth those toggles
// are read from.
//
// Layering (both must pass to send):
//   1. env master flag   — infra availability (channel configured this deploy)
//   2. THIS matrix cell  — business toggle the admin flips in the console
//   3. recipient binding — a resolvable chat/line user for the audience
//
// Defaults: every cell is ENABLED, so an empty matrix preserves the historical
// "fan out to everyone (subject to env + binding)" behaviour. Only explicit
// admin overrides turn a cell off.
//
// Storage mirrors db.mjs: when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
// present we delegate to the Supabase-backed singleton row; otherwise we fall
// back to the in-memory store (store.mjs notificationSettings).

import { notificationSettings } from './store.mjs';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../src/config/supabase-service-env.mjs';

/** Order events that fan out to notifications. */
export const NOTIFY_EVENTS = [
  'new_order',
  'payment_received',
  'order_cancelled',
  'refund_requested',
  'refund_executed',
];

/** Audiences a notification can target. */
export const NOTIFY_RECIPIENTS = ['traveler', 'guide', 'admin'];

/** Delivery channels. */
export const NOTIFY_CHANNELS = ['line', 'telegram'];

function hasSupabaseEnv() {
  return !!(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

function cellKey(event, recipient, channel) {
  return `${event}:${recipient}:${channel}`;
}

function isKnownCell(event, recipient, channel) {
  return (
    NOTIFY_EVENTS.includes(event) &&
    NOTIFY_RECIPIENTS.includes(recipient) &&
    NOTIFY_CHANNELS.includes(channel)
  );
}

/** Expand a sparse override map into a full {event:{recipient:{channel}}} matrix. */
function buildMatrix(overrides = {}) {
  const matrix = {};
  for (const event of NOTIFY_EVENTS) {
    matrix[event] = {};
    for (const recipient of NOTIFY_RECIPIENTS) {
      matrix[event][recipient] = {};
      for (const channel of NOTIFY_CHANNELS) {
        const override = overrides[cellKey(event, recipient, channel)];
        matrix[event][recipient][channel] = override === undefined ? true : !!override;
      }
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// In-memory implementation (store.mjs fallback)
// ---------------------------------------------------------------------------

function getOverridesInMemory() {
  return notificationSettings.overrides || {};
}

function setCellsInMemory(cells) {
  const overrides = notificationSettings.overrides || (notificationSettings.overrides = {});
  for (const cell of cells) {
    if (!isKnownCell(cell.event, cell.recipient, cell.channel)) continue;
    overrides[cellKey(cell.event, cell.recipient, cell.channel)] = !!cell.enabled;
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the override map (sparse) from the active backend. */
async function readOverrides() {
  if (hasSupabaseEnv()) {
    const { getNotificationOverridesDb } = await import('./db.mjs');
    return (await getNotificationOverridesDb()) || {};
  }
  return getOverridesInMemory();
}

/** Full {event:{recipient:{channel:boolean}}} matrix (defaults all-on). */
export async function getNotificationMatrix() {
  return buildMatrix(await readOverrides());
}

/**
 * Is (event, recipient, channel) enabled? Unknown/unmodelled cells default to
 * true so a future event never gets silently dropped by this layer.
 */
export async function isNotifyEnabled(event, recipient, channel) {
  if (!isKnownCell(event, recipient, channel)) return true;
  const overrides = await readOverrides();
  const override = overrides[cellKey(event, recipient, channel)];
  return override === undefined ? true : !!override;
}

/**
 * Persist cell toggles. Cells outside the known dimensions are ignored.
 * @param {Array<{event:string,recipient:string,channel:string,enabled:boolean}>} cells
 * @param {{ actor?: string }} [opts]
 */
export async function setNotificationCells(cells = [], opts = {}) {
  const valid = (Array.isArray(cells) ? cells : []).filter((c) =>
    isKnownCell(c?.event, c?.recipient, c?.channel),
  );
  if (hasSupabaseEnv()) {
    const { setNotificationCellsDb } = await import('./db.mjs');
    return setNotificationCellsDb(valid, { actor: opts.actor || 'admin' });
  }
  return setCellsInMemory(valid);
}

/** Test-only: clear all in-memory overrides (reset to all-on default). */
export function __resetNotificationSettingsForTest() {
  notificationSettings.overrides = {};
}
