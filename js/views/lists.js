let listsCache = null;

async function loadLists() {
  if (listsCache) return listsCache;
  const r = await fetch('./data/lists.json');
  const data = await r.json();
  listsCache = data.lists;
  return listsCache;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mountListsView(el) {
  let currentList = null;
  let flashQueue  = [];
  let flashIndex  = 0;

  el.innerHTML = `
<div class="lists">
  <h2 class="lists__title">Lists</h2>

  <!-- Screen 1: index -->
  <div id="ls-index">
    <div id="ls-categories"></div>
  </div>

  <!-- Screen 2: detail (mode pick + panels) -->
  <div id="ls-detail" hidden>
    <button class="lists__back-btn" id="ls-back">← Back</button>
    <h3 class="lists__list-name" id="ls-name"></h3>
    <div class="list-mode-btns">
      <button class="list-mode-btn" id="ls-browse-btn">Browse</button>
      <button class="list-mode-btn list-mode-btn--accent" id="ls-flash-btn">Flashcards</button>
    </div>

    <!-- Browse panel -->
    <div id="ls-browse" hidden>
      <table class="list-table" id="ls-table"></table>
    </div>

    <!-- Flashcard panel -->
    <div id="ls-flash" hidden>
      <p class="lists__progress" id="ls-progress">&nbsp;</p>
      <div class="card-stage">
        <div class="card lists-card" id="ls-card" tabindex="0" role="button" aria-label="Flashcard, tap to reveal">
          <div class="lists-card__face">
            <div class="lists-card__cz" id="ls-cz"></div>
            <div class="lists-card__hint" id="ls-hint">Tap to reveal</div>
            <div class="lists-card__en" id="ls-en" hidden></div>
          </div>
        </div>
      </div>
      <div class="lists-actions" id="ls-actions" hidden>
        <button class="list-mode-btn list-mode-btn--accent" id="ls-next">Next →</button>
      </div>
      <div class="lists-empty" id="ls-flash-done" hidden>
        <p class="lists-empty__msg">All done!</p>
        <button class="btn" id="ls-restart">Restart</button>
      </div>
    </div>
  </div>
</div>`;

  const indexEl      = el.querySelector('#ls-index');
  const detailEl     = el.querySelector('#ls-detail');
  const categoriesEl = el.querySelector('#ls-categories');
  const backBtn      = el.querySelector('#ls-back');
  const nameEl       = el.querySelector('#ls-name');
  const browseModeBtn= el.querySelector('#ls-browse-btn');
  const flashModeBtn = el.querySelector('#ls-flash-btn');
  const browseEl     = el.querySelector('#ls-browse');
  const tableEl      = el.querySelector('#ls-table');
  const flashEl      = el.querySelector('#ls-flash');
  const progressEl   = el.querySelector('#ls-progress');
  const card         = el.querySelector('#ls-card');
  const czEl         = el.querySelector('#ls-cz');
  const hintEl       = el.querySelector('#ls-hint');
  const enEl         = el.querySelector('#ls-en');
  const actionsEl    = el.querySelector('#ls-actions');
  const flashDoneEl  = el.querySelector('#ls-flash-done');
  const nextBtn      = el.querySelector('#ls-next');
  const restartBtn   = el.querySelector('#ls-restart');

  function showScreen(name) {
    indexEl.hidden  = name !== 'index';
    detailEl.hidden = name !== 'detail';
  }

  function showPanel(name) {
    browseEl.hidden = name !== 'browse';
    flashEl.hidden  = name !== 'flash';
  }

  async function renderIndex() {
    const lists = await loadLists();
    const byCategory = {};
    for (const list of lists) {
      (byCategory[list.category] ??= []).push(list);
    }

    categoriesEl.innerHTML = Object.entries(byCategory).map(([cat, items]) => `
      <div class="lists-category">
        <p class="lists-category__label">${capitalize(cat)}</p>
        ${items.map(l => `
          <button class="lists-row" data-id="${l.id}">
            <span class="lists-row__name">${l.name}</span>
            <span class="lists-row__count">${l.items.length}</span>
          </button>
        `).join('')}
      </div>
    `).join('');
  }

  categoriesEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const lists = await loadLists();
    currentList = lists.find(l => l.id === btn.dataset.id) || null;
    if (!currentList) return;
    nameEl.textContent = currentList.name;
    showPanel('none');
    showScreen('detail');
  });

  backBtn.addEventListener('click', () => {
    showPanel('none');
    showScreen('index');
  });

  browseModeBtn.addEventListener('click', () => {
    tableEl.innerHTML = currentList.items.map(item => `
      <tr>
        <td class="list-table__cz">${item.czech}</td>
        <td class="list-table__en">${item.english}</td>
      </tr>
    `).join('');
    showPanel('browse');
  });

  flashModeBtn.addEventListener('click', () => startFlash());

  function startFlash() {
    flashQueue = shuffle([...currentList.items]);
    flashIndex = 0;
    card.hidden = false;
    flashDoneEl.hidden = true;
    showPanel('flash');
    showFlashCard();
  }

  function showFlashCard() {
    if (flashIndex >= flashQueue.length) {
      card.hidden = true;
      actionsEl.hidden = true;
      progressEl.textContent = '';
      flashDoneEl.hidden = false;
      return;
    }
    const item = flashQueue[flashIndex];
    czEl.textContent = item.czech;
    enEl.textContent = item.english;
    enEl.hidden = true;
    hintEl.hidden = false;
    actionsEl.hidden = true;
    card.classList.remove('is-flipped');
    progressEl.textContent = `${flashIndex + 1} / ${flashQueue.length}`;
  }

  function reveal() {
    if (!enEl.hidden) return;
    enEl.hidden = false;
    hintEl.hidden = true;
    card.classList.add('is-flipped');
    actionsEl.hidden = false;
  }

  card.addEventListener('click', reveal);
  card.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
  });

  nextBtn.addEventListener('click', () => {
    flashIndex++;
    showFlashCard();
  });

  restartBtn.addEventListener('click', () => startFlash());

  renderIndex();
  showScreen('index');

  return { reload() {} };
}
