// timer.js — tracks active time spent in the app per day.
// Uses visibilitychange to pause when the tab is hidden.
// Saves to the meta store every 30 s and on hide.

import * as db from './db.js';

const day = () => new Date().toISOString().slice(0, 10);

let _day    = day();
let _start  = null;   // Date.now() when tracking started, null when paused
let _todayMs  = 0;    // ms already persisted for today

export async function initTimer() {
  _day     = day();
  _todayMs = await db.getMeta(`timeSpent:${_day}`, 0);

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

export function todayMs() {
  const unsaved = _start !== null ? Date.now() - _start : 0;
  return _todayMs + unsaved;
}

export async function totalMs() {
  const allMeta = await db.getAllMeta();
  const persisted = allMeta
    .filter(m => m.key.startsWith('timeSpent:'))
    .reduce((sum, m) => sum + (m.value || 0), 0);
  const unsaved = _start !== null ? Date.now() - _start : 0;
  return persisted + unsaved;
}

export function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
