// stats.js — aggregations for the dashboard.
//
// Reading-comprehension estimator:
//   We use a lexical-coverage model from second-language acquisition research:
//   given that Czech word frequencies follow a Zipfian distribution, a word's
//   contribution to running-text coverage is approximately 1/rank.
//
//   coverage = Σ_known (1/rank) / Σ_all_in_corpus (1/rank)
//
//   In practice we don't have the full corpus, so we use the harmonic series
//   over the seeded ranks as a proxy. This is good enough to give a meaningful
//   relative number ("you know ~40% of typical text") and to *trend* over time.

import * as db from './db.js';
import { isKnown, deriveLevel } from './scheduler.js';

export async function getWordsByLevel(level) {
  const words = (await db.getAllWords())
    .filter(w => (w.level || deriveLevel(w.interval, w.repetitions)) === level)
    .sort((a, b) => (a.frequencyRank || 9999) - (b.frequencyRank || 9999));
  return words;
}

export async function levelDistribution() {
  const words = await db.getAllWords();
  const buckets = [0, 0, 0, 0, 0];
  let seen = 0;
  for (const w of words) {
    const lvl = w.level || deriveLevel(w.interval, w.repetitions);
    buckets[lvl - 1] += 1;
    if (w.repetitions > 0 || w.lastReviewedAt) seen += 1;
  }
  return { buckets, total: words.length, seen };
}

// Daily reviewed + learned for the last N days, ascending by date, filling gaps.
export async function dailyProgress(days = 30) {
  const all = await db.getRecentSessions();
  const map = Object.fromEntries(all.map(s => [s.date, s]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map[key] || { date: key, reviewed: 0, learned: 0 };
    out.push({ date: key, reviewed: row.reviewed, learned: row.learned });
  }
  return out;
}

// Cumulative "known" words over time, derived from the reviews log.
// We treat a word as "becoming known" the first time it crosses interval ≥ 21d.
export async function comprehensionOverTime(days = 30) {
  const since = Date.now() - days * 86_400_000;
  const reviews = (await db.getReviewsSince(since))
    .sort((a, b) => a.ratedAt - b.ratedAt);

  // Walk through reviews chronologically; mark a word "known" the first time
  // its newInterval crosses 21.
  const seenKnown = new Set();
  const buckets = new Map();
  for (const r of reviews) {
    const key = new Date(r.ratedAt).toISOString().slice(0, 10);
    if (!seenKnown.has(r.wordId) && r.newInterval >= 21) {
      seenKnown.add(r.wordId);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
  }

  // Cumulative series, gap-filled.
  let running = 0;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    running += (buckets.get(key) || 0);
    out.push({ date: key, known: running });
  }
  return out;
}

function levelFromInterval(interval) {
  if (!interval) return 1;
  if (interval < 14) return 2;
  if (interval < 28) return 3;
  if (interval < 60) return 4;
  return 5;
}

function computeStreak(sessions) {
  const daySet = new Set(sessions.filter(s => s.reviewed > 0).map(s => s.date));
  const today  = new Date().toISOString().slice(0, 10);
  const d = new Date();
  // If no reviews today yet, start streak check from yesterday.
  if (!daySet.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (!daySet.has(key)) break;
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

export async function todayStats() {
  const today      = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today).getTime();

  const sessions = await db.getRecentSessions();
  const session  = sessions.find(s => s.date === today)
    || { reviewed: 0, learned: 0, again: 0, hard: 0, good: 0, easy: 0 };

  const reviews = await db.getReviewsSince(todayStart);
  const leveledUp = new Set();
  for (const r of reviews) {
    // Skip a word's very first-ever review: going from "New" to "Learning"
    // is already reflected in the `learned` stat, not a level-up.
    if (r.wasNew) continue;
    if (levelFromInterval(r.newInterval) > levelFromInterval(r.prevInterval)) {
      leveledUp.add(r.wordId);
    }
  }

  return {
    reviewed: session.reviewed || 0,
    learned:  session.learned  || 0,
    correct:  (session.good || 0) + (session.easy || 0),
    levelUps: leveledUp.size,
    streak:   computeStreak(sessions),
  };
}

// Lexical coverage of "typical Czech text" — see header comment.
// Fixed harmonic-series weight for the top ~20 000 Czech word forms.
// Using only the seeded words as denominator inflates coverage dramatically
// because the very top-ranked words carry huge Zipfian weight.
// Σ(1/k, k=1..20000) ≈ 10.18
const CORPUS_WEIGHT = 10.18;

export async function coverageEstimate() {
  const words = await db.getAllWords();
  if (!words.length) return { coverage: 0, knownCount: 0, total: 0, tiers: [] };

  let weightKnown = 0;
  let knownCount = 0;
  const levelWeights = { 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const w of words) {
    const r = w.frequencyRank || 9999;
    const weight = 1 / r;
    const level = w.level || deriveLevel(w.interval, w.repetitions);
    if (level >= 2 && level <= 5) levelWeights[level] += weight;
    if (isKnown(w)) {
      weightKnown += weight;
      knownCount += 1;
    }
  }

  const coverage = weightKnown / CORPUS_WEIGHT;
  const tiers = [
    { label: 'Learning', level: 2 },
    { label: 'Familiar', level: 3 },
    { label: 'Known', level: 4 },
    { label: 'Mastered', level: 5 },
  ].map(({ label, level }) => ({
    label,
    pct: Object.entries(levelWeights)
      .filter(([lvl]) => Number(lvl) >= level)
      .reduce((sum, [, weight]) => sum + weight, 0) / CORPUS_WEIGHT,
  }));

  return { coverage, knownCount, total: words.length, tiers };
}
