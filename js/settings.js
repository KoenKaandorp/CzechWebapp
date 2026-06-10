// views/settings.js — preferences and dangerous actions.

import * as db from '../db.js';

export function mountSettingsView(root, { onReset } = {}) {
  root.innerHTML = `
    <section class="settings">
      <h1 class="settings__title">Settings</h1>

      <div class="panel">
        <label class="field">
          <span class="field__label">New words per day</span>
          <input id="new-per-day" type="number" min="0" max="50" step="1" class="field__input" />
          <span class="field__hint">How many never-before-seen cards to introduce daily.</span>
        </label>
      </div>

      <div class="panel">
        <h2 class="panel__title">Data</h2>
        <button class="btn btn--ghost" id="export">Export progress (JSON)</button>
        <button class="btn btn--danger" id="reset">Reset everything</button>
        <p class="panel__lede">Reset wipes all words, reviews, and progress, then re-seeds from the starter list.</p>
      </div>

      <div class="panel">
        <h2 class="panel__title">About</h2>
        <p class="panel__lede">
          Spaced repetition uses the SM-2 algorithm. Words you fail come back inside the same session;
          words you nail keep stretching their interval until they're considered mastered (interval ≥ 21 days).
          The "5 levels" you see on the dashboard are buckets derived from each card's current interval.
        </p>
      </div>
    </section>
  `;

  const input = root.querySelector('#new-per-day');
  db.getMeta('newPerDay', 10).then(v => { input.value = v; });
  input.addEventListener('change', async () => {
    const v = Math.max(0, Math.min(50, parseInt(input.value, 10) || 0));
    input.value = v;
    await db.setMeta('newPerDay', v);
  });

  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('Wipe all progress and start over?')) return;
    await db.wipeAll();
    onReset?.();
  });

  root.querySelector('#export').addEventListener('click', async () => {
    const data = {
      exportedAt: new Date().toISOString(),
      words: await db.getAllWords(),
      sessions: await db.getRecentSessions(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `czech-flash-${data.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
}
