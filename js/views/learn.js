// views/learn.js — flashcard view.
//
// Interaction:
//   - Tap card (or press Space) to flip.
//   - Tap a rating button (or press 1–4) once flipped.
//   - Card animates out; next card is fetched and shown.

import { RATING } from '../scheduler.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function mountLearnView(root, session) {
  root.innerHTML = `
    <section class="learn" aria-label="Flashcard practice">
      <header class="learn__header">
        <div class="meter" id="learn-meter">
          <span class="meter__item"><b id="learn-due">0</b> due</span>
          <span class="meter__item"><b id="learn-new">0</b> new</span>
          <span class="meter__item"><b id="learn-done">0</b> done today</span>
        </div>
      </header>

      <div class="card-stage" id="card-stage">
        <button class="card" id="card" type="button" aria-live="polite">
          <div class="card__face card__face--front">
            <p class="card__pos" id="card-pos"></p>
            <p class="card__word" id="card-cz">—</p>
            <p class="card__hint">tap to reveal</p>
          </div>
          <div class="card__face card__face--back" hidden>
            <p class="card__word card__word--en" id="card-en">—</p>
          </div>
        </button>
      </div>

      <div class="ratings" id="ratings" hidden>
        <button class="rating rating--again" data-r="AGAIN">
          <span class="rating__label">Again</span><span class="rating__key">1</span>
        </button>
        <button class="rating rating--hard"  data-r="HARD">
          <span class="rating__label">Hard</span><span class="rating__key">2</span>
        </button>
        <button class="rating rating--good"  data-r="GOOD">
          <span class="rating__label">Good</span><span class="rating__key">3</span>
        </button>
        <button class="rating rating--easy"  data-r="EASY">
          <span class="rating__label">Easy</span><span class="rating__key">4</span>
        </button>
      </div>

      <div class="empty" id="empty" hidden>
        <h2>Nothing due right now.</h2>
        <p>Come back later, or raise the daily new-word limit in Settings.</p>
        <button class="btn btn--practice" id="practice-more" type="button">Keep practicing</button>
      </div>
    </section>
  `;

  const els = {
    card:    $('#card', root),
    cz:      $('#card-cz', root),
    en:      $('#card-en', root),
    pos:     $('#card-pos', root),
    front:   $('.card__face--front', root),
    back:    $('.card__face--back', root),
    ratings: $('#ratings', root),
    empty:       $('#empty', root),
    practiceMore: $('#practice-more', root),
    stage:   $('#card-stage', root),
    due:     $('#learn-due', root),
    newC:    $('#learn-new', root),
    done:    $('#learn-done', root),
  };

  let current = null;
  let revealed = false;

  async function loadNext() {
    const card = await session.nextCard();
    current = card;
    revealed = false;
    if (!card) {
      els.stage.hidden = true;
      els.ratings.hidden = true;
      els.empty.hidden = false;
      await refreshMeter();
      return;
    }
    els.empty.hidden = true;
    els.stage.hidden = false;
    els.cz.textContent = card.cz;
    els.en.textContent = card.en;
    els.pos.textContent = card.pos || '';
    els.front.hidden = false;
    els.back.hidden  = true;
    els.ratings.hidden = true;
    els.card.classList.remove('is-flipped');
    els.stage.classList.add('enter');
    requestAnimationFrame(() => els.stage.classList.remove('enter'));
    await refreshMeter();
  }

  function flip() {
    if (!current) return;

    revealed = !revealed;

    els.front.hidden = revealed;
    els.back.hidden  = !revealed;

    els.card.classList.toggle('is-flipped', revealed);
    els.ratings.hidden = !revealed;
  }

  async function rate(ratingKey) {
    if (!current) return;
    const rating = RATING[ratingKey];
    if (!rating) return;
    els.stage.classList.add('exit');
    await session.rate(current, rating);
    setTimeout(() => {
      els.stage.classList.remove('exit');
      loadNext();
    }, 180);
  }

  async function refreshMeter() {
    const s = await session.stats();
    els.due.textContent  = session.queue.length;
    els.newC.textContent = s.newRemaining;
    els.done.textContent = s.reviewedToday;
  }

  // ---- events ----
  els.practiceMore.addEventListener('click', async () => {
    await session.refillBonus();
    loadNext();
  });

  els.card.addEventListener('click', flip);
  els.ratings.addEventListener('click', (e) => {
    const btn = e.target.closest('.rating');
    if (btn) rate(btn.dataset.r);
  });

  function onKey(e) {
    if (root.hidden) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === '1') rate('AGAIN');
    else if (e.key === '2') rate('HARD');
    else if (e.key === '3') rate('GOOD');
    else if (e.key === '4') rate('EASY');
  }
  document.addEventListener('keydown', onKey);

  // Initial load.
  loadNext();

  return { reload: loadNext };
}
