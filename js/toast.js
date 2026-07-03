// toast.js — tiny, non-blocking notifications (e.g. "leveled up!").

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    document.body.appendChild(container);
  }
  return container;
}

export function showLevelUpToast(level) {
  const el = document.createElement('div');
  el.className = `toast toast--lvl${level}`;
  el.textContent = `Level ${level} ↑`;
  getContainer().appendChild(el);

  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }, 1300);
}
