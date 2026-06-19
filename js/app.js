// app.js — bootstrap, tab routing, lifecycle.

import { Session, seedNewWords } from './session.js';
import { mountLearnView }    from './views/learn.js';
import { mountStatsView }    from './views/stats.js';
import { mountSettingsView } from './views/settings.js';
import { mountVerbsView }    from './views/verbs.js';
import { mountListsView }    from './views/lists.js';
import { initTimer }         from './timer.js';

const views = {
  learn:    { el: document.getElementById('view-learn'),    mounted: null },
  verbs:    { el: document.getElementById('view-verbs'),    mounted: null },
  lists:    { el: document.getElementById('view-lists'),    mounted: null },
  stats:    { el: document.getElementById('view-stats'),    mounted: null },
  settings: { el: document.getElementById('view-settings'), mounted: null },
};

const session = new Session();

async function boot() {
  // 1. Register service worker (best-effort; app still works without it after first load).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW failed:', err));
  }

  // 2. Seed vocabulary if first run.
  const added = await seedNewWords('./data/seed.json');
  if (added) console.info(`Added ${added} new words.`);

  // 3. Init the session manager and time tracker.
  await session.init();
  await initTimer();

  // 4. Mount the default view.
  switchTab('learn');

  // 5. Tab bar wiring.
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(name) {
  for (const [key, v] of Object.entries(views)) {
    v.el.hidden = (key !== name);
  }
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === name);
    btn.setAttribute('aria-current', btn.dataset.tab === name ? 'page' : 'false');
  });

  const v = views[name];
  if (!v.mounted) {
    if (name === 'learn')    v.mounted = mountLearnView(v.el, session);
    if (name === 'verbs')    v.mounted = mountVerbsView(v.el);
    if (name === 'lists')    v.mounted = mountListsView(v.el);
    if (name === 'stats')    v.mounted = mountStatsView(v.el);
    if (name === 'settings') v.mounted = mountSettingsView(v.el, { onReset: resetAndReload });
  } else {
    v.mounted.reload?.();
  }
}

async function resetAndReload() {
  // Re-seed and re-mount learn view fresh.
  await seedNewWords('./data/seed.json');
  await session.init();
  for (const v of Object.values(views)) v.mounted = null;
  switchTab('learn');
}

boot();
