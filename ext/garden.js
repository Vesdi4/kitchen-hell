'use strict';
// Herb Planter Box: a gardening minigame on the Grill Station. Plants grow in real time (one growth
// tick per real minute, caught up after the game was closed), give small passive bonuses while ripe,
// and pay out when harvested. Empty plots next to two ripe parents can sprout crossbreeds.
(() => {
  const ID = 'garden';
  const W = 5, TICK = 60000, MAX_CATCHUP = 600, SOIL_CD = 600000, GLUT_HALF = 600000;
  const KEYS = ['gps', 'click', 'cost', 'shakerRate', 'buffDur'];
  const LABEL = { gps: 'steaks/s', click: 'cooking power', cost: 'prices', shakerRate: 'Golden Dumpling rate', buffDur: 'buff duration' };
  // Summed bonus caps per key (min, max), applied before turning the sum into a multiplier.
  const CAP = { gps: [-0.15, 0.6], click: [-0.3, 0.8], cost: [-0.1, 0], shakerRate: [-0.2, 0.4], buffDur: [0, 0.3] };
  // grow/life in growth ticks (minutes on Potting Mix); seed = price in minutes of base production;
  // pay = harvest payout in minutes of base production; buff = harvest buff [type, mult, sec, name].
  const PLANTS = [
    { id: 'basil', name: 'Brimstone Basil', icon: '🌿', grow: 3, life: 30, seed: 1, fx: { gps: 0.01 }, pay: 2, starter: true,
      desc: 'Smells like a summer pesto and faintly of sulfur. The default herb of the underworld.' },
    { id: 'thyme', name: 'Thumbprint Thyme', icon: '🍃', grow: 4, life: 30, seed: 1, fx: { click: 0.02 }, pay: 1.5, starter: true,
      desc: 'Every leaf has a tiny fingerprint on it. Nobody knows whose.' },
    { id: 'chili', name: 'Ember Chili', icon: '🌶️', grow: 6, life: 25, seed: 1.5, fx: { buffDur: 0.015 }, pay: 5, starter: true,
      desc: 'Glows faintly at night. Pick it with oven mitts.' },
    { id: 'sage', name: 'Sous Sage', icon: '🪻', grow: 8, life: 40, seed: 2, fx: { gps: 0.02 }, pay: 4,
      desc: 'Quietly does half the work and lets the basil take the credit.' },
    { id: 'saffron', name: 'Greedy Saffron', icon: '🌷', grow: 10, life: 40, seed: 3, fx: { shakerRate: 0.02 }, pay: 8,
      desc: 'Each thread is worth more than the kitchen. It knows it, too.' },
    { id: 'ghost', name: 'Ghost Pepper Vine', icon: '🫑', grow: 15, life: 30, seed: 4, fx: { click: 0.04 }, pay: 14,
      desc: 'The peppers are see-through. The heat is not.' },
    { id: 'coriander', name: 'Four-Leaf Coriander', icon: '☘️', grow: 12, life: 45, seed: 4, fx: { shakerRate: 0.04 }, pay: 3, summon: true,
      desc: 'Half the kitchen loves it, half thinks it tastes like soap. Golden Dumplings love it.' },
    { id: 'hellmint', name: 'Hellmint', icon: '💮', grow: 10, life: 40, seed: 3, fx: {}, aura: 0.25, pay: 3,
      desc: 'Unbearably fresh. Neighbouring plants work 25% harder just to get away from the smell.' },
    { id: 'nightshade', name: 'Night-Shift Nightshade', icon: '🍆', grow: 14, life: 50, seed: 5, fx: { gps: 0.04, click: -0.04 }, pay: 10,
      desc: 'Makes the ovens run all night and makes your arms want a nap.' },
    { id: 'shroom', name: 'Sulfur Shroom', icon: '🧫', grow: 9, life: 35, seed: 3, fx: { cost: -0.01 }, pay: 9,
      desc: 'Grows wherever the mold has been. Suppliers take it as payment, no questions asked.' },
    { id: 'mandrake', name: 'Screaming Mandrake', icon: '😱', grow: 20, life: 25, seed: 6, fx: {}, buff: ['gps', 3, 30, 'Mandrake Scream'],
      desc: 'Pull it up and it screams so loudly that every cook in the building works three times faster for a bit.' },
    { id: 'cactus', name: "Devil's Tongue Cactus", icon: '🌵', grow: 16, life: 60, seed: 5, fx: { cost: -0.02 }, buff: ['click', 5, 20, 'Prickly Fingers'],
      desc: 'Licks you back. Harvesting it leaves your fingers very, very motivated.' },
    { id: 'flytrap', name: 'Venus Fry-Trap', icon: '🪤', grow: 12, life: 40, seed: 3, fx: { gps: 0.01 }, guard: true, pay: 6,
      desc: 'Snaps up any mold that creeps next to it, then asks for ketchup.' },
    { id: 'lotus', name: 'Hellfire Lotus', icon: '🌺', grow: 30, life: 40, seed: 10, fx: { gps: 0.04, shakerRate: 0.03 }, buff: ['gps', 7, 40, 'Hellfire Bloom'],
      desc: 'Blooms once in a blue flame. The whole restaurant catches fire, in the good way.' },
    { id: 'mold', name: 'Charred Mold', icon: '🦠', grow: 3, life: 60, seed: 0.5, fx: { gps: -0.01 }, weed: true,
      desc: 'Black, fuzzy and spreading. Technically a plant. Some odd things only sprout next to it.' },
  ];
  const P = Object.fromEntries(PLANTS.map(p => [p.id, p]));
  // Crossbreeds: an empty plot whose ripe neighbours include both parents rolls `ch` per growth tick.
  const RECIPES = [
    { a: 'basil', b: 'thyme', c: 'sage', ch: 0.06 },
    { a: 'chili', b: 'chili', c: 'ghost', ch: 0.03 },
    { a: 'sage', b: 'chili', c: 'saffron', ch: 0.04 },
    { a: 'mold', b: 'chili', c: 'shroom', ch: 0.04 },
    { a: 'thyme', b: 'saffron', c: 'hellmint', ch: 0.03 },
    { a: 'saffron', b: 'basil', c: 'coriander', ch: 0.025 },
    { a: 'hellmint', b: 'sage', c: 'nightshade', ch: 0.02 },
    { a: 'sage', b: 'ghost', c: 'mandrake', ch: 0.015 },
    { a: 'chili', b: 'nightshade', c: 'cactus', ch: 0.02 },
    { a: 'mandrake', b: 'mold', c: 'flytrap', ch: 0.02 },
    { a: 'coriander', b: 'ghost', c: 'lotus', ch: 0.006 },
  ];
  const SOILS = [
    { id: 'potting', name: 'Potting Mix', icon: '🪴', at: 1, speed: 1, eff: 1, mut: 1, mold: 1, desc: 'Plain, honest dirt. No surprises.' },
    { id: 'compost', name: 'Compost Heap', icon: '🪱', at: 10, speed: 1.6, eff: 0.75, mut: 1, mold: 2, desc: 'Kitchen scraps and worms. Plants grow fast, work less, and mold loves it.' },
    { id: 'ash', name: 'Volcanic Ash', icon: '🌋', at: 30, speed: 0.5, eff: 1.3, mut: 1, mold: 0.5, desc: 'Scooped from the Volcano Kitchen. Slow growth, strong plants.' },
    { id: 'charcoal', name: 'Charcoal Bed', icon: '🌑', at: 60, speed: 1, eff: 0.4, mut: 3, mold: 1, desc: 'Leftover grill coals. Weak plants, but they crossbreed like crazy.' },
  ];
  const SOIL = Object.fromEntries(SOILS.map(s => [s.id, s]));
  const GRID_AT = [[150, 5], [75, 4], [25, 3], [1, 2]];
  const MOLD_SPAWN = 0.002, MOLD_SPREAD = 0.025;

  const st = () => extState(ID);
  const unlocked = () => own('bench') >= 1 && S.bestStage >= 6;
  const side = () => { const n = own('bench'); for (const [at, s] of GRID_AT) if (n >= at) return s; return 2; };
  const active = (i, n = side()) => (i % W) < n && Math.floor(i / W) < n;
  const soil = (o = st()) => SOIL[o.soil] || SOILS[0];
  const ripe = c => !!c && !!P[c.p] && c.age >= P[c.p].grow;
  const prodMin = () => { const g = baseGps(); return isFinite(g) && g > 0 ? g * 60 : 0; };
  const seedCost = p => { const c = Math.max(1000 * p.seed, prodMin() * p.seed); return isFinite(c) ? c : 1e300; };
  function neighbours(i, n = side()) {
    const x = i % W, y = Math.floor(i / W), r = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < n && ny < n) r.push(ny * W + nx);
    }
    return r;
  }

  const checked = new WeakSet();
  function ensure() {
    const o = st();
    if (checked.has(o)) return o;
    checked.add(o);
    if (!Array.isArray(o.plots) || o.plots.length !== W * W) o.plots = Array(W * W).fill(null);
    o.plots = o.plots.map(c => (c && P[c.p] && isFinite(+c.age) ? { p: c.p, age: Math.max(0, +c.age) } : null));
    if (!o.disc || typeof o.disc !== 'object') o.disc = {};
    PLANTS.forEach(p => { if (p.starter) o.disc[p.id] = 1; });
    if (!SOIL[o.soil]) o.soil = 'potting';
    ['soilAt', 'last', 'harv', 'muts', 'glut', 'glutAt', 'payTot'].forEach(k => { if (!isFinite(+o[k])) o[k] = 0; else o[k] = +o[k]; });
    if (!o.flags || typeof o.flags !== 'object') o.flags = {};
    return o;
  }

  // Passive multipliers, cached briefly: gps() is called many times per frame.
  let cache = null;
  function sums(o = st()) {
    const n = side(), e = soil(o).eff, s = {};
    KEYS.forEach(k => { s[k] = 0; });
    (o.plots || []).forEach((c, i) => {
      if (!active(i, n) || !ripe(c)) return;
      const p = P[c.p];
      let m = e;
      neighbours(i, n).forEach(j => { const d = o.plots[j]; if (ripe(d) && P[d.p].aura) m *= 1 + P[d.p].aura; });
      for (const k in p.fx) s[k] += p.fx[k] * (p.weed ? 1 : m);
    });
    KEYS.forEach(k => { s[k] = Math.min(CAP[k][1], Math.max(CAP[k][0], s[k])); if (!isFinite(s[k])) s[k] = 0; });
    return s;
  }
  function mults() {
    const now = Date.now();
    if (cache && now - cache.at < 500) return cache.m;
    const m = {}, s = sums();
    KEYS.forEach(k => { m[k] = 1 + s[k]; if (!isFinite(m[k]) || m[k] <= 0) m[k] = 1; });
    cache = { at: now, m };
    return m;
  }
  const dirty = () => { cache = null; };

  const say = h => { if (typeof toast === 'function') toast(h); };
  function discover(o, id) {
    if (o.disc[id]) return;
    o.disc[id] = 1;
    say(`📖 New entry in the Seed Ledger: ${P[id].icon} <b>${P[id].name}</b>. You can now buy its seeds.`);
  }

  // One growth tick for the whole box.
  function growTick(o, quiet) {
    const n = side(), so = soil(o);
    o.plots.forEach((c, i) => {
      if (!c || !active(i, n)) return;
      const p = P[c.p], was = ripe(c);
      c.age += so.speed;
      if (!was && ripe(c)) discover(o, c.p);
      if (c.age >= p.grow + p.life) o.plots[i] = null; // withered away
    });
    const mutSeen = [];
    o.plots.forEach((c, i) => {
      if (c || !active(i, n)) return;
      const nb = neighbours(i, n).map(j => o.plots[j]).filter(ripe), cnt = {};
      nb.forEach(d => { cnt[d.p] = (cnt[d.p] || 0) + 1; });
      // Fry-traps keep their neighbourhood mold-free.
      const guarded = nb.some(d => P[d.p].guard);
      for (const r of RECIPES) {
        const ok = r.a === r.b ? cnt[r.a] >= 2 : cnt[r.a] >= 1 && cnt[r.b] >= 1;
        if (ok && Math.random() < r.ch * so.mut) {
          o.plots[i] = { p: r.c, age: 0 };
          o.muts++;
          mutSeen.push(r.c);
          return;
        }
      }
      if (guarded) return;
      const moldy = cnt.mold || 0;
      if (Math.random() < (MOLD_SPAWN + MOLD_SPREAD * moldy) * so.mold) o.plots[i] = { p: 'mold', age: 0 };
    });
    // A Venus Fry-Trap eats one adjacent mold each tick.
    o.plots.forEach((c, i) => {
      if (!active(i, n) || !ripe(c) || !P[c.p].guard) return;
      const j = neighbours(i, n).find(k => o.plots[k] && o.plots[k].p === 'mold');
      if (j != null) o.plots[j] = null;
    });
    if (!quiet && mutSeen.length) {
      const q = mutSeen.filter((v, k) => mutSeen.indexOf(v) === k).map(id => o.disc[id] ? `${P[id].icon} ${P[id].name}` : '🧬 something new').join(', ');
      say(`🧬 A crossbreed sprouted in the Herb Planter Box: <b>${q}</b>!`);
    }
  }
  function catchUp(now = Date.now()) {
    const o = ensure();
    if (!unlocked()) { o.last = now; return; }
    if (!o.last || o.last > now) o.last = now;
    let k = Math.floor((now - o.last) / TICK);
    if (k <= 0) return;
    const quiet = k > 1;
    if (k > MAX_CATCHUP) { o.last = now - MAX_CATCHUP * TICK; k = MAX_CATCHUP; }
    const before = o.muts;
    for (let t = 0; t < k; t++) growTick(o, quiet);
    o.last += k * TICK;
    if (quiet && o.muts > before) say(`🧬 While you were away, ${plural(o.muts - before, 'crossbreed')} sprouted in the planter box.`);
    dirty();
  }

  // Kitchen glut: lots of recent harvests shrink payouts (half-life 10 real minutes).
  const glutNow = (o = st(), now = Date.now()) => (o.glut || 0) * Math.pow(0.5, Math.max(0, now - (o.glutAt || now)) / GLUT_HALF);
  const glutFactor = (o = st()) => 1 / (1 + glutNow(o) / 8);
  function payout(p, o = st()) {
    if (!p.pay) return 0;
    const full = prodMin() * p.pay;
    const v = Math.min(full, Math.max(full * 0.3, (S.gains || 0) * 0.06)) * glutFactor(o);
    return isFinite(v) && v > 0 ? v : 0;
  }

  function plant(i, id) {
    const o = ensure(), p = P[id];
    if (!p || !o.disc[id] || !active(i) || o.plots[i] || !unlocked()) return false;
    const c = seedCost(p);
    if (S.gains < c) return false;
    S.gains -= c;
    o.plots[i] = { p: id, age: 0 };
    o.planted = (o.planted || 0) + 1;
    dirty();
    return true;
  }
  // Harvest a ripe plant (or clear anything with force). Returns a short result text or null.
  function harvest(i, force, batch) {
    const o = ensure(), c = o.plots[i];
    if (!c || !active(i)) return null;
    const p = P[c.p];
    if (!ripe(c)) {
      if (!force && !p.weed) return null;
      o.plots[i] = null; dirty();
      return p.weed ? 'weeded' : 'uprooted';
    }
    o.plots[i] = null;
    dirty();
    if (p.weed) { o.weeded = (o.weeded || 0) + 1; return 'weeded'; }
    o.harv++;
    o.hcount = o.hcount || {};
    o.hcount[p.id] = (o.hcount[p.id] || 0) + 1;
    if (batch) batch[p.id] = (batch[p.id] || 0) + 1;
    let out = '';
    if (p.pay) {
      const v = payout(p, o);
      const g = glutNow(o);
      o.glut = g + 1; o.glutAt = Date.now();
      if (v > 0) { earn(v); o.payTot += v; out = `+${fmt(v)} steaks`; }
    }
    if (p.buff) {
      const [type, mult, sec, name] = p.buff;
      addBuff(type, mult, sec, name);
      out += (out ? ', ' : '') + `${name} ×${mult}`;
      if (p.id === 'lotus' && R.buffs.some(b => b.name === 'Mandrake Scream')) o.flags.chorus = 1;
    }
    if (p.summon && typeof Hooks.spawnShaker === 'function' && typeof shakerStay === 'function') {
      Hooks.spawnShaker(shakerStay(), false);
      out += (out ? ', ' : '') + 'a Golden Dumpling appears';
    }
    return out || 'harvested';
  }
  function harvestAll() {
    const o = ensure(), batch = {};
    let n = 0, tot = 0;
    const g0 = S.gains;
    o.plots.forEach((c, i) => { if (ripe(c) && !P[c.p].weed && harvest(i, false, batch)) n++; });
    tot = Math.max(0, S.gains - g0);
    if ((batch.mandrake || 0) >= 4) o.flags.choir = 1;
    return { n, tot };
  }
  const clearWhere = test => { const o = ensure(); let n = 0; o.plots.forEach((c, i) => { if (c && active(i) && test(c)) { o.plots[i] = null; n++; } }); dirty(); return n; };
  function setSoil(id) {
    const o = ensure(), s = SOIL[id], now = Date.now();
    if (!s || o.soil === id || own('bench') < s.at || now - o.soilAt < SOIL_CD) return false;
    o.soil = id; o.soilAt = now; o.soilsUsed = o.soilsUsed || {}; o.soilsUsed[id] = 1;
    dirty();
    return true;
  }

  registerExt({
    id: ID,
    state: () => ({ plots: Array(W * W).fill(null), disc: { basil: 1, thyme: 1, chili: 1 }, soil: 'potting', soilAt: 0, last: 0,
      harv: 0, muts: 0, glut: 0, glutAt: 0, payTot: 0, flags: {} }),
    gps: () => mults().gps,
    click: () => mults().click,
    cost: () => mults().cost,
    shakerRate: () => mults().shakerRate,
    buffDur: () => mults().buffDur,
    slow() { catchUp(); },
    // Cook-off: the Grill Stations are sold and the box gets tipped out. The Seed Ledger stays.
    compete() { const o = ensure(); o.plots = Array(W * W).fill(null); o.last = Date.now(); o.glut = 0; dirty(); },
    tab: { label: 'Herb Garden', shown: () => unlocked() || (st().harv || 0) > 0, render, update },
    // For tests and the console.
    api: { plant, harvest, harvestAll, setSoil, catchUp, sums, payout: id => payout(P[id]), PLANTS, RECIPES },
  });

  // ---------- Achievements ----------
  const CAT = 'Herb Garden';
  const nDisc = () => PLANTS.filter(p => st().disc && st().disc[p.id]).length;
  const A = (id, name, icon, desc, test, tier, secret) => { extAch(CAT, id, name, icon, desc, test, !!secret); if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = tier; };
  A('gar_first', 'Green Thumb', '🌿', 'Harvest a ripe plant from the Herb Planter Box.', () => (st().harv || 0) >= 1, 1);
  A('gar_h50', 'Farm to Table', '🧺', 'Harvest 50 ripe plants.', () => (st().harv || 0) >= 50, 2);
  A('gar_h300', 'Herb Baron', '🌾', 'Harvest 300 ripe plants.', () => (st().harv || 0) >= 300, 4);
  A('gar_mut', 'Kitchen Frankenstein', '🧬', 'Have a crossbreed sprout in your planter box.', () => (st().muts || 0) >= 1, 1);
  A('gar_d6', 'Budding Botanist', '📖', 'Discover 6 plants in the Seed Ledger.', () => nDisc() >= 6, 2);
  A('gar_d10', 'Hell-Flora Expert', '🔬', 'Discover 10 plants in the Seed Ledger.', () => nDisc() >= 10, 3);
  A('gar_all', 'Complete Seed Ledger', '🌺', 'Discover every plant, mold included.', () => nDisc() >= PLANTS.length, 5);
  A('gar_full', 'Concrete Jungle', '🪴', 'Have every plot of a 4×4 box or bigger ripe at the same time.', () => {
    const n = side(), o = st();
    if (n < 4 || !Array.isArray(o.plots)) return false;
    for (let i = 0; i < W * W; i++) if (active(i, n) && !ripe(o.plots[i])) return false;
    return true;
  }, 4);
  A('gar_mold', 'Mold Is Also a Plant', '🦠', 'Let Charred Mold cover every plot of your planter box.', () => {
    const o = st(), n = side();
    if (!unlocked() || !Array.isArray(o.plots)) return false;
    for (let i = 0; i < W * W; i++) if (active(i, n) && !(o.plots[i] && o.plots[i].p === 'mold')) return false;
    return true;
  }, 3, true);
  A('gar_choir', 'Scream Choir', '😱', 'Harvest 4 Screaming Mandrakes at once, or bloom a Hellfire Lotus mid-scream.', () => !!(st().flags && (st().flags.choir || st().flags.chorus)), 4, true);

  // ---------- UI ----------
  let tool = 'hand', info = null;
  const pct = v => `${v > 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;
  const fxText = (fx, m = 1) => Object.entries(fx).map(([k, v]) => `${LABEL[k]} ${pct(v * m)}`).join(', ');
  const stageOf = c => { const p = P[c.p], f = c.age / p.grow; return f >= 1 ? (c.age >= p.grow + p.life * 0.8 ? 'old' : 'ripe') : f >= 0.5 ? 'leafy' : 'seedling'; };
  const STAGE_NAME = { seedling: 'Seedling', leafy: 'Leafy', ripe: 'Ripe', old: 'Wilting' };
  const tickLeft = () => Math.max(0, (st().last + TICK - Date.now()) / 1000);
  function harvestText(p) {
    const a = [];
    if (p.pay) a.push(`${p.pay} min of production (now ${fmt(payout(p))} steaks)`);
    if (p.buff) a.push(`${p.buff[3]}: ${p.buff[0] === 'gps' ? 'steaks/s' : 'cooking power'} ×${p.buff[1]} for ${p.buff[2]}s`);
    if (p.summon) a.push('summons a Golden Dumpling');
    return a.join(' + ') || 'nothing';
  }
  function plantTip(p, c) {
    const so = soil(), mins = t => fmtTime(Math.max(0, t) / so.speed * 60);
    let h = tipHead(p.icon, p.name, c ? `${STAGE_NAME[stageOf(c)]} · ${p.weed ? 'weed' : 'herb'}` : (p.weed ? 'Weed seed' : 'Seed')) + `<div>${p.desc}</div><hr>`;
    h += `<div>While ripe: ${Object.keys(p.fx).length ? fxText(p.fx, p.weed ? 1 : so.eff) : 'no passive effect'}${p.aura ? `; neighbours' effects +${p.aura * 100}%` : ''}${p.guard ? '; eats adjacent mold, blocks mold around it' : ''}</div>`;
    h += `<div>Harvest: ${p.weed ? 'nothing, just gone' : harvestText(p)}</div>`;
    h += `<div>Grows in ${mins(p.grow)}, stays ripe ${mins(p.life)} (${so.name})</div>`;
    if (c) h += `<div>${ripe(c) ? `Withers in ${mins(p.grow + p.life - c.age)}` : `Ripe in ${mins(p.grow - c.age)}`}</div>`;
    else h += tipCost(seedCost(p), 'Seed');
    return h;
  }
  function possible(i) {
    const o = st(), cnt = {};
    neighbours(i).map(j => o.plots[j]).filter(ripe).forEach(d => { cnt[d.p] = (cnt[d.p] || 0) + 1; });
    return RECIPES.filter(r => (r.a === r.b ? cnt[r.a] >= 2 : cnt[r.a] && cnt[r.b]));
  }
  function plotTip(i) {
    const o = st(), c = o.plots[i];
    if (!active(i)) return tipHead('🔒', 'Covered plot', 'Herb Planter Box') + `<div>The box grows to 3×3 at 25, 4×4 at 75 and 5×5 at 150 Grill Stations.</div>`;
    if (c) return plantTip(P[c.p], c);
    const ps = possible(i), so = soil();
    let h = tipHead('🪴', 'Empty plot', so.name);
    h += ps.length ? '<div>Possible sprouts here:</div>' + ps.map(r => `<div>${o.disc[r.c] ? `${P[r.c].icon} ${P[r.c].name}` : '🧬 ???'}: ${(r.ch * so.mut * 100).toFixed(1)}% per tick</div>`).join('')
      : '<div>No crossbreeds possible here. Put two ripe parents next to this plot (diagonals count).</div>';
    return h + (tool !== 'hand' && tool !== 'shovel' && P[tool] ? `<hr><div>Click to plant ${P[tool].icon} ${P[tool].name}.</div>` : '');
  }

  function css() {
    if (document.getElementById('ext-garden-css')) return;
    const s = el('style');
    s.id = 'ext-garden-css';
    s.textContent = `
#view-ext-garden .x-garden-wrap { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: 14px; align-items: start; }
#view-ext-garden .x-garden-box { padding: 10px; border-radius: 6px; background: linear-gradient(180deg, #5a3a22, #3d2715); border: 3px solid #2a1a0e;
  box-shadow: inset 0 0 0 2px #7a5233, inset 0 -6px 0 #2a1a0e, 0 4px 14px rgba(0,0,0,.35); }
#view-ext-garden .x-garden-grid { display: grid; gap: 6px; }
#view-ext-garden .x-garden-plot { position: relative; width: 74px; height: 74px; border-radius: 4px; cursor: pointer; padding: 0;
  border: 1px solid rgba(0,0,0,.55); box-shadow: inset 0 3px 6px rgba(0,0,0,.55); color: #f3ead8;
  background-color: var(--x-soil, #3b2a1e); background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.5px), radial-gradient(rgba(0,0,0,.3) 1px, transparent 1.5px);
  background-size: 9px 9px, 7px 7px; background-position: 0 0, 3px 4px; }
#view-ext-garden .x-garden-plot.off { display: none; }
#view-ext-garden .x-garden-plot:hover { outline: 2px solid #d4a24c; outline-offset: -2px; }
#view-ext-garden .x-garden-ring { position: absolute; inset: 5px; border-radius: 50%;
  background: conic-gradient(var(--x-ring, #d4a24c) calc(var(--p, 0) * 1%), rgba(0,0,0,.35) 0); -webkit-mask: radial-gradient(circle, transparent 56%, #000 58%); mask: radial-gradient(circle, transparent 56%, #000 58%); }
#view-ext-garden .x-garden-plot .ic { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 30px; transition: transform .2s; }
#view-ext-garden .x-garden-plot.seedling .ic { transform: scale(.5); opacity: .85; }
#view-ext-garden .x-garden-plot.leafy .ic { transform: scale(.75); }
#view-ext-garden .x-garden-plot.ripe .ic { color: #ffd27a; filter: drop-shadow(0 0 6px rgba(212, 162, 76,.8)); }
#view-ext-garden .x-garden-plot.old .ic { color: #b28a5c; filter: grayscale(.6); }
#view-ext-garden .x-garden-plot.weed .ic { color: #8fae5a; }
#view-ext-garden .x-garden-plot.ripe { --x-ring: #ffb03a; }
#view-ext-garden .x-garden-plot.old { --x-ring: #8a6a4a; }
#view-ext-garden .x-garden-plot.weed { --x-ring: #6f8f3a; }
#view-ext-garden .x-garden-plot.empty.can .ic { opacity: .18; transform: scale(.6); }
#view-ext-garden .x-garden-plot.hint { box-shadow: inset 0 0 0 2px rgba(120,220,140,.7), inset 0 3px 6px rgba(0,0,0,.55); }
#view-ext-garden .x-garden-plot small { position: absolute; left: 3px; right: 3px; bottom: 2px; font-family: var(--mono, ui-monospace, monospace); font-size: 10px; text-align: center; color: #f3ead8; text-shadow: 0 1px 2px #000; }
#view-ext-garden .x-garden-side { min-width: 0; }
#view-ext-garden .x-garden-acts { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
#view-ext-garden .x-garden-acts .btn { flex: 1 1 auto; }
#view-ext-garden .x-garden-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
#view-ext-garden button.x-garden-seed { display: flex; align-items: center; gap: 6px; padding: 5px 8px; min-width: 0; cursor: pointer; text-align: left; font: inherit;
  background: linear-gradient(180deg, #2a1d1a, #1b1416); color: #f3ead8; border: 1px solid #3a2c2c; border-radius: 4px; box-shadow: inset 0 -3px 0 rgba(212, 162, 76,.18); }
#view-ext-garden button.x-garden-seed:hover { border-color: #d4a24c; }
#view-ext-garden .x-garden-seed .ic { font-size: 20px; color: #9fd26a; flex: none; }
#view-ext-garden .x-garden-seed b { display: block; font-size: 13px; line-height: 1.1; font-stretch: 85%; color: #f3ead8; }
#view-ext-garden .x-garden-seed span.mono { display: block; font-size: 11px; color: #b9aa98; }
#view-ext-garden button.x-garden-seed.sel { border-color: #d4a24c; box-shadow: 0 0 0 2px #d4a24c, 0 0 12px rgba(212, 162, 76,.35); background: linear-gradient(180deg, #4a2a16, #2a1a12); }
#view-ext-garden .x-garden-seed.poor span.mono { color: #ff6a50; }
#view-ext-garden button.x-garden-seed.unk { cursor: default; background: repeating-linear-gradient(135deg, #1a1517 0 6px, #221b1d 6px 12px); box-shadow: none; }
#view-ext-garden .x-garden-seed.unk .ic, #view-ext-garden .x-garden-seed.unk b, #view-ext-garden .x-garden-seed.unk span.mono { color: #7a6f66; }
#view-ext-garden .x-garden-ledger { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
#view-ext-garden .x-garden-soils { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
#view-ext-garden .x-garden-soil { text-align: left; padding: 8px; font: inherit; cursor: pointer; border-radius: 4px; color: #f3ead8; border: 1px solid #2a1a0e;
  background-color: var(--x-soil); background-image: radial-gradient(rgba(255,255,255,.08) 1px, transparent 1.5px); background-size: 8px 8px; }
#view-ext-garden .x-garden-soil b { display: block; font-size: 14px; }
#view-ext-garden .x-garden-soil small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono, ui-monospace, monospace); font-size: 10.5px; color: #e8d9bd; }
#view-ext-garden .x-garden-soil.on { box-shadow: 0 0 0 2px #d4a24c, 0 0 12px rgba(212, 162, 76,.4); }
#view-ext-garden .x-garden-soil:disabled { opacity: .5; cursor: default; }
#view-ext-garden .x-garden-soil.on:disabled { opacity: 1; }
#view-ext-garden .x-garden-info { min-height: 38px; padding: 6px 8px; font-size: 13px; background: var(--chalk-2, #f3ead8); color: var(--ink, #141012);
  border-left: 4px solid #d4a24c; border-radius: 3px; }
#view-ext-garden .stat-box b.mono { font-family: var(--mono, ui-monospace, monospace); font-size: 20px; }
@media (max-width: 760px) {
  #view-ext-garden .x-garden-wrap { grid-template-columns: 1fr; }
  #view-ext-garden .x-garden-box { justify-self: center; max-width: 100%; box-sizing: border-box; }
  #view-ext-garden .x-garden-plot { width: min(62px, calc((100vw - 92px) / 5)); height: min(62px, calc((100vw - 92px) / 5)); }
  #view-ext-garden .x-garden-plot .ic { font-size: 24px; }
  #view-ext-garden .x-garden-ledger, #view-ext-garden .x-garden-soils { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}`;
    document.head.appendChild(s);
  }
  const SOIL_COL = { potting: '#3b2a1e', compost: '#2f3a1f', ash: '#3a3436', charcoal: '#1d1a1b' };

  function setInfo(h) { info = h; }
  function clickPlot(i) {
    const o = ensure(), c = o.plots[i];
    if (!active(i)) return;
    if (c) {
      const p = P[c.p];
      if (ripe(c) || p.weed || tool === 'shovel') {
        const r = harvest(i, tool === 'shovel' || p.weed);
        if (r) { setInfo(`${p.icon} <b>${p.name}</b>: ${r}.`); (r === 'weeded' || r === 'uprooted') ? sfx.sell() : sfx.chime(); }
      } else setInfo(`${p.icon} <b>${p.name}</b> is still growing. Pick the ⛏️ trowel to uproot it.`);
    } else if (P[tool]) {
      if (plant(i, tool)) { sfx.buy(); setInfo(`Planted ${P[tool].icon} <b>${P[tool].name}</b>.`); }
      else setInfo(`Not enough steaks for ${P[tool].icon} ${P[tool].name} seeds (${fmt(seedCost(P[tool]))}).`);
    } else setInfo('Pick a seed from the ledger below, then click an empty plot.');
    updateAll();
  }

  function render(v) {
    css();
    v.appendChild(el('h2', '', '🪴 Herb Planter Box'));
    v.appendChild(el('p', 'hint', 'A wooden planter bolted to your Grill Stations. Plants grow in real time, even while the kitchen is closed. Ripe plants give small bonuses; harvest them for steaks or buffs. Two ripe parents next to an empty plot (diagonals count) may crossbreed something new. Charred Mold creeps in on its own.'));
    const grid = el('div', 'comp-grid', `
      <div class="stat-box"><small>Planter box</small><b class="mono x-garden-size"></b><span class="x-garden-next"></span></div>
      <div class="stat-box"><small>🌿 Ripe bonuses</small><b class="mono x-garden-fx1"></b><span class="x-garden-fx2"></span></div>
      <div class="stat-box"><small>📦 Kitchen glut</small><b class="mono x-garden-glut"></b><span class="x-garden-tick"></span></div>`);
    v.appendChild(grid);
    bindTip(grid.children[1], () => {
      const s = sums();
      return tipHead('🌿', 'Ripe plant bonuses', soil().name) + KEYS.map(k => `<div>${LABEL[k]}: <b>${pct(s[k])}</b> (limit ${pct(k === 'cost' ? CAP[k][0] : CAP[k][1])})</div>`).join('');
    });
    bindTip(grid.children[2], () => tipHead('📦', 'Kitchen glut', 'Harvest payouts') + `<div>Every payout harvest adds 1 glut, which halves every 10 real minutes. Payouts are divided by (1 + glut/8). Payouts are also limited to the larger of 30% of their full value or 6% of your banked steaks.</div>`);
    const wrap = el('div', 'x-garden-wrap');
    const box = el('div', 'x-garden-box'), g = el('div', 'x-garden-grid');
    v.plotNodes = [];
    for (let i = 0; i < W * W; i++) {
      const n = el('button', 'x-garden-plot', '<span class="x-garden-ring"></span><span class="ic"></span><small></small>');
      n.key = null;
      n.onclick = () => clickPlot(i);
      n.addEventListener('mouseenter', () => { v.hover = i; });
      n.addEventListener('mouseleave', () => { if (v.hover === i) v.hover = null; });
      bindTip(n, () => plotTip(i));
      g.appendChild(n); v.plotNodes.push(n);
    }
    box.appendChild(g); wrap.appendChild(box);
    const sideEl = el('div', 'x-garden-side');
    const tools = el('div', 'x-garden-tools');
    v.toolNodes = {};
    [['hand', '✋', 'Hand', 'harvest ripe'], ['shovel', '⛏️', 'Trowel', 'uproot anything']].forEach(([id, ic, name, sub]) => {
      const b = el('button', 'x-garden-seed', `<span class="ic">${ic}</span><span><b>${name}</b><span class="mono">${sub}</span></span>`);
      b.onclick = () => { tool = id; update(v); };
      tools.appendChild(b); v.toolNodes[id] = b;
    });
    sideEl.appendChild(tools);
    const acts = el('div', 'x-garden-acts');
    const mk = (label, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), label); b.onclick = fn; acts.appendChild(b); return b; };
    v.harvBtn = mk('🧺 Harvest all ripe', '', () => {
      const r = harvestAll();
      if (r.n) { sfx.chime(); setInfo(`🧺 Harvested ${plural(r.n, 'plant')}${r.tot > 0 ? ` for <b>${fmt(r.tot)}</b> steaks` : ''}.`); }
      updateAll();
    });
    v.weedBtn = mk('🧹 Weed mold', 'secondary', () => { const n = clearWhere(c => P[c.p].weed); if (n) { sfx.sell(); setInfo(`🧹 Scraped out ${n} mold.`); } updateAll(); });
    mk('⛏️ Uproot all', 'secondary', () => modal('<h3>Uproot everything?</h3><p>Every plant in the planter box is pulled out. Unripe plants give nothing and seeds are not refunded.</p>', [
      { label: 'Uproot all', action: () => { clearWhere(() => true); sfx.sell(); setInfo('⛏️ The planter box is bare.'); updateAll(); } },
      { label: 'Keep them', cls: 'secondary' }]));
    sideEl.appendChild(acts);
    v.infoEl = el('div', 'x-garden-info', 'Pick a seed, then click an empty plot. Click ripe plants to harvest them.');
    sideEl.appendChild(v.infoEl);
    wrap.appendChild(sideEl);
    v.appendChild(wrap);

    v.appendChild(el('h3', '', '📖 Seed Ledger'));
    v.appendChild(el('p', 'hint', 'Seeds you know. A plant joins the ledger the first time it ripens in your box, and the ledger survives cook-offs. Seed prices scale with your production.'));
    const led = el('div', 'x-garden-ledger');
    v.seedNodes = PLANTS.map(p => {
      const b = el('button', 'x-garden-seed', `<span class="ic"></span><span><b></b><span class="mono"></span></span>`);
      b.key = null;
      b.onclick = () => { if (st().disc[p.id]) { tool = tool === p.id ? 'hand' : p.id; update(v); } };
      bindTip(b, () => {
        if (st().disc[p.id]) return plantTip(p);
        const r = RECIPES.find(x => x.c === p.id), d = st().disc;
        const hint = p.weed ? 'Shows up on its own in empty plots.' : r && d[r.a] && d[r.b] ? `Rumour has it: ${P[r.a].icon} ${P[r.a].name} next to ${P[r.b].icon} ${P[r.b].name}.` : 'Its parents are still a mystery.';
        return tipHead('❔', 'Unknown plant', 'Not discovered') + `<div>${hint}</div>`;
      });
      led.appendChild(b);
      return b;
    });
    v.appendChild(led);

    v.appendChild(el('h3', '', 'Soil'));
    v.appendChild(el('p', 'hint', 'Switching soil keeps your plants, but you can only switch once every 10 real minutes.'));
    const so = el('div', 'x-garden-soils');
    v.soilNodes = SOILS.map(s => {
      const b = el('button', 'x-garden-soil', `<b>${s.icon} ${s.name}</b><small>grow ×${s.speed} · fx ×${s.eff}</small><small>breed ×${s.mut} · mold ×${s.mold}</small><small class="x-garden-st"></small>`);
      b.style.setProperty('--x-soil', SOIL_COL[s.id]);
      b.onclick = () => { if (setSoil(s.id)) { sfx.buy(); setInfo(`${s.icon} The box is now filled with <b>${s.name}</b>.`); } updateAll(); };
      bindTip(b, () => tipHead(s.icon, s.name, `Soil · needs ${plural(s.at, 'Grill Station')}`) + `<div>${s.desc}</div>`);
      so.appendChild(b);
      return b;
    });
    v.appendChild(so);
  }

  function update(v) {
    const o = ensure(), n = side(), so = soil(o), s = sums(o);
    v.querySelector('.x-garden-size').textContent = `${n}×${n}`;
    const nx = GRID_AT.slice().reverse().find(([at]) => own('bench') < at);
    v.querySelector('.x-garden-next').textContent = nx ? `${nx[1]}×${nx[1]} at ${nx[0]} Grill Stations` : 'full size';
    const top = KEYS.filter(k => Math.abs(s[k]) > 1e-9).map(k => `${LABEL[k]} ${pct(s[k])}`);
    v.querySelector('.x-garden-fx1').textContent = top.length ? pct(s.gps) + ' steaks/s' : 'none';
    v.querySelector('.x-garden-fx2').textContent = top.filter(t => !t.startsWith('steaks/s')).join(' · ') || so.name;
    v.querySelector('.x-garden-glut').textContent = `×${glutFactor(o).toFixed(2)}`;
    v.querySelector('.x-garden-tick').textContent = unlocked() ? `next growth tick in ${Math.ceil(tickLeft())}s` : 'box needs a Grill Station';
    v.style.setProperty('--x-soil', SOIL_COL[so.id]);
    const hintSet = new Set();
    if (v.hover != null && o.plots[v.hover] && ripe(o.plots[v.hover])) neighbours(v.hover, n).forEach(j => { if (!o.plots[j] && possible(j).length) hintSet.add(j); });
    v.plotNodes[0].parentNode.style.gridTemplateColumns = `repeat(${n}, auto)`;
    v.plotNodes.forEach((node, i) => {
      const on = active(i, n), c = o.plots[i], p = c && P[c.p];
      const stg = c ? stageOf(c) : '';
      const key = !on ? 'off' : c ? c.p + stg : 'empty' + (P[tool] ? tool : '');
      if (node.key !== key) {
        node.key = key;
        node.className = 'x-garden-plot' + (!on ? ' off' : c ? ` ${stg}${p.weed ? ' weed' : ''}` : ' empty' + (P[tool] ? ' can' : ''));
        node.querySelector('.ic').innerHTML = iconize(!on ? '' : c ? (stg === 'seedling' && !p.weed ? '🌱' : p.icon) : P[tool] ? P[tool].icon : '');
      }
      node.classList.toggle('hint', hintSet.has(i));
      if (!on) return;
      const prog = !c ? 0 : ripe(c) ? (1 - (c.age - p.grow) / p.life) * 100 : c.age / p.grow * 100;
      node.style.setProperty('--p', Math.max(0, Math.min(100, prog)).toFixed(1));
      const small = node.querySelector('small');
      const txt = !c ? '' : ripe(c) ? (p.weed ? 'mold' : 'ripe') : `${Math.round(c.age / p.grow * 100)}%`;
      if (small.textContent !== txt) small.textContent = txt;
    });
    Object.entries(v.toolNodes).forEach(([id, b]) => b.classList.toggle('sel', tool === id));
    PLANTS.forEach((p, k) => {
      const b = v.seedNodes[k], known = !!o.disc[p.id], key = known ? 'k' : 'u';
      if (b.key !== key) {
        b.key = key;
        b.querySelector('.ic').innerHTML = iconize(known ? p.icon : '❔');
        b.querySelector('b').textContent = known ? p.name : '???';
      }
      b.classList.toggle('unk', !known);
      b.classList.toggle('sel', tool === p.id);
      const c = seedCost(p);
      b.classList.toggle('poor', known && S.gains < c);
      b.querySelector('.mono').textContent = known ? `${fmt(c)} steaks` : 'undiscovered';
    });
    const cd = Math.max(0, SOIL_CD - (Date.now() - o.soilAt)) / 1000;
    SOILS.forEach((x, k) => {
      const b = v.soilNodes[k], cur = o.soil === x.id, lock = own('bench') < x.at;
      b.classList.toggle('on', cur);
      b.disabled = cur || lock || cd > 0;
      const t = cur ? 'in use' : lock ? `needs ${x.at} Grill Stations` : cd > 0 ? `switch in ${fmtTime(cd)}` : 'click to switch';
      const sm = b.querySelector('.x-garden-st');
      if (sm.textContent !== t) sm.textContent = t;
    });
    const ripeN = o.plots.filter((c, i) => active(i, n) && ripe(c) && !P[c.p].weed).length;
    const moldN = o.plots.filter((c, i) => active(i, n) && c && P[c.p].weed).length;
    v.harvBtn.disabled = !ripeN;
    v.harvBtn.innerHTML = iconize(`🧺 Harvest all ripe (${ripeN})`);
    v.weedBtn.disabled = !moldN;
    if (info !== v.infoShown) { v.infoShown = info; if (info) v.infoEl.innerHTML = iconize(info); }
  }
})();
