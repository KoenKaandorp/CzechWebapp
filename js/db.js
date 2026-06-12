// db.js — thin promise wrapper around IndexedDB.
// Schema:
//   words    { id, cz, en, pos, frequencyRank, ef, interval, repetitions,
//              lapses, dueAt, lastReviewedAt, createdAt }
//     indexes: by-due (dueAt), by-rank (frequencyRank), by-level (level)
//   reviews  { id (auto), wordId, ratedAt, quality, prevInterval, newInterval, prevEF, newEF }
//     indexes: by-word (wordId), by-date (ratedAt)
//   sessions { date (YYYY-MM-DD), reviewed, learned, again, hard, good, easy }
//   meta     { key, value }   — settings, schema version, last-seed marker

const DB_NAME = 'czech-flash';
const DB_VERSION = 1;

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => migrate(e.target.result, e.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    const words = db.createObjectStore('words', { keyPath: 'id' });
    words.createIndex('by-due', 'dueAt');
    words.createIndex('by-rank', 'frequencyRank');

    const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
    reviews.createIndex('by-word', 'wordId');
    reviews.createIndex('by-date', 'ratedAt');

    db.createObjectStore('sessions', { keyPath: 'date' });
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  // future migrations: if (oldVersion < 2) { ... }
}

// ---------- low-level helpers ----------
function tx(db, stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- words ----------
export async function putWord(word) {
  const db = await openDB();
  return wrap(tx(db, ['words'], 'readwrite').objectStore('words').put(word));
}
export async function getWord(id) {
  const db = await openDB();
  return wrap(tx(db, ['words']).objectStore('words').get(id));
}
export async function getAllWords() {
  const db = await openDB();
  return wrap(tx(db, ['words']).objectStore('words').getAll());
}
export async function countWords() {
  const db = await openDB();
  return wrap(tx(db, ['words']).objectStore('words').count());
}
export async function bulkPutWords(words) {
  const db = await openDB();
  const t = tx(db, ['words'], 'readwrite');
  const store = t.objectStore('words');
  for (const w of words) store.put(w);
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

// Cards due now (or earlier), ordered by oldest due first.
export async function getDueWords(now = Date.now(), limit = 50) {
  const db = await openDB();
  const idx = tx(db, ['words']).objectStore('words').index('by-due');
  const range = IDBKeyRange.upperBound(now);
  const out = [];
  return new Promise((resolve, reject) => {
    idx.openCursor(range).onsuccess = (e) => {
      const cur = e.target.result;
      if (
        cur &&
        out.length < limit &&
        cur.value.repetitions > 0
      ) {
        out.push(cur.value);
      }

      if (cur) {
        cur.continue();
      } else {
        resolve(out);
      }
    };
  });
}

// Bonus words for "keep practicing":
//   1. Words introduced today (repetitions === 1, reviewed today) — shown first.
//   2. Remaining slots split evenly: 50% hardest learned words, 50% random learned words.
export async function getBonusWords(limit = 20, todayStart = 0) {
  const all = await getAllWords();

  const todayNew = all.filter(
    w => w.repetitions <= 2 && w.lastReviewedAt !== null && w.lastReviewedAt >= todayStart
  );

  const todayNewIds = new Set(todayNew.map(w => w.id));
  const learned = all.filter(w => w.repetitions > 0 && !todayNewIds.has(w.id));

  learned.sort((a, b) => a.ef - b.ef || b.lapses - a.lapses);

  const remaining = Math.max(0, limit - todayNew.length);
  const hardestCount = Math.ceil(remaining / 2);
  const hardest = learned.slice(0, hardestCount);

  const randomPool = learned.slice(hardestCount);
  for (let i = randomPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [randomPool[i], randomPool[j]] = [randomPool[j], randomPool[i]];
  }
  const random = randomPool.slice(0, remaining - hardestCount);

  const combined = [...todayNew, ...hardest, ...random];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}

// New words (never reviewed), frequency-prioritised but shuffled to avoid alphabetical runs.
// Collects a pool 4× the limit in rank order, shuffles it, then returns the first `limit`.
export async function getNewWords(limit = 10) {
  const db = await openDB();
  const idx = tx(db, ['words']).objectStore('words').index('by-rank');
  const poolSize = Math.max(limit * 4, 40);
  const pool = [];
  await new Promise((resolve) => {
    idx.openCursor().onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur || pool.length >= poolSize) return resolve();
      if (cur.value.repetitions === 0 && !cur.value.lastReviewedAt) pool.push(cur.value);
      cur.continue();
    };
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

// ---------- reviews ----------
export async function addReview(review) {
  const db = await openDB();
  return wrap(tx(db, ['reviews'], 'readwrite').objectStore('reviews').add(review));
}
export async function getReviewsSince(timestamp) {
  const db = await openDB();
  const idx = tx(db, ['reviews']).objectStore('reviews').index('by-date');
  return wrap(idx.getAll(IDBKeyRange.lowerBound(timestamp)));
}

// ---------- sessions ----------
export async function bumpSession(date, patch) {
  const db = await openDB();
  const t = tx(db, ['sessions'], 'readwrite');
  const store = t.objectStore('sessions');
  const existing = await wrap(store.get(date)) || {
    date, reviewed: 0, learned: 0, again: 0, hard: 0, good: 0, easy: 0,
  };
  for (const k of Object.keys(patch)) existing[k] = (existing[k] || 0) + patch[k];
  store.put(existing);
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function getRecentSessions(days = 30) {
  const db = await openDB();
  return wrap(tx(db, ['sessions']).objectStore('sessions').getAll());
}

// ---------- meta ----------
export async function getMeta(key, fallback = null) {
  const db = await openDB();
  const row = await wrap(tx(db, ['meta']).objectStore('meta').get(key));
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  const db = await openDB();
  return wrap(tx(db, ['meta'], 'readwrite').objectStore('meta').put({ key, value }));
}

// ---------- danger ----------
export async function wipeAll() {
  const db = await openDB();
  const t = tx(db, ['words', 'reviews', 'sessions', 'meta'], 'readwrite');
  ['words', 'reviews', 'sessions', 'meta'].forEach(s => t.objectStore(s).clear());
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}
