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

export async function levelDistribution() {
  const words = await db.getAllWords();
  const buckets = [0, 0, 0, 0, 0];
  for (const w of words) {
    const lvl = w.level || deriveLevel(w.interval, w.repetitions);
    buckets[lvl - 1] += 1;
  }
  return { buckets, total: words.length };
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

// Lexical coverage of "typical Czech text" — see header comment.
export async function coverageEstimate() {
  const words = await db.getAllWords();
  if (!words.length) return { coverage: 0, knownCount: 0, total: 0, tiers: [] };

  let weightKnown = 0;
  let weightTotal = 0;
  let knownCount = 0;
  const levelWeights = { 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const w of words) {
    const r = w.frequencyRank || 9999;
    const weight = 1 / r;
    weightTotal += weight;
    const level = w.level || deriveLevel(w.interval, w.repetitions);
    if (level >= 2 && level <= 5) levelWeights[level] += weight;
    if (isKnown(w)) {
      weightKnown += weight;
      knownCount += 1;
    }
  }

  const coverage = weightTotal > 0 ? weightKnown / weightTotal : 0;
  const tiers = [
    { label: 'Learning', level: 2 },
    { label: 'Familiar', level: 3 },
    { label: 'Known', level: 4 },
    { label: 'Mastered', level: 5 },
  ].map(({ label, level }) => ({
    label,
    pct:
      weightTotal > 0
        ? Object.entries(levelWeights)
            .filter(([lvl]) => Number(lvl) >= level)
            .reduce((sum, [, weight]) => sum + weight, 0) / weightTotal
        : 0,
  }));

  return { coverage, knownCount, total: words.length, tiers };
}
