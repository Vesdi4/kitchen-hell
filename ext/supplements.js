'use strict';
// Hot Sauce Rack: a minigame on the Hot Sauce Lab. Splash sauces into a limited number of
// rack slots for 10 real minutes each; spice tolerance builds with every splash and weakens all effects.
// Too much tolerance triggers a Meltdown. (Internal ids still say supps/dose/tol/jit.)
(() => {
  const ID = 'supps';
  const DOSE_MIN = 10, TOL_MAX = 200, JIT_ON = 150, JIT_OFF = 120;
  const KEYS = ['gps', 'click', 'cost', 'shakerRate', 'buffDur'];
  const LABEL = { gps: 'steaks per second', click: 'cooking power', cost: 'equipment prices', shakerRate: 'Golden Dumpling rate', buffDur: 'buff duration' };
  const SUPPS = [
    { id: 'creatine', name: 'Mild Mumble', icon: '🌶️', heat: 1, at: 1, fx: { click: 1.5 }, desc: 'Barely a tingle. Somehow it makes your hands work twice as fast.' },
    { id: 'whey', name: 'Garlic Goblin', icon: '🧄', heat: 2, at: 5, fx: { gps: 1.2 }, desc: 'Forty cloves per bottle. The whole kitchen smells like ambition.' },
    { id: 'caffeine', name: 'Espresso Habanero', icon: '☕', heat: 3, at: 15, fx: { click: 1.25, shakerRate: 1.1 }, desc: 'Coffee and chili in one bottle. Nobody asked for this, everybody needs it.' },
    { id: 'lytes', name: 'Lime Sweat', icon: '🍋', heat: 2, at: 30, fx: { buffDur: 1.25 }, desc: 'Sour, salty and weirdly refreshing. The rush just keeps going.' },
    { id: 'fishoil', name: 'Fish Sauce Fury', icon: '🐟', heat: 2, at: 60, fx: { cost: 0.95 }, desc: 'Smells like a harbour, haggles like a pirate. Suppliers give up and give discounts.' },
    { id: 'pre', name: "Dragon's Breath", icon: '🐉', heat: 5, at: 100, fx: { shakerRate: 1.25 }, desc: 'One drop and your ears whistle. Golden Dumplings come running to see the smoke.' },
    { id: 'casein', name: 'Midnight Mole', icon: '🌙', heat: 3, at: 120, fx: { gps: 1.1 }, len: 2, desc: 'Slow-simmered for nine hours, works through the night shift. Lasts twice as long.' },
    { id: 'mystery', name: 'Bottle #666', icon: '☠️', heat: 6, at: 160, fx: {}, price: 1.5, desc: 'Found behind the walk-in freezer, label melted off. Something strong happens. Probably good.' },
  ];
  const S_BY_ID = Object.fromEntries(SUPPS.map(s => [s.id, s]));
  // Bottle #666 outcomes; the last one is the penalty and is not weakened by tolerance.
  const ROLLS = [
    { name: 'Volcanic Glow', fx: { gps: 1.4 }, w: 30 },
    { name: 'Asbestos Hands', fx: { click: 2.5 }, w: 25 },
    { name: 'Dumpling Fever', fx: { shakerRate: 1.6, buffDur: 1.2 }, w: 20 },
    { name: 'Gut Riot', fx: { gps: 0.9 }, w: 25, bad: true, min: 2 },
  ];
  const COMBOS = [
    { id: 'classic', name: 'Chili Garlic Crunch', pair: ['creatine', 'whey'], fx: { gps: 1.05, click: 1.1 } },
    { id: 'hustle', name: 'Wake-Up Margarita', pair: ['caffeine', 'lytes'], fx: { click: 1.15, buffDur: 1.1 } },
    { id: 'night', name: 'Graveyard Shift Glaze', pair: ['fishoil', 'casein'], fx: { gps: 1.08, cost: 0.97 } },
  ];
  const SLOT_AT = [1, 25, 100, 250];

  const st = () => extState(ID);
  const slots = () => SLOT_AT.filter(n => own(ID) >= n).length + (own(ID) >= 1 ? 1 : 0);
  const decayRate = () => U.has('sup_u1') ? 1.5 : 1; // spice tolerance points per real minute
  const tolGain = () => U.has('sup_u2') ? 7 : 10;
  const doseLen = s => DOSE_MIN * 60000 * (s.len || 1) * (U.has('sup_u0') ? 1.5 : 1);
  function tolNow(o = st(), now = Date.now()) {
    const t = (+o.tol || 0) - Math.max(0, now - (+o.tolAt || now)) / 60000 * decayRate();
    return Math.min(TOL_MAX, Math.max(0, t));
  }
  const efficacy = t => Math.max(0.25, 1 - t / 200);
  const live = (o = st(), now = Date.now()) => (o.active || []).filter(d => d.until > now && S_BY_ID[d.id]);
  const isOn = (act, id) => act.some(d => d.id === id && !(d.roll != null && ROLLS[d.roll] && ROLLS[d.roll].bad));
  const comboOn = (act, c) => c.pair.every(id => isOn(act, id));
  const doseFx = d => d.id === 'mystery' ? (ROLLS[d.roll] || ROLLS[0]) : S_BY_ID[d.id];
  function price(s) {
    const p = Math.max(1e9, baseGps() * 240) * (s.price || 1);
    return isFinite(p) ? p : 1e9;
  }

  // Multipliers are cached briefly: gps() is called many times per frame.
  let cache = null;
  function mults() {
    const now = Date.now();
    if (cache && now - cache.at < 250) return cache.m;
    const o = st(), act = live(o, now), e = efficacy(tolNow(o, now)), m = {};
    KEYS.forEach(k => { m[k] = 1; });
    const apply = (fx, scale) => { for (const k in fx) m[k] *= 1 + (fx[k] - 1) * scale; };
    act.forEach(d => { const f = doseFx(d); apply(f.fx, f.bad ? 1 : e); });
    COMBOS.forEach(c => { if (comboOn(act, c)) apply(c.fx, e); });
    if (o.jit) m.gps *= 0.85;
    KEYS.forEach(k => { if (!isFinite(m[k]) || m[k] <= 0) m[k] = 1; });
    cache = { at: now, m };
    return m;
  }
  const dirty = () => { cache = null; };

  function markCombos(o, act) { COMBOS.forEach(c => { if (comboOn(act, c)) o.combos[c.id] = 1; }); }
  function canDose(s) {
    const o = st(), act = live(o);
    if (own(ID) < s.at) return false;
    if (!act.some(d => d.id === s.id) && act.length >= slots()) return false;
    return S.gains >= price(s);
  }
  function dose(s) {
    if (!canDose(s)) return null;
    const o = st(), now = Date.now(), cost = price(s);
    S.gains -= cost;
    o.active = live(o, now).filter(d => d.id !== s.id);
    const d = { id: s.id, until: now + doseLen(s) };
    if (s.id === 'mystery') {
      let r = Math.random() * ROLLS.reduce((a, x) => a + x.w, 0), k = 0;
      while (k < ROLLS.length - 1 && (r -= ROLLS[k].w) >= 0) k++;
      d.roll = k;
      if (ROLLS[k].bad) { d.until = now + ROLLS[k].min * 60000; o.bad = (o.bad || 0) + 1; }
    }
    o.active.push(d);
    o.tol = Math.min(TOL_MAX, tolNow(o, now) + tolGain());
    o.tolAt = now;
    o.peak = Math.max(o.peak || 0, o.tol);
    o.doses = (o.doses || 0) + 1;
    o.tried[s.id] = 1;
    markCombos(o, o.active);
    checkJitters(o, now);
    dirty();
    return d;
  }
  function checkJitters(o, now) {
    const t = tolNow(o, now);
    if (!o.jit && t > JIT_ON) {
      o.jit = true;
      if (typeof toast === 'function') toast('🥵 <b>Meltdown!</b> Your spice tolerance is through the roof: steaks per second ×0.85 until it cools down.');
    } else if (o.jit && t < JIT_OFF) {
      o.jit = false; o.survived = true;
      if (typeof toast === 'function') toast('🥵 The meltdown is over. You can feel your tongue again.');
    }
  }

  registerExt({
    id: ID,
    state: () => ({ active: [], tol: 0, tolAt: 0, doses: 0, tried: {}, combos: {}, jit: false, survived: false, peak: 0, bad: 0 }),
    gps: () => mults().gps,
    click: () => mults().click,
    cost: () => mults().cost,
    shakerRate: () => mults().shakerRate,
    buffDur: () => mults().buffDur,
    slow() {
      const o = st(), now = Date.now();
      if (!Array.isArray(o.active)) o.active = [];
      if (!o.tried || typeof o.tried !== 'object') o.tried = {};
      if (!o.combos || typeof o.combos !== 'object') o.combos = {};
      const n = o.active.length;
      o.active = live(o, now);
      if (o.active.length !== n) dirty();
      markCombos(o, o.active);
      const was = o.jit;
      checkJitters(o, now);
      if (was !== o.jit) dirty();
    },
    // A new run empties the rack; your tongue keeps its tolerance.
    compete() { st().active = []; dirty(); },
    tab: { label: 'Hot Sauce', shown: () => own(ID) >= 1, render, update },
    dose: id => S_BY_ID[id] ? dose(S_BY_ID[id]) : null, // for tests and the console
  });

  // ---------- Achievements & upgrades ----------
  const CAT = 'Hot Sauce';
  extAch(CAT, 'sup_first', 'First Drop', '🌶️', 'Splash your first hot sauce.', () => (st().doses || 0) >= 1);
  extAch(CAT, 'sup_25', 'Regular at the Rack', '🫙', 'Splash 25 hot sauces.', () => (st().doses || 0) >= 25);
  extAch(CAT, 'sup_100', 'Dragon Mouth', '🐲', 'Splash 100 hot sauces.', () => (st().doses || 0) >= 100);
  extAch(CAT, 'sup_full', 'Fully Stocked Rack', '🏺', 'Fill every rack slot at once, with at least 3 slots.', () => slots() >= 3 && live().length >= slots());
  extAch(CAT, 'sup_jit', 'Cooled Down', '🥵', 'Have a Meltdown and wait it out.', () => !!st().survived);
  extAch(CAT, 'sup_combo', 'Flavor Theory', '🔀', 'Activate every sauce combo at least once.', () => COMBOS.every(c => st().combos && st().combos[c.id]));
  extAch(CAT, 'sup_all', 'Tasting Flight', '🎁', 'Try every hot sauce at least once.', () => SUPPS.every(s => st().tried && st().tried[s.id]));
  extAch(CAT, 'sup_redline', 'Five-Alarm Fire', '🚨', 'Push your spice tolerance to 190 or more.', () => (st().peak || 0) >= 190, true);
  [['sup_first', 1], ['sup_25', 2], ['sup_100', 3], ['sup_full', 3], ['sup_jit', 2], ['sup_combo', 3], ['sup_all', 4], ['sup_redline', 5]]
    .forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });

  [['sup_u0', 'Wax-Sealed Bottles', '⏱️', 2.5e13, 25, 'Hot sauce splashes last 50% longer.'],
   ['sup_u1', 'Glass of Cold Milk', '🥛', 2.5e15, 60, 'Spice tolerance wears off 50% faster.'],
   ['sup_u2', 'Barrel-Aged Batches', '🛢️', 5e18, 120, 'Each splash adds 7 spice tolerance instead of 10.']]
    .forEach(([id, name, icon, cost, n, desc]) => extUpg({
      id, kind: 'special', icon, name, cost, desc, req: `Own ${n} Hot Sauce Labs`, unlock: () => own(ID) >= n,
    }));

  // ---------- UI ----------
  const fxText = (fx, e) => Object.entries(fx).map(([k, v]) => {
    const x = 1 + (v - 1) * e;
    return k === 'cost' ? `${LABEL[k]} −${((1 - x) * 100).toFixed(1)}%` : `${LABEL[k]} ×${x.toFixed(2)}`;
  }).join(', ');
  const left = d => Math.max(0, (d.until - Date.now()) / 1000);
  const heatText = s => s.heat > 5 ? 'Heat: ??? (off the scale)' : `Heat: ${'🔥'.repeat(s.heat)} ${s.heat}/5`;

  function render(v) {
    if (!document.getElementById('ext-supps-css')) {
      const css = el('style');
      css.id = 'ext-supps-css';
      css.textContent = `
#view-ext-supps .x-supps-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; margin-bottom: 8px;
  padding: 8px; background: #141012; border: 2px solid #2b2326; border-radius: 6px; box-shadow: inset 0 -6px 0 #2b2326; }
#view-ext-supps .x-supps-slot { padding: 10px 10px 8px; min-height: 74px; color: #f3ead8; border-radius: 4px;
  background: linear-gradient(180deg, #2a1d1a, #1b1416); border: 1px solid #3a2c2c; box-shadow: inset 0 -3px 0 rgba(212, 162, 76,.25); }
#view-ext-supps .x-supps-slot .ic { font-size: 20px; color: #d4a24c; filter: drop-shadow(0 0 4px rgba(212, 162, 76,.55)); }
#view-ext-supps .x-supps-slot b { display: block; font-stretch: 80%; font-weight: 800; font-size: 15px; line-height: 1.15; }
#view-ext-supps .x-supps-slot small { display: block; font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #b9aa98; }
#view-ext-supps .x-supps-slot.empty { color: #8f8478; background: #1a1517; box-shadow: none; border-style: dashed; }
#view-ext-supps .x-supps-slot.locked { background: repeating-linear-gradient(135deg, #1a1517 0 6px, #221b1d 6px 12px); color: #6f655c; box-shadow: none; }
#view-ext-supps .x-supps-slot.locked .ic { color: #8a9099; filter: none; }
#view-ext-supps .x-supps-slot.bad .ic, #view-ext-supps .x-supps-slot.bad b { color: #7fa35a; filter: none; }
#view-ext-supps .x-supps-tol { position: relative; height: 8px; background: #2b2326; margin: 6px 0 4px; border-radius: 4px; overflow: visible; }
#view-ext-supps .x-supps-tol i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #ffb03a, #d4a24c); transition: width .3s; }
#view-ext-supps .x-supps-tol.jit i { background: linear-gradient(90deg, #d4a24c, #e0301e); box-shadow: 0 0 8px rgba(224,48,30,.8); }
#view-ext-supps .x-supps-tol em { position: absolute; top: -3px; bottom: -3px; left: 75%; width: 2px; background: #e0301e; }
#view-ext-supps .stat-box b.mono { font-family: var(--mono, ui-monospace, monospace); font-size: 24px; }
#view-ext-supps .x-supps-combos { border-top: 2px solid #d4a24c; }
#view-ext-supps .x-supps-combo { display: grid; grid-template-columns: minmax(0, 190px) 1fr; gap: 2px 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px dashed rgba(138,144,153,.45); color: var(--muted, #8f8478); font-size: 14px; }
#view-ext-supps .x-supps-combo b { font-stretch: 80%; font-weight: 800; font-size: 16px; color: var(--ink, inherit); }
#view-ext-supps .x-supps-combo .mono { font-size: 12px; grid-column: 2; }
#view-ext-supps .x-supps-combo.on { box-shadow: inset 4px 0 0 #d4a24c; padding-left: 12px; background: linear-gradient(90deg, rgba(212, 162, 76,.14), transparent 70%); }
#view-ext-supps .x-supps-combo.on .mono { color: #e0301e; font-weight: 600; }
#view-ext-supps .x-supps-heat { display: block; font-size: 12px; color: #e0301e; margin: 2px 0 4px; letter-spacing: .02em; }
#view-ext-supps .card.x-supps-lock { opacity: .5; }
#view-ext-supps .card.x-supps-on { box-shadow: 0 0 0 2px #d4a24c, 0 0 14px rgba(212, 162, 76,.35); }
#view-ext-supps .card.x-supps-on .card-top .lv { color: #e0301e; }
@media (max-width: 700px) {
  #view-ext-supps .x-supps-combo { grid-template-columns: 1fr; }
  #view-ext-supps .x-supps-combo .mono { grid-column: 1; }
}`;
      document.head.appendChild(css);
    }
    v.appendChild(el('h2', '', 'Hot Sauce Rack'));
    v.appendChild(el('p', 'hint', 'Splash hot sauces into your rack slots. Each splash lasts 10 minutes of real time, even while the game is closed. Every splash builds spice tolerance, which weakens all effects; above 150 you have a Meltdown.'));
    const grid = el('div', 'comp-grid', `
      <div class="stat-box"><small>Rack slots</small><b class="mono x-supps-nslots"></b><span class="x-supps-nextslot"></span></div>
      <div class="stat-box"><small>👅 Spice Tolerance</small><b class="mono x-supps-tolv"></b><div class="x-supps-tol"><i></i><em></em></div><span class="x-supps-eff"></span></div>
      <div class="stat-box"><small>Splashes</small><b class="mono x-supps-doses"></b><span class="x-supps-price"></span></div>`);
    v.appendChild(grid);
    bindTip(grid.children[1], () => tipHead('👅', 'Spice Tolerance', 'Wears off over real time') +
      `<div>Each splash adds ${tolGain()} tolerance. It drops by ${decayRate()} per minute. All sauce and combo effects are multiplied by kick (1 − tolerance/200, at least 25%).</div><hr>
      <div>Above ${JIT_ON}: <b>🥵 Meltdown</b>, steaks per second ×0.85 until tolerance falls below ${JIT_OFF}.</div>`);
    v.appendChild(el('h3', '', 'Your rack'));
    const row = el('div', 'x-supps-slots');
    v.slotNodes = [];
    for (let k = 0; k < 5; k++) {
      const n = el('div', 'x-supps-slot', '<span class="ic"></span><b></b><small></small>');
      n.key = null;
      bindTip(n, () => n.tip || '');
      row.appendChild(n); v.slotNodes.push(n);
    }
    v.appendChild(row);
    v.appendChild(el('h3', '', 'Sauce combos'));
    v.appendChild(el('p', 'hint', 'Keep both sauces of a pair on your rack for an extra bonus.'));
    const cw = el('div', 'x-supps-combos');
    v.comboNodes = COMBOS.map(c => {
      const [a, b] = c.pair.map(id => S_BY_ID[id]);
      const n = el('div', 'x-supps-combo', `<b>🔀 ${c.name}</b><span>${a.icon} ${a.name} + ${b.icon} ${b.name}</span><span class="mono"></span>`);
      cw.appendChild(n);
      return n;
    });
    v.appendChild(cw);
    v.appendChild(el('h3', '', 'The sauce shelf'));
    const cards = el('div', 'cards');
    v.cardNodes = SUPPS.map(s => {
      const c = el('div', 'card', `<div class="card-top"><span class="ic">${s.icon}</span><b>${s.name}</b><span class="lv"></span></div>
        <small class="x-supps-heat">${heatText(s)}</small><p class="x-supps-fx"></p><div class="bar"><i></i></div><button class="btn"></button>`);
      c.querySelector('button').onclick = () => {
        const d = dose(s);
        if (!d) return;
        if (d.roll != null) {
          const r = ROLLS[d.roll];
          toast(`☠️ Bottle #666: <b>${r.name}</b>${r.bad ? ` (${fxText(r.fx, 1)} for ${r.min} min)` : ` (${fxText(r.fx, efficacy(tolNow()))})`}`);
        }
        sfx.buy(); updateAll();
      };
      bindTip(c, () => {
        const e = efficacy(tolNow());
        let h = tipHead(s.icon, s.name, `Hot sauce · unlocks at ${s.at} labs`) + `<div>${s.desc}</div><div>${heatText(s)}</div><hr>`;
        if (s.id === 'mystery') h += ROLLS.map(r => `<div>${r.bad ? '⛔' : '🎲'} <b>${r.name}</b> (${r.w}%): ${fxText(r.fx, r.bad ? 1 : e)}${r.bad ? `, ${r.min} min` : ''}</div>`).join('');
        else h += `<div>Now: ${fxText(s.fx, e)} for ${fmtTime(doseLen(s) / 1000)}.</div>`;
        const cs = COMBOS.filter(c => c.pair.includes(s.id));
        if (cs.length) h += `<div>Combo: ${cs.map(c => c.name).join(', ')}</div>`;
        return h + `<div>Price: <b>${fmt(price(s))}</b> steaks (4 min of production) · +${tolGain()} spice tolerance</div>`;
      });
      cards.appendChild(c);
      return c;
    });
    v.appendChild(cards);
  }

  function update(v) {
    const o = st(), now = Date.now(), act = live(o, now), t = tolNow(o, now), e = efficacy(t), n = slots();
    v.querySelector('.x-supps-nslots').textContent = `${act.length} / ${n}`;
    const next = SLOT_AT.find(x => own(ID) < x);
    v.querySelector('.x-supps-nextslot').textContent = n >= 5 ? 'all slots open' : `next slot at ${next} labs`;
    v.querySelector('.x-supps-tolv').textContent = `${t.toFixed(1)}${o.jit ? ' · MELTDOWN' : ''}`;
    const bar = v.querySelector('.x-supps-tol');
    bar.classList.toggle('jit', !!o.jit);
    bar.querySelector('i').style.width = (t / TOL_MAX * 100) + '%';
    v.querySelector('.x-supps-eff').textContent = `kick ${Math.round(e * 100)}%${t > 0 ? ` · cool in ${fmtTime(t / decayRate() * 60)}` : ''}`;
    v.querySelector('.x-supps-doses').textContent = String(o.doses || 0);
    v.querySelector('.x-supps-price').textContent = `splash price from ${fmt(price(SUPPS[0]))}`;

    v.slotNodes.forEach((node, k) => {
      const d = act[k], locked = k >= n;
      const key = locked ? 'L' : d ? d.id + ':' + (d.roll != null ? d.roll : '') : 'E';
      if (node.key !== key) {
        node.key = key;
        node.className = 'x-supps-slot' + (locked ? ' locked' : d ? '' : ' empty');
        const s = d && S_BY_ID[d.id], r = d && d.id === 'mystery' ? ROLLS[d.roll] : null;
        if (r && r.bad) node.classList.add('bad');
        node.querySelector('.ic').innerHTML = iconize(locked ? '🔒' : s ? s.icon : '');
        node.querySelector('b').textContent = locked ? 'Locked' : s ? (r ? r.name : s.name) : 'Empty slot';
        node.tip = locked ? tipHead('🔒', 'Locked slot', 'Rack slot') + `<div>Opens at ${SLOT_AT[k - 1] || 1} Hot Sauce Labs.</div>`
          : s ? tipHead(s.icon, r ? `${s.name}: ${r.name}` : s.name, 'On the rack') + `<div>${fxText(doseFx(d).fx, r && r.bad ? 1 : e)}</div>`
          : tipHead('🫙', 'Empty slot', 'Rack slot') + '<div>Splash a sauce from the shelf below.</div>';
      }
      node.querySelector('small').textContent = locked ? `at ${SLOT_AT[k - 1] || 1} labs` : d ? fmtTime(left(d)) + ' left' : 'free';
    });

    COMBOS.forEach((c, k) => {
      const on = comboOn(act, c), node = v.comboNodes[k];
      node.classList.toggle('on', on);
      node.querySelector('.mono').textContent = (on ? 'ACTIVE · ' : o.combos && o.combos[c.id] ? 'found · ' : '') + fxText(c.fx, e);
    });

    SUPPS.forEach((s, k) => {
      const c = v.cardNodes[k], d = act.find(x => x.id === s.id), lock = own(ID) < s.at, btn = c.querySelector('button');
      c.classList.toggle('x-supps-lock', lock);
      c.classList.toggle('x-supps-on', !!d);
      c.querySelector('.lv').textContent = lock ? `at ${s.at} labs` : d ? `${fmtTime(left(d))} left` : (o.tried && o.tried[s.id] ? 'tried' : 'new');
      const r = d && d.id === 'mystery' ? ROLLS[d.roll] : null;
      c.querySelector('.x-supps-fx').textContent = s.id === 'mystery' ? (r ? `${r.name}: ${fxText(r.fx, r.bad ? 1 : e)}` : 'Random strong effect, or a short tummy ache.')
        : fxText(s.fx, e) + (s.len ? ` · lasts ${fmtTime(doseLen(s) / 1000)}` : '');
      c.querySelector('i').style.width = d ? Math.min(100, (d.until - now) / (d.roll != null && r && r.bad ? r.min * 60000 : doseLen(s)) * 100) + '%' : '0%';
      const p = price(s), full = !d && act.length >= n;
      btn.textContent = lock ? 'Locked' : full ? 'Rack full' : `${d ? 'Top up' : 'Splash'} · ${fmt(p)}`;
      btn.disabled = lock || full || S.gains < p;
    });
  }
})();
