// timer.js — tracks active time spent in the app per day.
// Uses visibilitychange to pause when the tab is hidden.
// Saves to the meta store every 30 s and on hide.

import * as db from './db.js';

// Offset for time spent before the timer was implemented.
// Stored per-DB in meta so new users start at 0.
const LEGACY_OFFSET_MS = 90 * 60 * 1000;

const day = () => new Date().toISOString().slice(0, 10);

let _day    = day();
let _start  = null;   // Date.now() when tracking started, null when paused
let _todayMs  = 0;    // ms already persisted for today
let _offsetMs = 0;    // one-time offset, resolved on init

export async function initTimer() {
  _day     = day();
  _todayMs = await db.getMeta(`timeSpent:${_day}`, 0);

  // One-time migration: new users get 0; existing users (who already have
  // time data) inherit the legacy 90-minute offset and it is then persisted
  // so the constant is never read again.
  let offset = await db.getMeta('timeOffset', null);
  if (offset === null) {
    const allMeta = await db.getAllMeta();
    const hasData = allMeta.some(m => m.key.startsWith('timeSpent:'));
    offset = hasData ? LEGACY_OFFSET_MS : 0;
    await db.setMeta('timeOffset', offset);
  }
  _offsetMs = offset;

  if (!document.hidden) _start = Date.now();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      _flush();
      _start = null;
    } else {
      _day = day();
      _start = Date.now();
    }
  });

  setInterval(_flush, 30_000);
}

function _flush() {
  if (_start === null) return;
  const now = Date.now();
  _todayMs += now - _start;
  _start = now;
  db.setMeta(`timeSpent:${_day}`, _todayMs);
}

// Returns live ms for today (persisted + unsaved fraction + offset).
export function todayMs() {
  const unsaved = _start !== null ? Date.now() - _start : 0;
  return _todayMs + unsaved + _offsetMs;
}

// Returns live ms for today only, without the historical offset.
export function todayMsOnly() {
  const unsaved = _start !== null ? Date.now() - _start : 0;
  return _todayMs + unsaved;
}

// Sum of all persisted daily time, plus live unsaved fraction, plus the per-user offset.
export async function totalMs() {
  const allMeta = await db.getAllMeta();
  const persisted = allMeta
    .filter(m => m.key.startsWith('timeSpent:'))
    .reduce((sum, m) => sum + (m.value || 0), 0);
  const unsaved = _start !== null ? Date.now() - _start : 0;
  return persisted + unsaved + _offsetMs;
}

export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return `${totalSeconds}s`;
}
