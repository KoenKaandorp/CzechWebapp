// session.js — picks the next card to show.
//
// Priority (highest → lowest):
//   1. Cards currently in a relearn step (interval === 0, due in the next few minutes)
//   2. Cards overdue or due now
//   3. New cards, in order of frequency rank, up to a daily limit
//
// We deliberately interleave: after each card is rated, we re-query so a
// just-lapsed card naturally comes back inside the session.

import * as db from './db.js';
import { applyRating, freshCard } from './scheduler.js';
import { CONFIG } from './lang.js';

const DEFAULT_NEW_ALLOTTED = 10;
const BONUS_BATCH = 5;

export class Session {
  constructor() {
    this.newAllottedToday = DEFAULT_NEW_ALLOTTED;
    this.newIntroducedToday = 0;
    this.queue = [];           // upcoming cards (small lookahead)
    this.today = todayKey();
  }

  async init() {
    this.newIntroducedToday = await db.getMeta(`newCount:${this.today}`, 0);
    this.newAllottedToday   = await db.getMeta(`newAllotted:${this.today}`, DEFAULT_NEW_ALLOTTED);
  }

  async addMoreNew() {
    this.newAllottedToday += BONUS_BATCH;
    await db.setMeta(`newAllotted:${this.today}`, this.newAllottedToday);
  }

  async nextCard() {
    if (this.queue.length === 0) await this.refill();
    return this.queue.shift() || null;
  }

  async refill() {
    const now = Date.now();
    const due = await db.getDueWords(now, 20);
    if (due.length) { this.queue = due; return; }

    const remaining = Math.max(0, this.newAllottedToday - this.newIntroducedToday);
    if (remaining > 0) {
      const fresh = await db.getNewWords(remaining);
      if (fresh.length) this.queue = fresh;
    }
  }

  async refillBonus(limit = 20) {
    const todayStart = new Date(this.today).getTime();
    this.queue = await db.getBonusWords(limit, todayStart);
  }

  // Apply a rating, persist, update session stats. Returns the updated card.
  async rate(card, rating) {
    const wasNew = card.repetitions === 0 && !card.lastReviewedAt;
    const updated = applyRating(card, rating);
    await db.putWord(updated);
    await db.addReview({
      wordId: updated.id,
      ratedAt: updated.lastReviewedAt,
      quality: rating.quality,
      prevInterval: updated._diff.prev.interval,
      newInterval:  updated.interval,
      prevEF:       updated._diff.prev.ef,
      newEF:        updated.ef,
    });

    const patch = { reviewed: 1, [rating.id]: 1 };
    if (wasNew) {
      patch.learned = 1;
      this.newIntroducedToday += 1;
      await db.setMeta(`newCount:${this.today}`, this.newIntroducedToday);
    }
    await db.bumpSession(this.today, patch);

    // If lapsed (interval=0), re-insert near the front so it cycles back.
    if (updated.interval === 0) this.queue.push(updated);

    return updated;
  }

  async stats() {
    const session = (await db.getRecentSessions()).find(s => s.date === this.today)
      || { reviewed: 0, learned: 0, again: 0, hard: 0, good: 0, easy: 0 };
    return {
      reviewedToday: session.reviewed,
      learnedToday: session.learned,
      newRemaining: Math.max(0, this.newAllottedToday - this.newIntroducedToday),
    };
  }
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);   // YYYY-MM-DD (UTC; fine for daily buckets)
}

// Seeds any words in the language's seed file not yet in the DB (safe to call on every boot).
export async function seedNewWords(seedUrl = CONFIG.seed) {
  const prefix = CONFIG.idPrefix;
  const existing = new Set((await db.getAllWords()).map(w => w.id));
  const seed = await (await fetch(seedUrl)).json();
  const fresh = seed
    .filter(s => !existing.has(`${prefix}:${s[prefix]}`))
    .map(s => freshCard({
      id: `${prefix}:${s[prefix]}`, cz: s[prefix], en: s.en, pos: s.pos || null,
      frequencyRank: s.rank,
    }));
  if (fresh.length) await db.bulkPutWords(fresh);
  return fresh.length;
}