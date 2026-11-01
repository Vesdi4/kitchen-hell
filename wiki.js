'use strict';
/* Guide page: fills the data tables from core.js so the guide never drifts from the game. */

const $ = s => document.querySelector(s);
document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
const iconFor = e => ICON_MAP[e] || ICON_MAP[e + '️'] || ICON_MAP[e.replace(/️/g, '')];
const ico = e => iconFor(e) ? `<svg class="gi" aria-hidden="true"><use href="#gi-${iconFor(e)}"/></svg>` : '';
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Same order as PAN_MARKS in ui.js.
const CUTS = ['Scrap cut', 'Chuck', 'Sirloin', 'Ribeye', 'T-bone', 'Porterhouse', 'Dry-aged', 'Wagyu', 'Gold leaf', 'Infernal', 'Hellfire'];
const name = (icon, n) => `<span class="w-name">${ico(icon)}${esc(n)}</span>`;

function table(sel, head, rows) {
  $(sel).innerHTML = `<thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

table('#tblStages', ['#', 'Stage', 'Lifetime steaks', 'Steak', ''], STAGES.map((s, i) => [
  i + 1, name(s.icon, s.name), s.at ? fmt(s.at) : 'Start',
  esc(CUTS[i] || ''), `<img class="w-thumb" src="assets/${s.img}?v=kh1" alt="" loading="lazy">`,
]));

table('#tblBuildings', ['Building', 'Base price', 'Steaks / sec each', 'Notes'], BUILDINGS.map(b => [
  name(b.icon, b.name), fmt(b.cost), fmt(b.gps), `<small>${esc(b.desc)}</small>`,
]));

$('#skillMax').textContent = MUSCLE_MAX;
table('#tblSkills', ['Skill', 'First level costs', 'Effect'], MUSCLES.map(m => [
  name(m.icon, m.name), fmt(m.base), esc(m.desc),
]));

table('#tblStyles', ['Style', 'Effect'], SPLITS.map(s => [name(s.icon, s.name), esc(s.desc)]));

$('#tblPerks').innerHTML = PERK_BRANCHES.map(br => `<h3 class="w-branch">${esc(br)}</h3>
  <div class="w-table-wrap"><table class="w-table"><thead><tr><th>Secret</th><th>Stars</th><th>Needs</th><th>Effect</th></tr></thead><tbody>${
    PERKS.filter(p => p.branch === br).map(p => `<tr><td>${name(p.icon, p.name)}</td><td>${fmt(p.cost)}${p.repeat ? '+' : ''}</td>` +
      `<td>${p.req.map(r => esc(PERK_BY_ID[r].name)).join(', ') || '—'}</td><td>${esc(p.desc)}</td></tr>`).join('')
  }</tbody></table></div>`).join('');

table('#tblSigs', ['Dish', 'First one costs', 'Effect'], LIFTS.map(l => [name(l.icon, l.name), fmt(l.base), esc(l.desc)]));

// Table of contents from the section headings.
$('#toc').innerHTML = [...document.querySelectorAll('main > section')].map(s =>
  `<a href="#${s.id}">${esc(s.querySelector('h2').textContent)}</a>`).join('');
