// lang.js — language selection. Stored in localStorage so it survives page reloads
// without needing IndexedDB. Each language gets its own DB so progress is isolated.

const CONFIGS = {
  cz: {
    label: 'Czech',
    dbName: 'czech-flash',
    idPrefix: 'cz',
    seed:  './data/seed.json',
    verbs: './data/verbs.json',
    lists: './data/lists.json',
  },
  nl: {
    label: 'Dutch',
    dbName: 'dutch-flash',
    idPrefix: 'nl',
    seed:  './data/seed_dutch.json',
    verbs: './data/verbs_dutch.json',
    lists: './data/lists_dutch.json',
  },
};

export const LANG = localStorage.getItem('lang') || 'cz';
export const CONFIG = CONFIGS[LANG] ?? CONFIGS.cz;

export function setLang(code) {
  if (code === LANG) return;
  localStorage.setItem('lang', code);
  location.reload();
}
