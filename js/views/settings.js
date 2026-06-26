// views/settings.js — preferences and dangerous actions.

import * as db from '../db.js';
import { LANG, setLang } from '../lang.js';

export function mountSettingsView(root, { onReset } = {}) {
  root.innerHTML = `
    <section class="settings">
      <h1 class="settings__title">Settings</h1>

      <div class="panel">
        <h2 class="panel__title">Language</h2>
        <p class="panel__lede">Each language has its own separate progress database.</p>
        <div class="seg-ctrl" role="group" aria-label="Language">
          <button class="seg-ctrl__btn ${LANG === 'cz' ? 'is-active' : ''}" data-lang="cz">Czech</button>
          <button class="seg-ctrl__btn ${LANG === 'nl' ? 'is-active' : ''}" data-lang="nl">Dutch</button>
        </div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Data</h2>
        <button class="btn btn--ghost" id="export">Export progress (JSON)</button>
        <button class="btn btn--ghost" id="import-btn">Import progress (JSON)</button>
        <input type="file" id="import-input" accept=".json" style="display:none">
        <button class="btn btn--danger" id="reset">Reset everything</button>
        <p class="panel__lede">Reset wipes all words, reviews, and progress for the current language, then re-seeds from the starter list.</p>
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

  root.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  root.querySelector('#reset').addEventListener('click', async () => {
    if (!confirm('Wipe all progress and start over?')) return;
    await db.wipeAll();
    onReset?.();
  });

  root.querySelector('#import-btn').addEventListener('click', () => {
    root.querySelector('#import-input').click();
  });

  root.querySelector('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';   // reset so the same file can be re-selected
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.words) || !Array.isArray(data.sessions)) {
        alert('Invalid export file — missing words or sessions.'); return;
      }
      if (!confirm(`Import ${data.words.length} words and ${data.sessions.length} sessions?\nThis will replace all current progress for this language.`)) return;
      await db.wipeAll();
      await db.bulkPutWords(data.words);
      await db.bulkPutSessions(data.sessions);
      onReset?.();
    } catch {
      alert('Failed to import. Make sure the file is a valid export from this app.');
    }
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
    a.download = `flash-${data.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
}
