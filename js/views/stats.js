// views/stats.js — dashboard.
// Charts are hand-rolled SVG so the app has zero chart-library overhead.

import { levelDistribution, dailyProgress, comprehensionOverTime, coverageEstimate } from '../stats.js';
import { totalMs, formatTime } from '../timer.js';

const LEVEL_LABELS = ['New', 'Learning', 'Familiar', 'Known', 'Mastered'];

export function mountStatsView(root) {
  root.innerHTML = `
    <section class="stats">
      <h1 class="stats__title">Your progress</h1>

      <div class="panel">
        <h2 class="panel__title">Reading comprehension</h2>
        <p class="panel__lede">Estimated share of typical Czech text you can understand, based on the words you've mastered.</p>
        <div class="coverage" id="coverage"></div>
        <div class="tiers" id="tiers"></div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Words by level</h2>
        <div id="dist-chart" class="chart chart--bars"></div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Last 30 days</h2>
        <p class="panel__lede">Reviews completed each day.</p>
        <div id="daily-chart" class="chart chart--spark"></div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Mastered words over time</h2>
        <div id="growth-chart" class="chart chart--spark"></div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Time spent</h2>
        <div class="time-stats" id="time-stats"></div>
      </div>
    </section>
  `;

  refresh();
  return { reload: refresh };

  async function refresh() {
    const [dist, daily, growth, coverage, total] = await Promise.all([
      levelDistribution(),
      dailyProgress(30),
      comprehensionOverTime(30),
      coverageEstimate(),
      totalMs(),
    ]);

    renderCoverage(root.querySelector('#coverage'), coverage);
    renderTiers(root.querySelector('#tiers'), coverage.tiers);
    renderBars(root.querySelector('#dist-chart'), dist);
    renderSpark(root.querySelector('#daily-chart'), daily.map(d => d.reviewed), daily.map(d => d.date));
    renderSpark(root.querySelector('#growth-chart'), growth.map(d => d.known), growth.map(d => d.date), { fill: true });
    renderTimeStats(root.querySelector('#time-stats'), total);
  }
}

function renderTimeStats(el, totalMillis) {
  el.innerHTML = `
    <div class="time-row">
      <span class="time-label">Total time</span>
      <span class="time-value">${formatTime(totalMillis)}</span>
    </div>
  `;
}

function renderCoverage(el, { coverage, knownCount, total }) {
  const pct = Math.round(coverage * 100);
  el.innerHTML = `
    <div class="coverage__row">
      <span class="coverage__big">${pct}%</span>
      <span class="coverage__sub">of typical running text</span>
    </div>
    <div class="coverage__bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="coverage__fill" style="width:${pct}%"></div>
    </div>
    <p class="coverage__meta">${knownCount} of ${total} words mastered</p>
  `;
}

function renderTiers(el, tiers) {
  el.innerHTML = tiers.map(t => {
    const pct = Math.round(t.pct * 100);
    return `
      <div class="tier">
        <div class="tier__head">
          <span class="tier__label">${t.label}</span>
          <span class="tier__count">${pct}%</span>
        </div>
        <div class="tier__bar"><div class="tier__fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

function renderBars(el, { buckets, total, seen }) {
  const max = Math.max(1, ...buckets);
  const W = 320, H = 180, P = 28;
  const innerW = W - P * 2, innerH = H - P - 24;
  const barW = innerW / buckets.length - 12;

  const bars = buckets.map((v, i) => {
    const h = (v / max) * innerH;
    const x = P + i * (innerW / buckets.length) + 6;
    const y = P + innerH - h;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4"
              class="bar bar--lvl${i + 1}"></rect>
        <text x="${x + barW / 2}" y="${y - 6}" class="bar__value">${v}</text>
        <text x="${x + barW / 2}" y="${H - 6}" class="bar__label">${LEVEL_LABELS[i]}</text>
      </g>`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Words per level">
      ${bars}
    </svg>
    <p class="chart__caption">${total} total words tracked · ${seen} learned</p>
  `;
}

function renderSpark(el, values, labels, { fill = false } = {}) {
  if (!values.length || values.every(v => v === 0)) {
    el.innerHTML = `<p class="chart__empty">No data yet — review a few cards to start the chart.</p>`;
    return;
  }
  const W = 320, H = 120, P = 16;
  const max = Math.max(1, ...values);
  const stepX = (W - P * 2) / (values.length - 1 || 1);

  const pts = values.map((v, i) => {
    const x = P + i * stepX;
    const y = P + (H - P * 2) * (1 - v / max);
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = fill
    ? `${line} L${pts[pts.length-1][0]},${H - P} L${pts[0][0]},${H - P} Z`
    : null;

  const first = labels[0]?.slice(5);
  const last  = labels[labels.length - 1]?.slice(5);

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend over time">
      ${area ? `<path d="${area}" class="spark__area"/>` : ''}
      <path d="${line}" class="spark__line"/>
      <circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="3" class="spark__dot"/>
    </svg>
    <div class="chart__axis"><span>${first}</span><span>peak: ${max}</span><span>${last}</span></div>
  `;
}
