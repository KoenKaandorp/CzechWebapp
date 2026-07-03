// milestones.js — rarer, bigger celebrations: mastery counts and streaks.

import * as db from './db.js';
import { computeStreak } from './stats.js';
import { showMilestoneBurst } from './toast.js';

const MASTERY_MILESTONES = [1, 10, 25, 50, 100, 200, 500, 1000];
const STREAK_MILESTONES  = [3, 7, 14, 30, 60, 100, 200, 365];

// Fires the moment a word crosses into level 5 (mastered) and the total
// mastered count lands exactly on a round number. Verb conjugations are
// excluded — they'd inflate the count relative to real vocabulary learned.
export async function checkMasteryMilestone(prevLevel, newLevel) {
  if (newLevel !== 5 || prevLevel === 5) return;
  const words = await db.getAllWords();
  const masteredCount = words.filter(w => w.level === 5 && w.pos !== 'verb-conj').length;
  if (!MASTERY_MILESTONES.includes(masteredCount)) return;
  showMilestoneBurst({
    title: masteredCount === 1 ? 'First word mastered!' : `${masteredCount} words mastered!`,
    subtitle: 'Keep going',
  });
}

// Checked at most once per day (guarded via meta), so it's cheap to call on every rating.
export async function checkStreakMilestone(today) {
  const key = `streakCelebrated:${today}`;
  if (await db.getMeta(key, false)) return;
  await db.setMeta(key, true);

  const streak = computeStreak(await db.getRecentSessions());
  if (!STREAK_MILESTONES.includes(streak)) return;
  showMilestoneBurst({ title: `${streak}-day streak!`, subtitle: 'On fire' });
}
