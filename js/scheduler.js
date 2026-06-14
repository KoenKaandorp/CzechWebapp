// scheduler.js — SuperMemo SM-2, with a 4-button UI and a derived "level 1–5".
//
// Why SM-2 over a fixed 5-box Leitner system:
//   - Per-card "ease factor" adapts to *which* words a user finds hard,
//     instead of treating every card the same.
//   - Intervals grow geometrically (interval * EF) which matches forgetting-curve research.
//   - The 5 "levels" requested in the brief are kept as a *display* layer derived
//     from the interval, so the user still gets the distribution chart they wanted.
//
// Quality scale (we expose 4 buttons; SM-2 takes 0–5):
//   Again  -> q=1   (lapse: reset interval, drop EF)
//   Hard   -> q=3   (passing but reduce EF a touch, small interval growth)
//   Good   -> q=4   (standard progression)
//   Easy   -> q=5   (bonus EF, longer interval)

export const RATING = Object.freeze({
  AGAIN: { id: 'again', label: 'Again', quality: 1 },
  HARD:  { id: 'hard',  label: 'Hard',  quality: 3 },
  GOOD:  { id: 'good',  label: 'Good',  quality: 4 },
  EASY:  { id: 'easy',  label: 'Easy',  quality: 5 },
});

const MIN_EF = 1.3;
const DEFAULT_EF = 2.5;
const DAY_MS = 86_400_000;

// Returns a *new* card object — never mutates input.
export function applyRating(card, rating, now = Date.now()) {
  const q = rating.quality;
  const prev = {
    interval: card.interval,
    ef: card.ef,
    repetitions: card.repetitions,
  };

  let { ef, interval, repetitions, lapses = 0 } = card;
  ef = ef ?? DEFAULT_EF;

  // SM-2 EF update — same formula, with min clamp.
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < MIN_EF) ef = MIN_EF;

  if (q < 3) {
    // Lapse: re-learn from scratch, but keep the (now lower) EF.
    repetitions = 0;
    interval = 0;               // re-show in the same session
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ef);

    // "Hard" should grow slower than "Good"; "Easy" should grow faster.
    if (q === 3 && repetitions > 2) interval = Math.max(1, Math.round(interval * 0.8));
    if (q === 5 && repetitions > 2) interval = Math.round(interval * 1.3);
  }

  const dueAt = interval === 0
    ? now + 60_000             // 1 minute relearn step inside session
    : now + interval * DAY_MS;

  return {
    ...card,
    ef: round2(ef),
    interval,
    repetitions,
    lapses,
    dueAt,
    lastReviewedAt: now,
    level: deriveLevel(interval, repetitions),
    _diff: { prev, q },          // useful for analytics / debugging
  };
}

// Maps the SM-2 interval onto the 1–5 "knowledge level" buckets.
// This is purely for visualization — the scheduler itself is interval-based.
export function deriveLevel(interval, repetitions) {
  if (repetitions === 0) return 1;     // new / lapsed
  if (interval < 14)     return 2;     // learning
  if (interval < 28)     return 3;     // familiar
  if (interval < 60)     return 4;     // known
  return 5;                            // mastered
}

// A word is considered "known" for the comprehension estimator when it
// reaches the maturing level (interval ≥ 21d) and hasn't been failed recently.
export function isKnown(card) {
  return card.repetitions >= 2 && card.interval >= 60;
}

// Used when seeding new cards.
export function freshCard(seed) {
  return {
    ...seed,
    ef: DEFAULT_EF,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: 0,                  // 0 = never scheduled (treated as "new")
    lastReviewedAt: null,
    level: 1,
    createdAt: Date.now(),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
