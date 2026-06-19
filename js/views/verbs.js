import { getAllWords, getWord, putWord, addReview, bumpSession } from '../db.js';
import { applyRating, RATING } from '../scheduler.js';

const PRONOUNS = ['já', 'ty', 'on/ona/ono', 'my', 'vy', 'oni/ony'];

let verbsCache = null;

async function loadVerbs() {
  if (verbsCache) return verbsCache;
  const r = await fetch('./data/verbs.json');
  verbsCache = await r.json();
  return verbsCache;
}

async function getSeenInfinitives() {
  const words = await getAllWords();
  return new Set(
    words
      .filter(w => w.repetitions > 0 && w.pos !== 'verb-conj')
      .map(w => w.cz)
  );
}

function verbConjId(infinitive, tense, pronounIndex) {
  return `verb:${infinitive}:${tense}:${pronounIndex}`;
}

async function getOrCreateConjCard(verb, tense, pronounIndex) {
  const id = verbConjId(verb.infinitive, tense, pronounIndex);
  const existing = await getWord(id);
  if (existing) return existing;
  return {
    id,
    cz: verb[tense][pronounIndex],
    en: `${verb.en} (${PRONOUNS[pronounIndex]}, ${tense})`,
    pos: 'verb-conj',
    frequencyRank: null,
    verbInfinitive: verb.infinitive,
    verbEn: verb.en,
    tense,
    pronounIndex,
    pronoun: PRONOUNS[pronounIndex],
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: 0,
    lastReviewedAt: null,
    level: 1,
    createdAt: Date.now(),
  };
}

function generateCards(verbs, tense) {
  const cards = [];
  for (const verb of verbs) {
    const forms = verb[tense];
    if (!forms) continue;
    for (let i = 0; i < PRONOUNS.length; i++) {
      if (!forms[i]) continue;
      cards.push({ verb, tense, pronounIndex: i, infinitive: verb.infinitive, en: verb.en, pronoun: PRONOUNS[i], answer: forms[i] });
    }
  }
  return shuffle(cards);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function mountVerbsView(el) {
  let mode = 'present';
  let queue = [];
  let done = 0;
  let selectedVerb = null; // null = all verbs, object = one specific verb

  el.innerHTML = `
<div class="verbs">
  <h2 class="verbs__title">Verbs</h2>

  <!-- Screen 1: Mode picker -->
  <div id="vb-mode-picker">
    <p class="verbs__subtitle">What do you want to practice?</p>
    <div class="verb-mode-btns">
      <button class="verb-mode-btn" id="vb-pick-one">Practice one verb</button>
      <button class="verb-mode-btn verb-mode-btn--accent" id="vb-pick-all">Practice all verbs</button>
    </div>
  </div>

  <!-- Screen 2: Verb list picker -->
  <div id="vb-verb-list" hidden>
    <button class="verbs__back-btn" id="vb-back-to-modes">← Back</button>
    <p class="verbs__subtitle">Choose a verb</p>
    <div class="verb-list" id="vb-verb-items"></div>
  </div>

  <!-- Screen 3: Tense + practice -->
  <div id="vb-practice" hidden>
    <button class="verbs__back-btn" id="vb-back-to-picker">← Back</button>
    <div class="seg-ctrl" role="group" aria-label="Tense">
      <button class="seg-ctrl__btn is-active" data-mode="present">Present</button>
      <button class="seg-ctrl__btn" data-mode="past">Past</button>
      <button class="seg-ctrl__btn" data-mode="imperative">Imperative</button>
    </div>
    <p class="verbs__progress" id="vb-progress">&nbsp;</p>
    <div class="card-stage" id="vb-stage">
      <div class="card verbs-card" id="vb-card" tabindex="0" role="button" aria-label="Flashcard, tap to reveal">
        <div class="verbs-card__face">
          <div class="verbs-card__inf" id="vb-inf"></div>
          <div class="verbs-card__en" id="vb-en"></div>
          <div class="verbs-card__pronoun" id="vb-pronoun"></div>
          <div class="verbs-card__hint" id="vb-hint">Tap to reveal</div>
          <div class="verbs-card__answer" id="vb-answer" hidden></div>
        </div>
      </div>
    </div>
    <div class="verbs-ratings" id="vb-ratings" hidden>
      <button class="verbs-rating verbs-rating--again" data-r="again">Again</button>
      <button class="verbs-rating verbs-rating--good"  data-r="good">Good</button>
      <button class="verbs-rating verbs-rating--easy"  data-r="easy">Easy</button>
    </div>
    <div class="verbs-empty" id="vb-empty" hidden>
      <p class="verbs-empty__msg">All done!</p>
      <button class="btn" id="vb-restart">Restart</button>
    </div>
  </div>
</div>`;

  const modePickerEl   = el.querySelector('#vb-mode-picker');
  const verbListEl     = el.querySelector('#vb-verb-list');
  const practiceEl     = el.querySelector('#vb-practice');
  const pickOneBtn     = el.querySelector('#vb-pick-one');
  const pickAllBtn     = el.querySelector('#vb-pick-all');
  const backToModesBtn = el.querySelector('#vb-back-to-modes');
  const backToPickerBtn= el.querySelector('#vb-back-to-picker');
  const verbItemsEl    = el.querySelector('#vb-verb-items');
  const modeBtns       = el.querySelectorAll('.seg-ctrl__btn');
  const card           = el.querySelector('#vb-card');
  const infEl          = el.querySelector('#vb-inf');
  const enEl           = el.querySelector('#vb-en');
  const pronounEl      = el.querySelector('#vb-pronoun');
  const hintEl         = el.querySelector('#vb-hint');
  const answerEl       = el.querySelector('#vb-answer');
  const ratingsEl      = el.querySelector('#vb-ratings');
  const progressEl     = el.querySelector('#vb-progress');
  const emptyEl        = el.querySelector('#vb-empty');
  const stageEl        = el.querySelector('#vb-stage');
  const restartBtn     = el.querySelector('#vb-restart');

  function showScreen(name) {
    modePickerEl.hidden = name !== 'picker';
    verbListEl.hidden   = name !== 'list';
    practiceEl.hidden   = name !== 'practice';
  }

  async function showVerbList() {
    const [data, seenInfinitives] = await Promise.all([loadVerbs(), getSeenInfinitives()]);
    const filtered = data.filter(v => seenInfinitives.has(v.infinitive));
    if (filtered.length === 0) {
      verbItemsEl.innerHTML = '<p class="verb-list__empty">No verbs learned yet. Practice words first!</p>';
    } else {
      verbItemsEl.innerHTML = filtered
        .map(v => `<button class="verb-list__item" data-inf="${v.infinitive}"><span class="verb-list__cz">${v.infinitive}</span><span class="verb-list__en">${v.en}</span></button>`)
        .join('');
    }
    showScreen('list');
  }

  verbItemsEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-inf]');
    if (!btn) return;
    const data = await loadVerbs();
    selectedVerb = data.find(v => v.infinitive === btn.dataset.inf) || null;
    showScreen('practice');
    startMode(mode);
  });

  pickOneBtn.addEventListener('click', () => showVerbList());

  pickAllBtn.addEventListener('click', () => {
    selectedVerb = null;
    showScreen('practice');
    startMode(mode);
  });

  backToModesBtn.addEventListener('click', () => showScreen('picker'));

  backToPickerBtn.addEventListener('click', () => {
    if (selectedVerb) {
      showScreen('list');
    } else {
      showScreen('picker');
    }
  });

  async function startMode(newMode) {
    mode = newMode;
    const [data, seenInfinitives] = await Promise.all([loadVerbs(), getSeenInfinitives()]);
    const filtered = selectedVerb
      ? [selectedVerb]
      : data.filter(v => seenInfinitives.has(v.infinitive));
    queue = generateCards(filtered, mode);
    done = 0;
    showCard();
  }

  function showCard() {
    if (queue.length === 0) {
      stageEl.hidden = true;
      ratingsEl.hidden = true;
      progressEl.textContent = '';
      emptyEl.hidden = false;
      return;
    }

    stageEl.hidden = false;
    emptyEl.hidden = true;
    ratingsEl.hidden = true;
    answerEl.hidden = true;
    hintEl.hidden = false;
    card.classList.remove('is-flipped');

    const c = queue[0];
    infEl.textContent = c.infinitive;
    enEl.textContent = c.en;
    pronounEl.textContent = c.pronoun;
    answerEl.textContent = c.answer;
    progressEl.textContent = `${done} done · ${queue.length} left`;
  }

  function reveal() {
    if (!answerEl.hidden) return;
    answerEl.hidden = false;
    hintEl.hidden = true;
    card.classList.add('is-flipped');
    ratingsEl.hidden = false;
  }

  card.addEventListener('click', reveal);
  card.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
  });

  ratingsEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;

    const current = queue.shift();
    const ratingKey = btn.dataset.r;
    const ratingObj = RATING[ratingKey.toUpperCase()];

    // Load or create the DB record for this conjugation, then apply SM-2
    const dbCard = await getOrCreateConjCard(current.verb, current.tense, current.pronounIndex);
    const updated = applyRating(dbCard, ratingObj);

    await putWord(updated);
    await addReview({
      wordId: updated.id,
      ratedAt: updated.lastReviewedAt,
      quality: ratingObj.quality,
      prevInterval: updated._diff.prev.interval,
      newInterval: updated.interval,
      prevEF: updated._diff.prev.ef,
      newEF: updated.ef,
    });

    const wasNew = dbCard.repetitions === 0 && !dbCard.lastReviewedAt;
    const patch = { reviewed: 1, [ratingKey]: 1 };
    if (wasNew && ratingKey !== 'again') patch.learned = 1;
    await bumpSession(todayKey(), patch);

    if (ratingKey === 'again') {
      queue.splice(Math.min(3, queue.length), 0, current);
    } else {
      done++;
    }
    showCard();
  });

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      startMode(btn.dataset.mode);
    });
  });

  restartBtn.addEventListener('click', () => startMode(mode));

  showScreen('picker');

  return { reload() {} };
}
