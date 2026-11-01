'use strict';
/* Rendering and input. Game rules live in core.js. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// Every emoji key from core.js is drawn as a game-icons.net SVG (see icons.js).
document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
// Shared paint for the Golden Dumpling tokens.
document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="dmpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#f7c633"/><stop offset="1" stop-color="#a86a0c"/></linearGradient></defs></svg>');
const ICON_RE = new RegExp('<[^>]*>|' + Object.keys(ICON_MAP).map(k => k.replace(/️/g, ''))
  .sort((a, b) => b.length - a.length).map(k => k + '\\uFE0F?').join('|'), 'gu');
const iconFor = e => ICON_MAP[e] || ICON_MAP[e + '️'] || ICON_MAP[e.replace(/️/g, '')];
const ico = (e, cls = '') => iconFor(e) ? `<svg class="gi ${cls}" aria-hidden="true"><use href="#gi-${iconFor(e)}"/></svg>` : e;
// Tags are matched and kept as they are, so emoji inside attributes are never replaced.
const iconize = html => String(html).replace(ICON_RE, m => (m[0] === '<' ? m : ico(m)));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = iconize(html);
  return e;
}
const loaves = n => `${fmt(n)} sourdough ${n === 1 ? 'loaf' : 'loaves'}`;
const restaurant = () => `${S.gymName}'s Kitchen`;

let storeMode = 'buy', storeAmt = 1, view = 'gym';

// ---------- Sound ----------
let actx;
function beep(freq, dur = 0.06, type = 'sine', vol = 0.05) {
  if (S.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (e) { /* audio unavailable */ }
}
const sfx = {
  click: crit => beep(crit ? 660 : rand(260, 320), crit ? 0.12 : 0.05, 'triangle', 0.05),
  buy: () => { beep(520, 0.07, 'triangle'); setTimeout(() => beep(700, 0.09, 'triangle'), 60); },
  sell: () => beep(300, 0.1, 'triangle'),
  chime: () => [660, 880].forEach((f, i) => setTimeout(() => beep(f, 0.15, 'sine', 0.06), i * 90)),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.06), i * 110)),
};

// ---------- Tooltip (an order ticket) ----------
const tipEl = $('#tooltip');
let tipFn = null, tipNode = null, tipX = 0, tipY = 0;
const touchUI = matchMedia('(hover: none)').matches;
let armed = null;
function showTipFor(n) {
  const r = n.getBoundingClientRect();
  n.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.left + r.width / 2, clientY: r.bottom }));
  setTimeout(() => { if (armed === n) { armed = null; tipFn = null; tipEl.classList.add('hidden'); } }, 3500);
}
function bindTip(node, fn) {
  node.addEventListener('mouseenter', e => { tipFn = fn; tipNode = node; moveTip(e); tipEl.classList.remove('hidden'); drawTip(); });
  node.addEventListener('mousemove', moveTip);
  node.addEventListener('mouseleave', hideTip);
}
function hideTip() { tipFn = null; tipNode = null; tipEl.classList.add('hidden'); }
function moveTip(e) { tipX = e.clientX; tipY = e.clientY; placeTip(); }
function placeTip() {
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = tipX + 18, y = tipY + 14;
  if (x + w > innerWidth - 8) x = tipX - w - 18;
  if (y + h > innerHeight - 8) y = innerHeight - h - 8;
  tipEl.style.left = Math.max(8, x) + 'px';
  tipEl.style.top = Math.max(8, y) + 'px';
}
// A hovered node can vanish (a squashed cockroach, a re-rendered list) without firing mouseleave,
// so hide the tip when its node is gone or it has nothing to say instead of leaving a blank ticket.
function drawTip() {
  if (!tipFn) return;
  const html = tipNode && !tipNode.isConnected ? '' : tipFn();
  if (!html) return hideTip();
  tipEl.innerHTML = iconize(html); placeTip();
}
const tipHead = (icon, name, tag) => `<div class="t-head"><span>${icon}</span><div><b>${name}</b><div class="t-tag">${tag}</div></div></div>`;
const tipCost = (cost, label = 'Cost') => `<div class="t-cost ${S.gains >= cost ? 'ok' : 'no'}"><span>${label}</span><b>${fmt(cost)} steaks</b></div>`;

// ---------- Toasts & modal ----------
function toast(html) {
  const box = $('#toasts');
  const t = el('div', 'toast', html);
  box.appendChild(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => t.remove(), 4300);
}
const modalQueue = [];
function closeModal() {
  $('#modal').classList.add('hidden');
  if (modalQueue.length) modal(...modalQueue.shift());
}
function modal(html, buttons = [{ label: 'OK' }], cls = '') {
  if (!$('#modal').classList.contains('hidden')) { modalQueue.push([html, buttons, cls]); return; }
  $('#modal').className = 'modal ' + cls;
  const card = $('#modalCard');
  card.innerHTML = iconize(html);
  const row = el('div', 'modal-btns');
  buttons.forEach(b => {
    const btn = el('button', 'btn ' + (b.cls || ''), b.label);
    btn.onclick = () => { if (b.action && b.action() === false) return; closeModal(); };
    row.appendChild(btn);
  });
  card.appendChild(row);
  $('#modal').classList.remove('hidden');
}

// ---------- Effects ----------
// Click effects live in their own contained layer, so adding one never re-lays out the page.
const fxLayer = document.body.appendChild(el('div', 'fx-layer'));
function floatAt(x, y, text, cls = '') {
  const f = el('div', 'float ' + cls);
  f.textContent = text;
  // Drawn on top of everything (fixed), so the pan rim and overlays never hide the number.
  const r = $('#fx').getBoundingClientRect();
  f.style.left = (r.left + x + rand(-14, 14)) + 'px';
  f.style.top = (r.top + y - 30) + 'px';
  f.style.setProperty('--rot', rand(-8, 8) + 'deg');
  fxLayer.appendChild(f);
  setTimeout(() => f.remove(), 1400);
}
function fxPoint(ev) {
  const r = $('#fx').getBoundingClientRect();
  if (ev && ev.clientX) return [ev.clientX - r.left, ev.clientY - r.top];
  return [r.width / 2 + rand(-60, 60), r.height / 2 + rand(-60, 60)];
}

// Screen-space particles: sparks and food bits on cooking, gold flakes on dumplings.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BIT_COLORS = ['#7fb069', '#d9a85a', '#a8231f', '#f6d58b', '#b5651d'];
let liveSpecks = 0;
function burst(x, y, n, cls) {
  // Gold flakes from dumplings always show; click particles stop at a cap while the screen is busy.
  if (cls !== 'gold') n = Math.min(n, 60 - liveSpecks);
  for (let i = 0; i < n; i++) {
    const p = el('i', 'speck ' + cls);
    const a = cls === 'spark' || cls === 'drop' ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : Math.random() * Math.PI * 2;
    const d = rand(30, cls === 'gold' ? 120 : cls === 'spark' ? 110 : 60);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.setProperty('--dx', Math.cos(a) * d + 'px');
    p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
    p.style.setProperty('--r', rand(-200, 200) + 'deg');
    // Sparks are streaks pointing the way they fly.
    if (cls === 'spark') { p.style.setProperty('--a', a + 'rad'); p.style.setProperty('--d', d + 'px'); }
    if (cls === 'bit') p.style.background = BIT_COLORS[i % BIT_COLORS.length];
    liveSpecks++;
    fxLayer.appendChild(p);
    setTimeout(() => { p.remove(); liveSpecks--; }, 750);
  }
}
// Cooking juice: food flips out of the pan, a heat ring and steam. Capped so fast clicking stays smooth.
const FLIP_FOODS = ['🍳', '🥩', '🥟', '🍗', '🥓', '🧀', '🥔', '🍖'];
let liveFx = 0;
function addFx(node, ms) { liveFx++; fxLayer.appendChild(node); setTimeout(() => { node.remove(); liveFx--; }, ms); }
function cookFx(x, y, crit, fx = x, fy = y) {
  const ring = el('i', 'cook-ring' + (crit ? ' crit' : ''));
  ring.style.left = x + 'px'; ring.style.top = y + 'px';
  addFx(ring, 500);
  if (liveFx > 40) return;
  const flips = crit ? 3 : Math.random() < 0.45 ? 1 : 0;
  for (let i = 0; i < flips; i++) {
    const f = el('i', 'flip', ico(FLIP_FOODS[Math.floor(Math.random() * FLIP_FOODS.length)]));
    f.style.left = fx + rand(-40, 40) + 'px'; f.style.top = fy + 'px';
    f.style.color = BIT_COLORS[Math.floor(Math.random() * BIT_COLORS.length)];
    f.style.setProperty('--dx', rand(-90, 90) + 'px');
    f.style.setProperty('--h', -rand(90, crit ? 190 : 140) + 'px');
    f.style.setProperty('--r', rand(-540, 540) + 'deg');
    addFx(f, 900);
  }
  for (let i = 0; i < (crit ? 3 : 1); i++) {
    const s = el('i', 'steam');
    s.style.left = fx + rand(-60, 60) + 'px'; s.style.top = fy - 10 + 'px';
    s.style.setProperty('--dx', rand(-20, 20) + 'px');
    s.style.animationDelay = i * 80 + 'ms';
    addFx(s, 1300);
  }
}
function restart(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
// Every click counts at once, but its effects are drawn at most once per frame and numbers merge
// when clicks come faster than FLOAT_GAP, so autoclickers can't flood the page with nodes.
const FLOAT_GAP = 90;
let clickQ = [], clickFrame = 0, floatSum = 0, floatCrit = false, floatPos = null, lastFloat = 0, floatTimer = 0, lastBeep = 0;
function onHeroClick(ev) {
  const { v, crit } = click();
  clickQ.push({ v, crit, x: ev.clientX, y: ev.clientY });
  if (!clickFrame) clickFrame = requestAnimationFrame(drawClicks);
  if (S.clicks === 1) updateLeft();
}
function flushFloat() {
  floatTimer = 0;
  if (!floatSum) return;
  lastFloat = performance.now();
  floatAt(floatPos[0], floatPos[1], (floatCrit ? 'Crit! +' : '+') + fmt(floatSum), floatCrit ? 'crit' : '');
  floatSum = 0; floatCrit = false;
}
function drawClicks() {
  clickFrame = 0;
  const q = clickQ; clickQ = [];
  if (!q.length) return;
  const hero = $('#hero'), r = hero.getBoundingClientRect(), o = $('#fx').getBoundingClientRect();
  const last = q[q.length - 1], crit = q.some(c => c.crit);
  const cx = last.x || r.left + r.width / 2 + rand(-60, 60), cy = last.y || r.top + r.height / 2 + rand(-60, 60);
  floatSum += q.reduce((s, c) => s + c.v, 0); floatCrit = floatCrit || crit; floatPos = [cx - o.left, cy - o.top];
  const wait = FLOAT_GAP - (performance.now() - lastFloat);
  if (wait <= 0) flushFloat(); else if (!floatTimer) floatTimer = setTimeout(flushFloat, wait);
  if (performance.now() - lastBeep > 60) { lastBeep = performance.now(); sfx.click(crit); }
  // Fast clicking (autoclickers) gets thinner effects; normal clicking looks the same.
  const rate = R.clickTimes.length, k = rate > 25 ? 0.25 : rate > 12 ? 0.5 : 1;
  const n = c => Math.ceil(c * k);
  burst(cx, cy, n(crit ? 14 : 7), 'spark');
  if (crit) burst(cx, cy, 12, 'gold');
  burst(cx, cy, n(crit ? 5 : 2), 'bit');
  // Hot juice spits from where you hit the steak; food and steam come off its top.
  burst(cx, cy, n(crit ? 10 : 4), 'drop');
  if (k === 1 || crit || Math.random() < k) cookFx(cx, cy, crit, r.left + r.width / 2, r.top + r.height * 0.25);
  restart(hero, crit ? 'shake' : 'bump');
}

// ---------- Golden Dumplings ----------
const DUMPLING_SVG = `<svg class="dumpling" viewBox="0 0 100 80" aria-hidden="true">
  <path d="M8 56 Q8 16 50 13 Q92 16 92 56 Q70 70 50 70 Q30 70 8 56Z" fill="url(#dmpG)" stroke="#4a2e06" stroke-width="3" stroke-linejoin="round"/>
  <path d="M24 26 q5 6 3 14 M36 18 q5 8 3 16 M50 15 q4 8 2 17 M64 18 q2 8 -1 16 M76 26 q0 7 -4 13" fill="none" stroke="#8a560a" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M14 54 Q50 66 86 54" fill="none" stroke="#fff3c2" stroke-opacity=".55" stroke-width="2"/>
  <ellipse cx="30" cy="36" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-25 30 36)"/>
</svg>`;
function spawnShaker(stay, chainLink = false) {
  const s = el('button', 'shaker', `<span class="ray"></span><span class="token">${DUMPLING_SVG}</span>`);
  s.title = 'Golden Dumpling!';
  s.setAttribute('aria-label', 'Golden Dumpling');
  const maxX = innerWidth > 1100 ? innerWidth - 420 : innerWidth - 80;
  s.style.left = rand(20, Math.max(40, maxX)) + 'px';
  s.style.top = rand(90, Math.max(120, innerHeight - 120)) + 'px';
  let caught = false;
  s.onclick = () => {
    caught = true;
    const r = s.getBoundingClientRect();
    s.remove();
    const res = claimShaker();
    burst(r.left + r.width / 2, r.top + r.height / 2, 18, 'gold');
    bigFloat(r.left + r.width / 2, r.top, res.title);
    toast(`🥟 <b>${res.title}</b> ${res.text}`);
    sfx.fanfare();
  };
  document.body.appendChild(s);
  setTimeout(() => s.classList.add('out'), stay - 800);
  setTimeout(() => { if (!caught) missShaker(chainLink); s.remove(); }, stay);
}
function bigFloat(x, y, text) {
  const f = el('div', 'float big', esc(text));
  f.style.left = x + 'px'; f.style.top = y + 'px';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}
function spawnStorm(n) {
  let total = 0;
  for (let i = 0; i < n; i++) setTimeout(() => {
    const s = el('button', 'shaker storm', `<span class="token">${DUMPLING_SVG}</span>`);
    s.setAttribute('aria-label', 'Golden Dumpling');
    s.style.left = rand(20, Math.max(40, innerWidth - 80)) + 'px';
    s.style.top = rand(80, Math.max(100, innerHeight - 80)) + 'px';
    s.onclick = () => { const r = s.getBoundingClientRect(); s.remove(); total += claimStormShaker(); burst(r.left + 20, r.top + 20, 6, 'gold'); beep(rand(700, 1000), 0.08, 'sine', 0.05); };
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 3000);
  }, i * 550);
  setTimeout(() => { if (total) toast(`🌧️ <b>Dumpling Rain is over.</b> You grabbed +${fmt(total)} steaks.`); }, n * 550 + 3100);
}

// ---------- Store ----------
function renderStore() {
  const wrap = $('#buildings');
  wrap.innerHTML = '';
  BUILDINGS.forEach(b => {
    const n = el('button', 'bld', `<span class="ic">${b.icon}</span><span class="bld-mid"><b></b><span class="price"></span></span><span class="count"></span><i class="bld-prog"></i>`);
    n.onclick = () => {
      if (storeMode === 'buy' ? buyBuilding(b, storeAmt) : sellBuilding(b, storeAmt)) {
        storeMode === 'buy' ? sfx.buy() : sfx.sell();
        restart(n, 'pop');
        updateAll();
      }
    };
    bindTip(n, () => buildingTip(b));
    b.node = n;
    wrap.appendChild(n);
  });
}
function storeQty(b) {
  if (storeMode === 'sell') return storeAmt === 'max' ? own(b.id) : Math.min(storeAmt, own(b.id));
  return storeAmt === 'max' ? Math.max(1, maxAffordable(b)) : storeAmt;
}
function updateStore() {
  let shownLocked = false;
  BUILDINGS.forEach((b, i) => {
    const n = b.node;
    const revealed = i === 0 || own(b.id) > 0 || S.lifeEarned >= b.cost * 0.4;
    if (!revealed) {
      n.classList.toggle('hidden', shownLocked);
      n.classList.add('locked');
      n.querySelector('b').textContent = '???';
      n.querySelector('.price').textContent = fmt(b.cost);
      n.querySelector('.count').textContent = '';
      shownLocked = true;
      return;
    }
    n.classList.remove('hidden', 'locked');
    const q = storeQty(b);
    n.querySelector('b').textContent = b.name + (q > 1 ? ` ×${q}` : '');
    n.querySelector('.count').textContent = own(b.id) || '';
    if (storeMode === 'buy') {
      const c = buildingCost(b, q);
      const g = gps();
      n.querySelector('.price').textContent = fmt(c) + (S.gains < c && g > 0 ? ` · ${fmtTime((c - S.gains) / g)}` : '');
      n.classList.toggle('can', S.gains >= c);
      n.style.setProperty('--p', Math.min(1, S.gains / c));
    } else {
      n.querySelector('.price').textContent = q ? '+' + fmt(sellValue(b, q)) : '—';
      n.classList.toggle('can', q > 0);
    }
    n.classList.toggle('sell', storeMode === 'sell');
  });
}
function buildingTip(b) {
  const each = buildingEach(b), total = each * own(b.id), all = baseGps();
  let html = tipHead(b.icon, b.name, `Equipment · owned ${own(b.id)}`) + `<div class="t-desc">${b.desc}</div><hr>`;
  html += `<div class="t-line"><span>Each cooks</span><b>${fmt(each)}/s</b></div>`;
  if (own(b.id)) html += `<div class="t-line"><span>All ${own(b.id)} cook</span><b>${fmt(total)}/s · ${all ? (total / all * 100).toFixed(1) : 0}%</b></div>`;
  if (b.id === 'pushups' && memoryBonus()) html += `<div class="t-line"><span>Kitchen Reflexes</span><b>+${fmt(memoryBonus())} each</b></div>`;
  const q = storeQty(b);
  html += storeMode === 'buy' ? tipCost(buildingCost(b, q), `Cost ×${q}`) : `<div class="t-cost ok"><span>Sell ×${q}</span><b>${fmt(sellValue(b, q))} steaks</b></div>`;
  return html;
}

let upgKey = '';
const KIND_LABEL = { building: 'Equipment upgrade', click: 'Cooking upgrade', synergy: 'Kitchen Combo', food: 'Ingredient', recovery: 'Hospitality', special: 'Special upgrade' };
function updateUpgrades() {
  const avail = availableUpgrades();
  const key = avail.map(u => u.id).join();
  if (key !== upgKey) {
    upgKey = key;
    const wrap = $('#upgrades');
    wrap.innerHTML = avail.length ? '' : '<div class="upg-empty">The rack is empty. New upgrades get delivered as your kitchen grows.</div>';
    avail.forEach(u => {
      const n = el('button', 'upg k-' + u.kind, u.icon + (u.badge ? `<small>${u.badge}</small>` : ''));
      n.setAttribute('aria-label', u.name);
      n.onclick = () => {
        if (touchUI && armed !== n) { armed = n; showTipFor(n); return; }
        armed = null;
        if (buyUpgrade(u.id)) { sfx.chime(); toast(`${u.icon} <b>${u.name}</b> · ${u.desc}`); updateAll(); } };
      bindTip(n, () => tipHead(u.icon, u.name, KIND_LABEL[u.kind] || 'Upgrade') + `<div class="t-desc">${u.desc}</div>` + tipCost(upgCost(u)));
      u.node = n;
      wrap.appendChild(n);
    });
    $('#upgCount').textContent = avail.length ? `${avail.length} on the rack` : '';
    if (tipFn && !document.querySelector('.upg:hover, .bld:hover, .ach:hover, .card:hover')) { tipFn = null; tipEl.classList.add('hidden'); }
  }
  avail.forEach(u => u.node.classList.toggle('can', S.gains >= upgCost(u)));
}

// ---------- Kitchen view ----------
function renderGym() {
  const wrap = $('#gymRows');
  BUILDINGS.forEach(b => {
    const r = el('div', 'row hidden', `<span class="row-name"><span class="row-ic">${b.icon}</span><span class="row-title">${b.name}</span></span><span class="num own"></span>
      <span class="num rate"></span><span class="lvl"><button class="lvl-btn"></button></span><span class="row-icons"></span>`);
    r.querySelector('.lvl-btn').onclick = () => {
      if (levelBuilding(b)) { sfx.chime(); toast(`🥯 <b>${b.name}</b> is now level ${blevel(b.id)} (+${blevel(b.id)}% production).`); updateAll(); }
    };
    bindTip(r, () => buildingTip(b));
    b.row = r;
    b.rowCount = -1;
    wrap.appendChild(r);
  });
}
function updateGym() {
  let any = false;
  BUILDINGS.forEach(b => {
    const n = own(b.id);
    b.row.classList.toggle('hidden', !n);
    if (!n) return;
    any = true;
    b.row.querySelector('.own').textContent = n;
    b.row.querySelector('.rate').textContent = fmt(buildingEach(b) * n) + '/s';
    const lb = b.row.querySelector('.lvl-btn');
    lb.innerHTML = `Lv ${blevel(b.id)} · ${blevelCost(b)} ${ico('🥯')}`;
    lb.disabled = S.scoops < blevelCost(b);
    lb.title = `Feed ${loaves(blevelCost(b))} to the ${b.name} for +1% production`;
    if (b.rowCount !== n) {
      b.rowCount = n;
      const shown = Math.min(n, 14);
      b.row.querySelector('.row-icons').innerHTML = ico(b.icon).repeat(shown) + (n > shown ? `<em>+${n - shown}</em>` : '');
    }
  });
  $('#gymEmpty').classList.toggle('hidden', any);
  $('#board').classList.toggle('hidden', !any);
  if (any) updateBoard();
  $('#view-gym .log-head').classList.toggle('hidden', !any);
  const on = scoopsUnlocked();
  $('#view-gym').classList.toggle('scoops-on', on);
  $('#scoopBar').classList.toggle('hidden', !on && S.lifeEarned < 1e6);
  $('#scoopBar').classList.toggle('locked', !on);
  const pct = Math.min(100, S.lifeEarned / SCOOP_UNLOCK * 100);
  if (!on) $('#scoopBar').innerHTML = iconize(`<span class="sb-ic">🥯</span><span class="sb-txt"><b>Sourdough Starter · locked</b>
    <span>Unlocks at ${fmt(SCOOP_UNLOCK)} lifetime steaks. Loaves level up your equipment.</span></span><span class="sb-num mono">${Math.floor(pct)}%</span>`);
  else {
    const left = Math.max(0, (S.scoopTime + scoopInterval() - Date.now()) / 1000);
    $('#scoopBar').innerHTML = iconize(`<span class="sb-ic">🥯</span><span class="sb-txt"><b>Sourdough Starter</b>
    <span>Next loaf rises in ${fmtTime(left)}. Feed loaves to equipment for +1% each level.</span></span><span class="sb-num mono">${fmt(S.scoops)}</span>`);
  }
}

// The board under the stations: where the steaks come from, and what's next.
const SHARE_COLORS = ['#d4a24c', '#ffcc4d', '#a8231f', '#8cc084', '#3fb6c6', '#c77dff', '#ff6b9a', '#d9895b', '#9fb4c7', '#b5c94c'];
let boardHtml = '';
function updateBoard() {
  const list = BUILDINGS.map(b => ({ b, v: buildingEach(b) * own(b.id) })).filter(x => x.v > 0).sort((x, y) => y.v - x.v);
  const total = list.reduce((t, x) => t + x.v, 0) || 1;
  const segs = list.map((x, i) => `<i style="flex:${x.v / total};background:${SHARE_COLORS[i % SHARE_COLORS.length]}" title="${x.b.name}"></i>`).join('');
  const legend = list.slice(0, 6).map((x, i) => `<span><em style="background:${SHARE_COLORS[i % SHARE_COLORS.length]}"></em>${ico(x.b.icon)} ${x.b.name} <b class="mono">${(x.v / total * 100).toFixed(x.v / total < .1 ? 1 : 0)}%</b></span>`).join('');
  const nextB = BUILDINGS.find(b => !own(b.id));
  const g = gps();
  const st = STAGES[S.bestStage + 1];
  const stPct = st ? Math.max(0, Math.min(100, Math.log(Math.max(1, S.lifeEarned) / (STAGES[S.bestStage].at || 1)) / Math.log(st.at / (STAGES[S.bestStage].at || 1)) * 100)) : 100;
  const top = list[0];
  const goals = [
    ['Star station', top ? `${ico(top.b.icon)} ${top.b.name}` : '—', top ? `${fmt(top.v)}/s · ${(top.v / total * 100).toFixed(0)}% of the kitchen` : ''],
    ['Next delivery', nextB ? `${ico(nextB.icon)} ${S.lifeEarned >= nextB.cost * 0.4 ? nextB.name : '???'}` : 'Every station built', nextB ? `${fmt(buildingCost(nextB, 1))} steaks${S.gains < buildingCost(nextB, 1) && g > 0 ? ' · ready in ' + fmtTime((buildingCost(nextB, 1) - S.gains) / g) : ' · ready now'}` : 'Time to level them up'],
    ['Next promotion', st ? `${st.icon ? ico(st.icon) + ' ' : ''}${st.name}` : 'Kitchen Overlord', st ? `${stPct.toFixed(0)}% of the way · ${fmt(st.at)} lifetime steaks` : `Inferno rank ${S.legendRank}`],
  ].map(([k, v, sub]) => `<div class="goal ticket"><small>${k}</small><b>${v}</b><span>${sub}</span></div>`).join('');
  const html = `<div class="share"><div class="board-h"><span>Where the steaks come from</span><b class="mono">${fmt(baseGps())}/s</b></div><div class="share-bar">${segs}</div><div class="share-legend">${legend}</div></div><div class="goals">${goals}</div>`;
  if (html !== boardHtml) { boardHtml = html; $('#board').innerHTML = html; }
}

// ---------- Chef Skills ----------
function renderMuscles() {
  const wrap = $('#muscleCards');
  MUSCLES.forEach(m => {
    const c = el('div', 'card', `<div class="card-top"><span class="ic">${m.icon}</span><b>${m.name}</b><span class="lv"></span></div>
      <p>${m.desc}</p><div class="bar pips"><i></i></div><button class="btn"></button>`);
    c.querySelector('button').onclick = () => { if (trainMuscle(m)) { sfx.chime(); updateAll(); } };
    m.card = c;
    wrap.appendChild(c);
  });
}
function updateMuscles() {
  MUSCLES.forEach(m => {
    const l = lvl(m.id), maxed = l >= MUSCLE_MAX, cost = muscleCost(m), btn = m.card.querySelector('button');
    m.card.querySelector('.lv').textContent = `Lv ${l}/${MUSCLE_MAX}`;
    m.card.querySelector('i').style.width = (l / MUSCLE_MAX * 100) + '%';
    btn.textContent = maxed ? 'Mastered' : `Train · ${fmt(cost)} steaks`;
    btn.disabled = maxed || S.gains < cost;
  });
}

// ---------- Signature Dishes (endless) ----------
function renderRecords() {
  const wrap = $('#liftCards');
  LIFTS.forEach(l => {
    const c = el('div', 'card', `<div class="card-top"><span class="ic">${l.icon}</span><b>${l.name}</b><span class="lv"></span></div>
      <p>${l.desc}</p><p class="rec-info"></p><button class="btn"></button>`);
    c.querySelector('button').onclick = () => {
      if (setRecord(l)) { sfx.fanfare(); toast(`${l.icon} New <b>${l.name}</b> record: ${recordLabel(l)}!`); updateAll(); }
    };
    l.card = c;
    wrap.appendChild(c);
  });
}
function updateRecords() {
  const open = mainComplete();
  $('#recordsLocked').classList.toggle('hidden', open);
  $('#recordsBody').classList.toggle('hidden', !open);
  if (!open) return;
  const next = legendTarget(S.legendRank + 1), prev = legendTarget(S.legendRank);
  const pct = Math.min(100, Math.log(S.lifeEarned / prev) / Math.log(next / prev) * 100);
  $('#legendBox').innerHTML = iconize(`<b>🔱 Inferno rank ${S.legendRank}</b> · +${S.legendRank * 10}% steaks per second
    <div class="bar"><i style="width:${Math.max(0, pct)}%"></i></div>
    <small>Next rank at ${fmt(next)} lifetime steaks. Each rank adds +10% steaks per second.</small>`);
  LIFTS.forEach(l => {
    const cost = recordCost(l), btn = l.card.querySelector('button');
    l.card.querySelector('.lv').textContent = recordLabel(l);
    l.card.querySelector('.rec-info').textContent = `${rec(l.id)} record${rec(l.id) === 1 ? '' : 's'} set`;
    btn.textContent = `Cook it: ${recordLabel(l, rec(l.id) + 1)} · ${fmt(cost)}`;
    btn.disabled = S.gains < cost;
  });
}

// ---------- Cook-off ----------
function renderPerks() {
  const wrap = $('#perkTree');
  PERK_BRANCHES.forEach(branch => {
    wrap.appendChild(el('h4', 'branch', branch));
    const list = el('div', 'cards');
    PERKS.filter(p => p.branch === branch).forEach(p => {
      const needs = p.req.length ? `<p class="needs">Needs: ${p.req.map(r => PERK_BY_ID[r].name).join(', ')}</p>` : '';
      const c = el('div', 'card', `<div class="card-top"><span class="ic">${p.icon}</span><b>${p.name}</b><span class="lv"></span></div>
        <p>${p.desc}</p>${needs}<button class="btn secondary"></button>`);
      c.querySelector('button').onclick = () => { if (buyPerk(p)) { sfx.chime(); toast(`${p.icon} Chef's Secret learned: <b>${p.name}</b>`); updateAll(); } };
      p.card = c;
      list.appendChild(c);
    });
    wrap.appendChild(list);
  });
}
function updateLockers() {
  const slots = lockerSlots();
  $('#lockerSection').classList.toggle('hidden', false);
  $('#lockerSection .hint').textContent = slots ? 'Upgrades in your Recipe Box are kept after every Cook-off.'
    : 'Locked. Learn the first Recipe Box secret below to keep one upgrade through every Cook-off.';
  const wrap = $('#lockers');
  if (wrap.childElementCount !== slots) {
    wrap.innerHTML = '';
    for (let i = 0; i < slots; i++) {
      const c = el('div', 'card', `<div class="card-top"><span class="ic">🗃️</span><b>Recipe slot ${ROMAN[i]}</b><span class="lv"></span></div><p></p><button class="btn secondary">Choose</button>`);
      c.querySelector('button').onclick = () => pickLocker(i);
      wrap.appendChild(c);
    }
  }
  [...wrap.children].forEach((c, i) => {
    const u = UPG_BY_ID[S.lockers[i]];
    c.querySelector('p').innerHTML = u ? `${ico(u.icon)} ${u.name}: ${u.desc}` : 'Empty. Choose one of your upgrades to keep.';
  });
}
function pickLocker(slot) {
  const owned = S.upg.map(id => UPG_BY_ID[id]).filter(Boolean);
  if (!owned.length) { toast('Buy some upgrades first, then pick one to keep.'); return; }
  modal(`<h2>Recipe slot ${ROMAN[slot]}</h2><p>Pick an upgrade you own. It will be kept after every Cook-off.</p>
    <div class="pick-grid">${owned.map(u => `<button class="upg can k-${u.kind}" data-id="${u.id}" title="${u.name}: ${u.desc}">${u.icon}${u.badge ? `<small>${u.badge}</small>` : ''}</button>`).join('')}</div>`,
  [{ label: 'Clear slot', cls: 'secondary', action: () => { setLocker(slot, null); updateLockers(); } }, { label: 'Close', cls: 'secondary' }]);
  $$('#modalCard .pick-grid .upg').forEach(n => n.onclick = () => {
    if (!setLocker(slot, n.dataset.id)) { toast('That upgrade is already in another recipe slot.'); return; }
    closeModal();
    toast(`🗃️ <b>${UPG_BY_ID[n.dataset.id].name}</b> is now in recipe slot ${ROMAN[slot]}.`);
    updateLockers();
  });
}
function updateComp() {
  const pending = pendingMedals();
  $('#medalPct').textContent = `+${medalRate() * 100}%`;
  $('#medalTotal').textContent = fmt(S.medals);
  $('#medalBonus').textContent = `+${fmt(medalRate() * effectiveMedals() * 100)}% to everything`;
  $('#medalAvail').textContent = fmt(medalsAvailable());
  $('#medalPending').textContent = fmt(pending);
  $('#medalNext').textContent = `next Star at ${fmt(nextMedalAt())} lifetime steaks`;
  const btn = $('#competeBtn');
  btn.disabled = pending < 1;
  btn.innerHTML = iconize(pending < 1 ? 'Keep cooking to qualify' : `🔥 Enter the Cook-off · +${plural(pending, 'Star')}`);
  $('#compBadge').textContent = pending >= Math.max(5, S.medals) ? '!' : '';
  if (view !== 'comp') return;
  updateLockers();
  PERKS.forEach(p => {
    const owned = perk(p.id), btn = p.card.querySelector('button'), cost = perkCost(p), open = perkUnlocked(p);
    p.card.classList.toggle('owned', !p.repeat && owned > 0);
    p.card.classList.toggle('locked-perk', !open);
    p.card.querySelector('.lv').textContent = p.repeat ? `Lv ${owned}` : '';
    if (!p.repeat && owned) { btn.textContent = 'Learned'; btn.disabled = true; return; }
    btn.textContent = open ? `Learn · ${plural(cost, 'Star')}` : `Locked · ${plural(cost, 'Star')}`;
    btn.disabled = !open || medalsAvailable() < cost;
  });
}
function medalGainPct(p) {
  const eff = m => m <= MEDAL_SOFTCAP ? m : MEDAL_SOFTCAP * Math.sqrt(m / MEDAL_SOFTCAP);
  return (eff(S.medals + p) - eff(S.medals)) * medalRate() * 100;
}
function askCompete() {
  const p = pendingMedals();
  if (p < 1) return;
  modal(`<div class="m-kicker mono">Cook-off entry</div><h2>Enter the Cook-off?</h2><p>You'll win <b>${plural(p, 'Star')}</b> (+${fmt(medalGainPct(p))}% to everything, forever).${S.medals + p > MEDAL_SOFTCAP ? ' Stars past 1,000 count a little less each.' : ''}<br>
    Your steaks, equipment, upgrades and Chef Skills start over.</p>`, [
    { label: 'Not yet', cls: 'secondary' },
    { label: 'Fire it up!', action: () => {
      const won = compete();
      upgKey = '';
      setStage();
      sfx.fanfare();
      toast(`⭐ The judges loved it! You won <b>${plural(won, 'Star')}</b>.`);
      updateAll();
    } },
  ]);
}

// ---------- Achievements: medallion badges ----------
const ACH_TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Ruby', 'Diamond'];
const achTier = a => Math.max(1, Math.min(5, Math.round(a.tier || 1)));
const CAT_PALETTE = ['#d4a24c', '#a8231f', '#f2b630', '#7fb069', '#3fb6c6', '#c77dff', '#e0805a', '#8fa8c8', '#ff6b9a', '#b5c94c', '#5fa8ff'];
const catColor = cat => cat === 'Secret' ? '#9a7bd1' : CAT_PALETTE[Math.max(0, ACH_CATEGORIES.indexOf(cat)) % CAT_PALETTE.length];
function renderAch() {
  const wrap = $('#achGroups');
  wrap.innerHTML = '';
  ACH_CATEGORIES.forEach(cat => {
    const g = el('div', 'ach-group', `<div class="ach-head"><h3>${cat}</h3><span class="grp-count mono"></span><div class="bar grp-bar"><i></i></div></div>
      ${cat === 'Secret' ? '<p class="hint">Hidden until you find them. They don’t count toward Reputation.</p>' : ''}`);
    g.style.setProperty('--cat', catColor(cat));
    g.dataset.cat = cat;
    const grid = el('div', 'ach-grid');
    ACH.filter(a => a.cat === cat).forEach(a => {
      const n = el('div', `ach t${achTier(a)}${a.shadow ? ' secret' : ''}`, `<span class="medal">${a.shadow ? '<em>?</em>' : a.icon}</span>`);
      bindTip(n, () => {
        const got = achSet.has(a.id), tier = ACH_TIER_NAMES[achTier(a) - 1];
        if (a.shadow && !got) return tipHead('❔', 'Secret achievement', `${tier} · Locked`) + '<div class="t-desc">Keep playing in unusual ways to find it.</div>';
        return tipHead(a.icon, got ? a.name : '???', `${tier} · ${cat} · ${got ? 'Unlocked' : 'Locked'}`) + `<div class="t-desc">${a.desc}</div>`;
      });
      a.node = n;
      grid.appendChild(n);
    });
    g.appendChild(grid);
    wrap.appendChild(g);
  });
}
function updateAch() {
  if (ACH.some(a => !a.node)) renderAch();
  ACH.forEach(a => {
    const got = achSet.has(a.id);
    if (a.node.classList.contains('got') === got && a.node.dataset.drawn) return;
    a.node.dataset.drawn = 1;
    a.node.classList.toggle('got', got);
    if (a.shadow) a.node.querySelector('.medal').innerHTML = got ? ico(a.icon) : '<em>?</em>';
  });
  $$('.ach-group').forEach(g => {
    const list = ACH.filter(a => a.cat === g.dataset.cat), got = list.filter(a => achSet.has(a.id)).length;
    g.querySelector('.grp-count').textContent = `${got} / ${list.length}`;
    g.querySelector('.grp-bar i').style.width = (list.length ? got / list.length * 100 : 0) + '%';
    g.classList.toggle('complete', got === list.length && list.length > 0);
  });
  const secrets = ACH.filter(a => a.shadow), secretGot = secrets.filter(a => achSet.has(a.id)).length;
  const regular = ACH.length - secrets.length, gotN = regularAchCount();
  const high = ACH.filter(a => achSet.has(a.id) && achTier(a) >= 3).length;
  $('#achCount').textContent = `${gotN} / ${regular}`;
  $('#achStats').innerHTML = iconize(`
    <div class="stat-box rep"><small>🏵️ Reputation</small><b class="mono">${fmt(gotN * 2)}%</b><span>boosts Hospitality upgrades</span></div>
    <div class="stat-box"><small>Unlocked</small><b class="mono">${gotN}<i>/${regular}</i></b><div class="bar"><i style="width:${regular ? gotN / regular * 100 : 0}%"></i></div></div>
    <div class="stat-box"><small>Secrets found</small><b class="mono">${secretGot}<i>/${secrets.length}</i></b><span>don't count toward Reputation</span></div>
    <div class="stat-box"><small>Gold or better</small><b class="mono">${high}</b><span>gold, ruby and diamond badges</span></div>`);
}

// ---------- Stats (a long receipt) ----------
function updateStats() {
  const rows = [
    ['Steaks in the bank', fmt(S.gains)], ['Steaks this run', fmt(S.runEarned)], ['Steaks all time', fmt(S.lifeEarned)],
    ['Steaks per second', fmt(gps())], ['Steaks per cook', fmt(clickPower())], ['Steaks from cooking', fmt(S.clickEarned)],
    ['Critical cook chance', (critChance() * 100).toFixed(0) + '%'], ['Total cooks', fmt(S.clicks)], ['Critical cooks', fmt(S.crits)],
    ['Golden Dumplings caught', fmt(S.shakers)], ['Equipment owned', fmt(totalOwned())],
    ['Upgrades bought', `${S.upg.length} / ${UPGRADES.length}`], ['Achievements', `${S.ach.length} / ${ACH.length}`],
    ['Sourdough loaves', fmt(S.scoops)], ['Equipment levels', fmt(totalBLevels())], ['Equipment sold', fmt(S.soldTotal)],
    ['Cook-offs', fmt(S.prestiges)], ['Stars', fmt(S.medals)], ['Signature records', fmt(totalRecords())],
    ['Inferno rank', S.legendRank], ['This run', fmtTime(S.runTime)], ['Time played', fmtTime(S.playTime)],
  ];
  $('#receiptHead').innerHTML = `<b>${esc(restaurant()).toUpperCase()}</b><span>Table 1 · Guest check #${String(S.clicks % 100000).padStart(5, '0')}</span>`;
  $('#stats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
}

// ---------- Left panel ----------
let shownStage = -1;
// Bump when stage photos are replaced: same file names, so browsers would keep the cached old ones.
const ASSET_V = 'kh1';
// Each stage gets a better steak: a raw scrap cut at the start, a hellfire steak at the end.
const PAN_MARKS = ['SCRAP CUT', 'CHUCK', 'SIRLOIN', 'RIBEYE', 'T-BONE', 'PORTERHOUSE', 'DRY-AGED', 'WAGYU', 'GOLD LEAF', 'INFERNAL', 'HELLFIRE'];
const panIndex = i => STAGES.length > 1 ? Math.round(i * (PAN_MARKS.length - 1) / (STAGES.length - 1)) : 0;
function setStage() {
  const i = S.bestStage, st = STAGES[i], m = panIndex(i);
  if (shownStage !== i) {
    shownStage = i;
    $('#heroImg').src = 'assets/' + st.img + '?v=' + ASSET_V;
    $('#heroImg').style.objectPosition = st.pos;
    $('#stageName').textContent = st.name;
    $('#stageText').textContent = st.text;
    $('#stageStamp').innerHTML = st.icon ? ico(st.icon) : '';
    $('#stageNum').textContent = `Stage ${i + 1} / ${STAGES.length}`;
    $('#stageMat').textContent = PAN_MARKS[m].toLowerCase() + ' steak';
    $('#heroArea').dataset.plate = m;
    $('#left').dataset.plate = m;
  }
}
function updateLeft() {
  $('#gains').textContent = fmt(S.gains, true);
  $('#gps').innerHTML = `<b>${fmt(gps())}</b> steaks per second`;
  document.title = `${fmt(S.gains)} steaks · ${restaurant()}`;
  const next = STAGES[S.bestStage + 1];
  if (next) {
    const prev = STAGES[S.bestStage].at || 1;
    const pct = Math.log(Math.max(1, S.lifeEarned) / prev) / Math.log(next.at / prev) * 100;
    $('#stageBar').style.width = Math.max(0, Math.min(100, pct)) + '%';
    $('#stageNext').textContent = `Next: ${next.name} at ${fmt(next.at)} lifetime steaks`;
  } else {
    $('#stageBar').style.width = '100%';
    $('#stageNext').textContent = `Inferno rank ${S.legendRank} · see Signatures`;
  }
  const left = $('#left'), area = $('#heroArea');
  $('#buffs').innerHTML = iconize(R.buffs.map(b => `<span class="buff">${b.name} <b>${Math.ceil((b.until - clock()) / 1000)}s</b></span>`).join(''));
  $('#topStars').textContent = fmt(S.medals);
  $('#topDough').textContent = fmt(S.scoops);
  $('#topRep').textContent = fmt(regularAchCount() * 2) + '%';
  $('#chipDough').classList.toggle('hidden', !scoopsUnlocked() && !S.scoops);
  $('#chipStars').classList.toggle('hidden', !S.medals && !S.prestiges);
}

// ---------- The pass: always-on summary tickets under the line ----------
const PASS = [
  ['Per cook', () => fmt(clickPower())],
  ['Crit chance', () => (critChance() * 100).toFixed(0) + '%'],
  ['Equipment', () => fmt(totalOwned())],
  ['Upgrades', () => `${S.upg.length}`],
  ['Dumplings', () => fmt(S.shakers)],
  ['Achievements', () => `${S.ach.length}/${ACH.length}`],
];
function renderPass() {
  const p = $('#pass');
  p.innerHTML = '<span class="rail"></span>' + PASS.map(([k], i) => `<div class="pass-t" style="--tilt:${[-1.2, .8, -.5, 1.1, -.9, .6][i % 6]}deg"><small>${k}</small><b class="mono" data-k="${i}"></b></div>`).join('');
}
function updatePass() { $$('#pass b[data-k]').forEach(b => { const v = PASS[b.dataset.k][1](); if (b.textContent !== v) b.textContent = v; }); }

// ---------- Kitchen radio ----------
const NEWS = [
  [0, 'Local kid "helps" in the kitchen. Flour found on the ceiling.'],
  [0, 'Grandma confirms: the first pancake is always a disaster. It is tradition.'],
  [0, 'Smoke alarm reports a busy night. Asks for a raise.'],
  [0, 'Weather forecast: 100% chance of burnt toast.'],
  [1, 'Dishwasher discovers a plate that has been soaking since spring.'],
  [1, 'Sponge files a complaint. Says it has seen things.'],
  [2, 'Delivery runner beats the GPS again. GPS considering retirement.'],
  [2, 'Pizza arrives still hot. Customer suspicious.'],
  [3, 'Prep cook dices 400 onions. Whole street cries in sympathy.'],
  [3, 'Carrot sticks found cut to exactly the same length. Experts alarmed.'],
  [4, 'Knife sharpened so well it cut the evening news short.'],
  [4, 'Local tomatoes report feeling "nervous".'],
  [5, 'Recipe blog post opens with a 3,000-word life story. Readers scroll in silence.'],
  [5, 'Comment section asks if they can swap every ingredient. Chef sighs.'],
  [6, 'Head of Accounting finds a receipt from 2009. It is for one lemon.'],
  [6, 'Spreadsheet of spice costs named the scariest document in town.'],
  [7, 'Head Chef yells "Behind!" Three people jump into the walk-in freezer.'],
  [7, 'Rolling pin promoted to Sous Chef.'],
  [8, 'Kitchen stays open until 4 AM. Owls ask for a table.'],
  [8, 'Night-shift owner orders more hot sauce. Hot sauce orders more owner.'],
  [9, 'Chief Taste Tester finishes the menu. Asks if there is a second menu.'],
  [9, 'Scale in the break room retires early.'],
  [10, 'Volcano rents out its crater as a pizza oven. Reviews are glowing.'],
  [10, 'The Kitchen Demon asks for a day off. Request denied with a smile.'],
  [10, 'Astronomers name a new star after the house special.'],
];
function nextNews() {
  const max = Math.round(S.bestStage * 10 / Math.max(1, STAGES.length - 1));
  const pool = NEWS.filter(([s]) => s <= max).map(([, t]) => t);
  pool.push(`${restaurant()} now runs ${totalOwned()} pieces of equipment. The fire marshal is "monitoring".`);
  if (S.medals) pool.push(`${restaurant()} hangs its ${fmt(S.medals)}th Star on the wall. A bigger wall is on order.`);
  const n = $('#news');
  n.style.opacity = 0;
  setTimeout(() => { n.textContent = pool[Math.floor(Math.random() * pool.length)]; n.style.opacity = 1; }, 400);
}

// ---------- Hooks from core ----------
// Achievements that unlock together are announced in one toast.
let achQueue = [];
Hooks.achievement = a => {
  if (!achQueue.length) setTimeout(() => {
    toast(achQueue.length === 1
      ? `🏆 Achievement unlocked: <b>${achQueue[0].name}</b> <small class="tier-tag t${achTier(achQueue[0])}">${ACH_TIER_NAMES[achTier(achQueue[0]) - 1]}</small><br><small>${achQueue[0].desc}</small>`
      : `🏆 <b>${achQueue.length} achievements unlocked:</b> ${achQueue.slice(0, 3).map(x => x.name).join(', ')}${achQueue.length > 3 ? ` and ${achQueue.length - 3} more` : ''}`);
    achQueue = [];
    beep(1047, 0.18, 'sine', 0.05);
    updateAch();
  }, 50);
  achQueue.push(a);
};
Hooks.spawnShaker = spawnShaker;
Hooks.storm = spawnStorm;
Hooks.scoop = first => toast(first
  ? '🥯 <b>Sourdough Starter is alive!</b> A loaf rises every few hours, even offline. Feed loaves to equipment in the Kitchen tab.'
  : '🥯 A fresh <b>sourdough loaf</b> is ready.');
Hooks.autoClick = ({ v }) => { if (Math.random() < 0.5) { const [x, y] = fxPoint(); floatAt(x, y, '+' + fmt(v), 'auto'); } };
Hooks.legend = r => { toast(`🔱 <b>Inferno rank ${r}!</b> +10% steaks per second.`); sfx.fanfare(); };
Hooks.stage = i => {
  setStage();
  const st = STAGES[i], m = panIndex(i);
  sfx.fanfare();
  const pan = `<div class="slam-pan" data-plate="${m}">${$('#hero .pan').outerHTML.replace(/ id="[^"]*"/g, '')}<img class="slam-photo" src="assets/${st.img}?v=${ASSET_V}" alt="" style="object-position:${st.pos}"></div>`;
  if (i === STAGES.length - 1) {
    modal(`${pan}<div class="slam-kg">${PAN_MARKS[m]}</div><small class="mono">Main journey complete</small><h2>${st.name}</h2>
      <p>${st.text}</p><p><b>Endless mode unlocked.</b> Perfect Signature Dishes in the Signatures tab and climb Inferno ranks.
      They never reset, and there's no limit.</p>`, [{ label: 'Keep cooking' }], 'takeover');
  } else {
    modal(`${pan}<div class="slam-kg">${PAN_MARKS[m]}</div>
      <small class="mono">Stage ${i + 1} of ${STAGES.length} · new cut unlocked</small><h2>${st.name}</h2><p>${st.text}</p>`, [{ label: 'Back to the stove' }], 'takeover');
  }
  if (!calm) setTimeout(() => { const r = $('#modalCard .slam-pan'); if (r) { const b = r.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + b.height / 2, 26, 'gold'); burst(b.left + b.width / 2, b.top + b.height * .8, 20, 'spark'); } }, 220);
};

// ---------- Service style ----------
function renderSplits() {
  const wrap = $('#splits');
  SPLITS.forEach(sp => {
    const b = el('button', 'split', `${sp.icon}<span>${sp.name}</span>`);
    b.onclick = () => {
      if (setSplit(sp.id)) { sfx.chime(); toast(`${sp.icon} <b>${sp.name}</b>: ${sp.desc}`); updateAll(); }
      else if (splitCooldown() > 0 && sp.id !== S.split) toast(`You can change the service style again in ${fmtTime(splitCooldown())}.`);
    };
    bindTip(b, () => tipHead(sp.icon, sp.name, 'Service style') + `<div class="t-desc">${sp.desc}</div>` +
      (splitCooldown() > 0 && sp.id !== S.split ? `<div class="t-cost no"><span>Switch in</span><b>${fmtTime(splitCooldown())}</b></div>` : ''));
    sp.node = b;
    wrap.appendChild(b);
  });
}
function updateSplits() {
  $('#splitBox').classList.toggle('hidden', !splitsUnlocked());
  if (!splitsUnlocked()) return;
  SPLITS.forEach(sp => sp.node.classList.toggle('active', S.split === sp.id));
  const cd = splitCooldown();
  $('#splitCd').textContent = cd > 0 ? `switch in ${fmtTime(cd)}` : 'ready to switch';
}

// ---------- Extension tabs ----------
function renderExtTabs() {
  EXT.filter(e => e.tab).forEach(e => {
    const btn = el('button', 'ext-tab', e.tab.label);
    btn.dataset.view = 'ext-' + e.id;
    $('#menu').insertBefore(btn, $('#menu button[data-view=ach]'));
    const v = el('div', 'view hidden');
    v.id = 'view-ext-' + e.id;
    $('.views').appendChild(v);
    e.tab.el = v;
    e.tab.btn = btn;
    e.tab.render(v);
  });
}
// Tabs stay hidden until their feature unlocks, so a new player starts with a short menu.
const CORE_TABS = {
  muscles: () => S.bestStage >= 1 || S.prestiges > 0,
  comp: () => S.bestStage >= 5 || S.prestiges > 0,
  records: () => mainComplete(),
};
let knownTabs = null;
function updateExtTabs() {
  const tabs = Object.entries(CORE_TABS).map(([id, shown]) => [$(`#menu button[data-view=${id}]`), shown]);
  EXT.forEach(e => { if (e.tab && e.tab.shown) tabs.push([e.tab.btn, e.tab.shown]); });
  const first = !knownTabs;
  if (first) knownTabs = new Set();
  tabs.forEach(([btn, shown]) => {
    const on = shown();
    btn.classList.toggle('hidden', !on);
    if (!on || knownTabs.has(btn)) return;
    knownTabs.add(btn);
    // Tabs already open when the page loads are not news.
    if (!first) { btn.classList.add('fresh'); toast(`🔓 <b>New: ${esc(btn.textContent.trim())}</b> tab unlocked!`); }
  });
}

// ---------- Update cycle ----------
function updateAll() {
  if (shownStage !== S.bestStage) setStage();
  updateLeft();
  EXT.forEach(e => { if (e.tab && view === 'ext-' + e.id) e.tab.update(e.tab.el); });
  updateSplits();
  updateExtTabs();
  updateStore();
  updateUpgrades();
  updatePass();
  if (view === 'gym') updateGym();
  if (view === 'muscles') updateMuscles();
  if (view === 'records') updateRecords();
  if (view === 'stats') updateStats();
  updateComp();
  drawTip();
}

// A hidden tab doesn't run frames, so its away time is credited on return or on the next load, never both.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { hiddenAt = document.hidden ? Date.now() : 0; });
function save() { try { localStorage.setItem(SAVE_KEY, serialize(hiddenAt || Date.now())); } catch (e) { /* storage unavailable */ } }

function rename() {
  modal(`<div class="m-kicker mono">New sign out front</div><h2>Name your restaurant</h2><p>Whose kitchen is this?</p><input id="nameInput" maxlength="20" class="name-input">`, [
    { label: 'Cancel', cls: 'secondary' },
    { label: 'Hang the sign', action: () => {
      const v = $('#nameInput').value.trim();
      if (v) { S.gymName = v; S.flags.named = true; $('#gymName').textContent = restaurant(); setStage(); }
    } },
  ]);
  $('#nameInput').value = S.gymName;
  $('#nameInput').onkeydown = e => { if (e.key === 'Enter') $('#modalCard .modal-btns .btn:last-child').click(); };
  setTimeout(() => $('#nameInput').select(), 50);
}

function init() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) loadFrom(raw); } catch (e) { /* no or broken save */ }
  $$('.chip-ic').forEach(n => { n.innerHTML = iconize(n.textContent); });
  renderPass();
  renderStore(); renderGym(); renderMuscles(); renderRecords(); renderPerks();
  renderSplits(); renderExtTabs(); renderAch();
  setStage(); updateAch();
  $('#gymName').textContent = restaurant();

  const off = offlineProgress();
  if (off) modal(`<div class="m-kicker mono">While you were out</div><h2>Welcome back, chef!</h2><p>You were gone for ${fmtTime(off.away)}. The kitchen kept cooking:</p>
    <div class="m-big">+${fmt(off.v)} <small>steaks</small></div>`, [{ label: 'Back to the stove' }]);

  $('#hero').addEventListener('click', onHeroClick);
  $('#gymName').onclick = rename;
  $$('#menu button').forEach(b => b.onclick = () => {
    b.classList.remove('fresh');
    view = b.dataset.view;
    $$('#menu button').forEach(x => x.classList.toggle('active', x === b));
    $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + view));
    if (view === 'ach') updateAch();
    updateAll();
  });
  $$('#modeSeg button').forEach(b => b.onclick = () => {
    storeMode = b.dataset.mode;
    $$('#modeSeg button').forEach(x => x.classList.toggle('active', x === b));
    updateStore();
  });
  $$('#amtSeg button').forEach(b => b.onclick = () => {
    storeAmt = b.dataset.amt === 'max' ? 'max' : +b.dataset.amt;
    $$('#amtSeg button').forEach(x => x.classList.toggle('active', x === b));
    updateStore();
  });
  $('#competeBtn').onclick = askCompete;
  $('#newsBox').onclick = () => { S.newsClicks++; nextNews(); };

  const soundLabel = () => { $('#optSound').innerHTML = iconize(S.muted ? '🔇 Sound: off' : '🔊 Sound: on'); };
  soundLabel();
  $('#optSound').onclick = () => { S.muted = !S.muted; soundLabel(); };
  $('#optRename').onclick = rename;
  $('#optExport').onclick = () => {
    modal(`<h2>Export save</h2><p>Copy this text somewhere safe.</p><textarea readonly>${btoa(unescape(encodeURIComponent(serialize())))}</textarea>`);
    setTimeout(() => $('#modalCard textarea').select(), 50);
  };
  $('#optImport').onclick = () => modal(`<h2>Import save</h2><p>Paste a save below. This replaces your current progress.</p><textarea id="importText"></textarea>`, [
    { label: 'Cancel', cls: 'secondary' },
    { label: 'Import', action: () => {
      try { loadFrom(decodeURIComponent(escape(atob($('#importText').value.trim())))); S.flags.imported = true; }
      catch (e) { toast('That save could not be read.'); return false; }
      save(); location.reload();
    } },
  ]);
  $('#optWipe').onclick = () => modal('<h2>Wipe save?</h2><p>This deletes <b>all</b> progress, including Stars, Signature Dishes and achievements.</p>', [
    { label: 'Cancel', cls: 'secondary' },
    { label: 'Delete everything', cls: 'danger', action: () => {
      resetAll();
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      location.reload();
    } },
  ]);

  nextNews();
  setInterval(nextNews, 10000);
  setInterval(save, 10000);
  addEventListener('beforeunload', save);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });

  let last = performance.now(), uiAcc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    // Browsers pause animation frames in background tabs; credit that time at the base rate.
    if (dt > 1) {
      const gap = dt > 61 ? awayGain(dt - 1) : { away: dt - 1, v: baseGps() * (dt - 1) };
      earn(gap.v); S.runTime += gap.away; S.playTime += gap.away; dt = 1;
    }
    tick(dt);
    uiAcc += dt;
    if (uiAcc >= 0.1) { uiAcc = 0; updateAll(); }
    requestAnimationFrame(frame);
  }
  updateAll();
  requestAnimationFrame(frame);
}
init();
