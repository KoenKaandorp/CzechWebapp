const PRONOUNS = ['já', 'ty', 'on/ona/ono', 'my', 'vy', 'oni/ony'];

let verbsCache = null;

async function loadVerbs() {
  if (verbsCache) return verbsCache;
  const r = await fetch('./data/verbs.json');
  verbsCache = await r.json();
  return verbsCache;
}

function generateCards(verbs, tense) {
  const cards = [];
  for (const verb of verbs) {
    const forms = verb[tense];
    if (!forms) continue;
    for (let i = 0; i < PRONOUNS.length; i++) {
      if (!forms[i]) continue;
      cards.push({ infinitive: verb.infinitive, en: verb.en, pronoun: PRONOUNS[i], answer: forms[i] });
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

export function mountVerbsView(el) {
  let mode = 'present';
  let queue = [];
  let done = 0;

  el.innerHTML = `
<div class="verbs">
  <h2 class="verbs__title">Verbs</h2>
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
</div>`;

  const modeBtns   = el.querySelectorAll('.seg-ctrl__btn');
  const card       = el.querySelector('#vb-card');
  const infEl      = el.querySelector('#vb-inf');
  const enEl       = el.querySelector('#vb-en');
  const pronounEl  = el.querySelector('#vb-pronoun');
  const hintEl     = el.querySelector('#vb-hint');
  const answerEl   = el.querySelector('#vb-answer');
  const ratingsEl  = el.querySelector('#vb-ratings');
  const progressEl = el.querySelector('#vb-progress');
  const emptyEl    = el.querySelector('#vb-empty');
  const stageEl    = el.querySelector('#vb-stage');
  const restartBtn = el.querySelector('#vb-restart');

  async function startMode(newMode) {
    mode = newMode;
    const data = await loadVerbs();
    queue = generateCards(data, mode);
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

  ratingsEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;
    const current = queue.shift();
    if (btn.dataset.r === 'again') {
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

  startMode('present');

  return { reload() {} };
}
