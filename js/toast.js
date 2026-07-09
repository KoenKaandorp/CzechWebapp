// toast.js — tiny non-blocking notifications (level-ups) and bigger
// celebratory bursts (streak / mastery milestones).

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-stack';
    document.body.appendChild(container);
  }
  return container;
}

export function vibrate(pattern) {
  // Best-effort only — some browser contexts (embedded previews, permission
  // policies) throw instead of no-op-ing, and this must never break the
  // caller's UI update.
  try { navigator.vibrate?.(pattern); } catch {}
}

export function showLevelUpToast(level) {
  vibrate(35);

  const el = document.createElement('div');
  el.className = `toast toast--lvl${level}`;
  el.innerHTML = `<span aria-hidden="true">✨</span> Level ${level}!`;
  getContainer().appendChild(el);

  requestAnimationFrame(() => el.classList.add('is-visible'));
  el.addEventListener('animationend', () => el.remove());
  // Fallback: under reduced-motion the pop animation is suppressed, so
  // `animationend` never fires — remove on a timer so the toast doesn't linger.
  setTimeout(() => el.remove(), 2500);
}

const CONFETTI_COLORS = ['#2E5E4E', '#3D7A66', '#B85C3E', '#F2B84B', '#5B8893'];

// A bigger, rarer celebration for streak/mastery milestones — confetti +
// a punchier vibration pattern. Auto-dismisses, or tap to skip early.
export function showMilestoneBurst({ title, subtitle = '' }) {
  vibrate([30, 60, 30, 60, 90]);

  const overlay = document.createElement('div');
  overlay.className = 'milestone-overlay';

  for (let i = 0; i < 26; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.animationDuration = `${1400 + Math.random() * 900}ms`;
    piece.style.animationDelay = `${Math.random() * 250}ms`;
    overlay.appendChild(piece);
  }

  const card = document.createElement('div');
  card.className = 'milestone-card';
  card.innerHTML = `
    <div class="milestone-card__title">${title}</div>
    ${subtitle ? `<div class="milestone-card__subtitle">${subtitle}</div>` : ''}
  `;
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => card.classList.add('is-visible'));

  const dismiss = () => overlay.remove();
  overlay.addEventListener('click', dismiss);
  setTimeout(dismiss, 2300);
}
