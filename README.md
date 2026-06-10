# Czech Flash

A Czech-vocabulary spaced-repetition trainer. Offline-first PWA, no backend, no framework.

```
czech-flash/
├── index.html
├── manifest.webmanifest
├── sw.js                      ← service worker
├── css/styles.css
├── icons/icon.svg             ← single SVG icon, used for any/maskable
├── data/seed.json             ← starter vocabulary, ranked by frequency
└── js/
    ├── app.js                 ← bootstrap, tab routing, SW registration
    ├── db.js                  ← IndexedDB wrapper (promise-based)
    ├── scheduler.js           ← SM-2 algorithm + derived level
    ├── session.js             ← card selection, daily new-word limit
    ├── stats.js               ← aggregations + lexical-coverage estimate
    └── views/
        ├── learn.js
        ├── stats.js
        └── settings.js
```

## Architecture (1-minute version)

- **Vanilla ES modules.** Three views, modest state. A framework would cost more in bundle size and complexity than it would save.
- **IndexedDB for everything.** Four stores: `words`, `reviews`, `sessions`, `meta`. Indexes on `dueAt` and `frequencyRank` make card selection cheap.
- **SM-2 with a derived level overlay.** Real spaced repetition under the hood; the "5 levels" the brief asked for are computed from the current interval, so the distribution chart still works.
- **Service worker = stale-while-revalidate** over a versioned cache containing the app shell + seed JSON. App works fully offline after the first visit.

## Data model

```
words {
  id              string  "cz:být"
  cz              string
  en              string
  pos             string?
  frequencyRank   int               ← static, drives coverage estimate
  ef              float             ← SM-2 ease factor (≥ 1.3)
  interval        int               ← days until next review (0 = relearn now)
  repetitions     int
  lapses          int
  dueAt           int (ms)          ← indexed
  lastReviewedAt  int (ms) | null
  level           int 1..5          ← derived from interval, for the chart
  createdAt       int (ms)
}

reviews {
  id              auto
  wordId          string            ← indexed
  ratedAt         int (ms)          ← indexed
  quality         int 1|3|4|5
  prevInterval    int
  newInterval     int
  prevEF          float
  newEF           float
}

sessions {
  date            "YYYY-MM-DD"      ← key
  reviewed, learned, again, hard, good, easy   ← counters
}

meta {
  key             string            ← e.g. "newPerDay", "newCount:2026-06-10"
  value           any
}
```

The `reviews` log is the source of truth for time-series stats; `sessions` is a daily rollup so the dashboard renders in O(1) reads.

## Learning algorithm — why SM-2 over a 5-box Leitner system

The brief proposes 5 levels with words promoted/demoted between them. That is a Leitner system, which works, but has two weaknesses:

1. **Fixed intervals per box.** Every card in box 3 waits the same number of days, regardless of whether the user finds *that specific card* easy or hard.
2. **Binary feedback.** Pass/fail only; no signal for "I got it but barely" vs "I got it instantly."

SM-2 fixes both:

- Each card has its own **ease factor** (`ef`, starts 2.5, floor 1.3) that goes down when you struggle and up when it's easy.
- Each card has its own **interval**, which grows roughly geometrically (`interval × ef`).
- A 4-button rating (Again / Hard / Good / Easy) maps cleanly to SM-2 quality scores 1, 3, 4, 5.

The 5 "levels" the brief asked for are still surfaced — they're just derived for display, not used by the scheduler:

| Level | Meaning      | Condition                  |
| ----- | ------------ | -------------------------- |
| 1     | New / lapsed | repetitions = 0            |
| 2     | Learning     | 0 < interval < 7 days      |
| 3     | Young        | 7 ≤ interval < 21 days     |
| 4     | Maturing     | 21 ≤ interval < 60 days    |
| 5     | Mature       | interval ≥ 60 days         |

"Lower level shown more often" falls out automatically: shorter intervals → more frequent due dates → more frequent selection.

### Card selection (`session.js`)

Each `nextCard()` call:

1. Refill the queue with up to 20 **due** cards (oldest-due first) via the `by-due` index.
2. If nothing due, top up with up to N **new** cards (lowest frequency rank first), bounded by the daily new-word limit (default 10).
3. Re-rated cards with `interval = 0` are pushed back on the queue, so a lapse cycles inside the same session.

## Reading-comprehension estimator

From second-language-acquisition research (Nation, Laufer): the top 1k Czech words cover ~75–80 % of running text, top 2k ~85 %, top 5k ~95 %. Word frequencies follow a roughly Zipfian distribution where a word's text frequency is proportional to `1 / rank`.

So we estimate:

```
coverage ≈ Σ (1 / rank_i) for known words
           ────────────────────────────────
           Σ (1 / rank_j) for all seeded words
```

A word is "known" when `repetitions ≥ 2` and `interval ≥ 21 days` (i.e. it has reached the *Maturing* level and survived at least one long gap).

The dashboard shows both the headline percentage and a tier breakdown (Top 100 / 101–500 / 501–1k / 1k–2k / 2k+) so the user can see *where* their gaps are.

## Service worker strategy

Versioned cache (`czech-flash-v1`):

- **install**: precache the app shell (HTML, CSS, JS, manifest, icon, seed JSON).
- **activate**: delete any caches whose name ≠ current version. Bump `CACHE_VERSION` to invalidate on deploy.
- **fetch**: stale-while-revalidate for same-origin GETs. Serve cached response immediately; refresh in background. Falls back to cache on network failure.

Only same-origin requests are intercepted. Cross-origin (e.g. an analytics script you might add later) hits the network normally.

## Implementation plan (incremental, runnable after each step)

1. **Shell + DB.** `index.html` + `db.js` + `app.js`. Open the DB on load, log "ready."
2. **Seed loader.** `session.js::seedIfEmpty` reads `data/seed.json` and bulk-inserts cards. Verify in DevTools → Application → IndexedDB.
3. **SM-2.** Drop in `scheduler.js`; write tests in DevTools console (`applyRating(card, RATING.GOOD)`).
4. **Learn view.** `views/learn.js` — render front, flip, rate, advance. End-to-end working flashcard.
5. **Stats.** `stats.js` + `views/stats.js` — distribution chart first (cheapest), then daily-progress sparkline, then coverage.
6. **Settings.** New-words-per-day, export, reset.
7. **PWA.** Add `manifest.webmanifest`, `sw.js`, icon. Lighthouse audit. Test offline by toggling DevTools "Offline."
8. **Polish.** Animations, keyboard shortcuts, dark mode (already in CSS via `prefers-color-scheme`).

## What I would add next

- **FSRS** (Free Spaced Repetition Scheduler) — newer than SM-2, ML-tuned, measurably better retention. Drop-in replacement for `scheduler.js`.
- **Audio.** Pre-recorded or browser-TTS pronunciation, cached by the SW.
- **Word lists by theme** ("at the café", "directions"), filterable in Settings.
- **Sentence context.** Show one example sentence on the back of the card.
- **Real Czech-corpus frequency.** Replace the rough seed ranks with values from the Czech National Corpus (SYN2020).

## Running locally

The service worker needs an HTTP origin (it won't register on `file://`):

```bash
cd czech-flash
python3 -m http.server 8080
# open http://localhost:8080
```

To install as a PWA: open in Chrome → address bar install button. On iOS Safari: Share → Add to Home Screen.
