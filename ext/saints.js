'use strict';
// Saints of the Line: a little kitchen shrine above the pass, on the Diner (internal building id homegym).
// Three altar niches ranked Gold / Copper / Tin scale a saint's blessing AND its curse (100% / 50% / 25%).
// Moving saints costs Devotion (max 3, +1 per real hour). Saints stay enshrined through cook-offs;
// each cook-off also grants one free placement into an empty niche.
(() => {
  const ID = 'saints';
  const HOUR = 3600000, DEV_MAX = 3;
  const RANKS = [
    { id: 'gold', name: 'Gold', scale: 1 },
    { id: 'copper', name: 'Copper', scale: 0.5 },
    { id: 'tin', name: 'Tin', scale: 0.25 },
  ];
  const KEYS = ['gps', 'click', 'cost', 'shakerRate', 'buffDur'];
  const IDLE_MS = 60000, AWAY_MIN = 120, AWAY_CAP = 8 * 3600;
  const BUTCHER_WIN = 15000, TEMPO_PERIOD = 4 * HOUR, VIGIL_MAX_MIN = 20;
  const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
  const p1 = x => `${+(x * 100).toFixed(2)}%`;

  // fx(s, o) -> multipliers at rank scale s; up/down(s) -> text for that rank.
  const SAINTS = [
    { id: 'searwell', name: 'Saint Searwell', icon: '🥘', patron: 'patron of the hot pan',
      lore: 'Seared his own name into a skillet and never let it cool. Golden Dumplings find him too hot to approach.',
      fx: s => ({ click: 1 + 0.5 * s, shakerRate: 1 - 0.12 * s }),
      up: s => `Cooking power +${p1(0.5 * s)}`, down: s => `Golden Dumplings ${p1(0.12 * s)} rarer` },
    { id: 'leftovers', name: 'Our Lady of Leftovers', icon: '🫗', patron: 'patroness of tomorrow\'s lunch',
      lore: 'Nothing is wasted in her kitchen, least of all your time away. She frowns on frantic pan-flipping.',
      fx: s => ({ gps: 1 + (idle() ? 0.16 * s : 0), click: 1 - 0.35 * s }),
      up: s => `+${p1(0.16 * s)} steaks/s after a minute without cooking; coming back after 2+ min pays ${p1(0.15 * s)} of your production for the time away (up to 8 h)`,
      down: s => `Cooking power −${p1(0.35 * s)}` },
    { id: 'grease', name: 'The Grease Martyr', icon: '🪔', patron: 'martyr of the fryer vat',
      lore: 'Drowned himself in shortening so the equipment could be cheaper. Hates to see anything leave.',
      fx: s => ({ cost: 1 - 0.1 * s }),
      up: s => `Equipment −${p1(0.1 * s)} price`, down: s => `Selling refunds ${p1(0.6 * s)} less` },
    { id: 'mise', name: 'St. Mise-en-Place', icon: '🧹', patron: 'patroness of the tidy station',
      lore: 'Everything in its place, including you. A Golden Dumpling rolling across her board is unforgivable.',
      fx: s => ({ gps: 1 + 0.15 * s }),
      up: s => `Steaks per second +${p1(0.15 * s)}`, down: () => 'Walks off the shrine when you catch a Golden Dumpling' },
    { id: 'butcher', name: 'The Butcher Who Breaks', icon: '🦴', patron: 'patron of the clean cut',
      lore: 'Every carcass you break down sharpens your arm. He sells by the pound and buys back nothing cheap.',
      fx: s => ({ click: 1 + butcherBonus(s), cost: 1 + 0.04 * s }),
      up: s => `Cooking power +${p1(0.02 * s)} per equipment sold in the last 15 s (max +${p1(4 * s)})`,
      down: s => `Equipment +${p1(0.04 * s)} price` },
    { id: 'tempo', name: 'Saint Tempo', icon: '🌗', patron: 'keeper of the turning shift',
      lore: 'Lunch rush, lull, dinner rush, lull. His blessing rises and falls on a 4-hour real-time tide.',
      fx: s => ({ gps: 1 + tempoNow(s) }),
      up: s => `Steaks per second up to +${p1(0.28 * s)} at high tide`, down: s => `…and down to −${p1(0.12 * s)} at low tide` },
    { id: 'vigil', name: 'St. Vigil of the Slow Simmer', icon: '🎐', patron: 'patron of not touching it',
      lore: 'A stock left alone becomes a sauce. Keep your hands off the register and she rewards you.',
      fx: s => ({ gps: 1 + vigilBonus(s), cost: 1 + 0.06 * s }),
      up: s => `+${p1(0.015 * s)} steaks/s per real minute since your last purchase (max +${p1(0.3 * s)} at ${VIGIL_MAX_MIN} min)`,
      down: s => `Equipment +${p1(0.06 * s)} price` },
    { id: 'wanderer', name: 'The Wandering Sous', icon: '🧭', patron: 'patron of the borrowed station',
      lore: 'Never at the same station two hours running. Wherever he stands this hour, the fire burns hotter.',
      fx: s => ({ gps: wandererMult(s) }),
      up: s => `This hour's chosen equipment produces +${p1(0.8 * s)}`, down: s => `All other equipment −${p1(0.05 * s)}` },
    { id: 'porter', name: 'The Night Porter', icon: '🗝️', patron: 'keeper of the back door',
      lore: 'Locks up, mops up, keeps the ovens warm. Shoos away anything that glitters at the door.',
      fx: s => ({ gps: 1 + 0.1 * s * (isNight() ? 2 : 1), shakerRate: 1 - 0.12 * s }),
      up: s => `Steaks per second +${p1(0.1 * s)} (doubled 22:00–06:00)`, down: s => `Golden Dumplings ${p1(0.12 * s)} rarer` },
    { id: 'flame', name: 'The Flame Keeper', icon: '🔆', patron: 'tender of the pilot light',
      lore: 'Has not blinked since the restaurant opened. Every flip lands harder, the burners run a touch thin.',
      fx: s => ({ click: 1 + 0.5 * s, gps: 1 - 0.03 * s }),
      up: s => `Cooking +${p1(0.5 * s)} per click`, down: s => `Steaks per second −${p1(0.03 * s)}` },
    { id: 'lastcall', name: 'Saint Lastcall', icon: '📯', patron: 'patron of closing time',
      lore: 'Rings the bell and somehow nobody leaves. Rushes last longer, but the kitchen is already tired.',
      fx: s => ({ buffDur: 1 + 0.2 * s, gps: 1 - 0.04 * s }),
      up: s => `Buffs last +${p1(0.2 * s)} longer`, down: s => `Steaks per second −${p1(0.04 * s)}` },
    { id: 'glimmer', name: 'St. Glimmer of the Fold', icon: '🌞', patron: 'patroness of the golden pleat',
      lore: 'Folded the first dumpling out of sunlight. They come when she calls; your wrists go soft.',
      fx: s => ({ shakerRate: 1 + 0.18 * s, click: 1 - 0.15 * s }),
      up: s => `Golden Dumplings +${p1(0.18 * s)} more often`, down: s => `Cooking power −${p1(0.15 * s)}` },
  ];
  const BY_ID = Object.fromEntries(SAINTS.map(x => [x.id, x]));

  const st = () => extState(ID);
  const open = () => own('homegym') >= 1;
  function ensure(o = st()) {
    if (!Array.isArray(o.slots) || o.slots.length !== 3) o.slots = [null, null, null];
    o.slots = o.slots.map(id => (BY_ID[id] ? id : null));
    o.slots.forEach((id, i) => { if (id && o.slots.indexOf(id) !== i) o.slots[i] = null; });
    if (!isFinite(o.dev)) o.dev = DEV_MAX;
    o.dev = Math.max(0, Math.min(DEV_MAX, Math.floor(o.dev)));
    if (!isFinite(o.devAt) || o.devAt <= 0) o.devAt = Date.now();
    if (!isFinite(o.free)) o.free = 3;
    if (!isFinite(o.lastBuy) || o.lastBuy <= 0) o.lastBuy = Date.now();
    for (const k of ['tried', 'gold']) if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
    for (const k of ['spent', 'moves', 'walks', 'clawed', 'leftPaid', 'peakButcher', 'tempoPeak', 'vigilMax', 'seen'])
      if (!isFinite(o[k])) o[k] = 0;
    return o;
  }
  const rankOf = id => st().slots.indexOf(id); // -1 if not enshrined
  const scaleOf = id => { const r = open() ? rankOf(id) : -1; return r < 0 ? 0 : RANKS[r].scale; };
  const has = id => rankOf(id) >= 0;

  // ---------- Time-based helpers ----------
  const idle = () => clock() - R.lastClick >= IDLE_MS;
  const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 6; };
  const tempoWave = (now = Date.now()) => Math.sin(2 * Math.PI * (now % TEMPO_PERIOD) / TEMPO_PERIOD);
  const tempoNow = s => 0.2 * s * (0.4 + tempoWave()); // −12% .. +28% at Gold
  const vigilMin = () => Math.max(0, (Date.now() - st().lastBuy) / 60000);
  const vigilBonus = s => Math.min(0.3, 0.015 * vigilMin()) * s;
  let sales = []; // runtime: [{t, n}] recent sales for the Butcher
  function butcherBonus(s) {
    const t = clock();
    let n = 0;
    for (const x of sales) if (t - x.t < BUTCHER_WIN) n += x.n;
    return Math.min(4 * s, 0.02 * s * n);
  }
  function hashHour(h) { let x = (h * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; }
  function wandererPick() {
    const list = BUILDINGS.filter(b => own(b.id) > 0);
    if (!list.length) return null;
    return list[hashHour(Math.floor(Date.now() / HOUR)) % list.length];
  }
  function wandererShare(b) {
    const tot = rawGps();
    if (!b || !(tot > 0)) return 0;
    const sh = own(b.id) * buildingBase(b) / tot;
    return isFinite(sh) ? Math.max(0, Math.min(1, sh)) : 0;
  }
  function wandererMult(s) {
    const b = wandererPick();
    if (!b) return 1;
    const sh = wandererShare(b);
    return 1 + 0.8 * s * sh - 0.05 * s * (1 - sh);
  }

  // ---------- Multipliers (cached; gps() runs many times per frame) ----------
  let cache = null;
  const dirty = () => { cache = null; };
  function mults() {
    const now = Date.now();
    if (cache && now - cache.at < 250) return cache.m;
    const m = {};
    KEYS.forEach(k => { m[k] = 1; });
    if (open()) {
      st().slots.forEach((id, r) => {
        if (!id) return;
        const fx = BY_ID[id].fx(RANKS[r].scale);
        for (const k in fx) m[k] *= fx[k];
      });
    }
    KEYS.forEach(k => { if (!isFinite(m[k]) || m[k] <= 0) m[k] = 1; });
    cache = { at: now, m };
    return m;
  }

  // ---------- Devotion ----------
  function regen(o = st(), now = Date.now()) {
    if (o.dev >= DEV_MAX) { o.devAt = now; return; }
    if (now < o.devAt) o.devAt = now; // clock went backwards
    let n = 0;
    while (o.dev < DEV_MAX && now - o.devAt >= HOUR && n++ < 10) { o.dev++; o.devAt += HOUR; }
    if (o.dev >= DEV_MAX) o.devAt = now;
  }
  const nextDevIn = () => { const o = st(); return o.dev >= DEV_MAX ? 0 : Math.max(0, (o.devAt + HOUR - Date.now()) / 1000); };
  // What a placement would cost: 'free', 'dev' or null (not possible).
  function placeCost(id, slot) {
    const o = st();
    if (!open() || !BY_ID[id] || !(slot >= 0 && slot < 3) || o.slots[slot] === id) return null;
    if (!o.slots[slot] && !has(id) && o.free > 0) return 'free';
    return o.dev >= 1 ? 'dev' : null;
  }
  function place(id, slot) {
    const o = ensure(), how = placeCost(id, slot);
    if (!how) return false;
    regen(o);
    if (how === 'free') o.free--;
    else { if (o.dev >= DEV_MAX) o.devAt = Date.now(); o.dev--; o.spent++; }
    const from = o.slots.indexOf(id), occupant = o.slots[slot];
    if (from >= 0) o.slots[from] = occupant || null; // moving swaps the two saints
    o.slots[slot] = id;
    o.moves++;
    o.tried[id] = 1;
    if (slot === 0) o.gold[id] = 1;
    if (from >= 0 && occupant && from === 0) o.gold[occupant] = 1;
    dirty();
    return how;
  }
  function takeDown(slot) {
    const o = ensure();
    if (!o.slots[slot]) return false;
    o.slots[slot] = null;
    dirty();
    return true;
  }

  // ---------- Watching the kitchen (runtime snapshot) ----------
  let snap = null;
  function takeSnap() {
    snap = { S, owned: Object.assign({}, S.owned), total: totalOwned(), sold: S.soldTotal || 0, upg: S.upg.length, shakers: S.shakers || 0 };
  }
  function watch() {
    if (!snap || snap.S !== S) { takeSnap(); sales = []; return; }
    const o = st(), now = Date.now();
    if ((S.soldTotal || 0) > snap.sold) {
      let n = 0, claw = 0;
      const g = scaleOf('grease');
      BUILDINGS.forEach(b => {
        const d = (snap.owned[b.id] || 0) - own(b.id);
        if (d <= 0) return;
        n += d;
        if (g) claw += buildingCost(b, d, own(b.id)) * 0.3 * 0.6 * g;
      });
      if (n) sales.push({ t: clock(), n });
      if (claw > 0 && isFinite(claw)) { claw = Math.min(claw, S.gains); S.gains -= claw; o.clawed += claw; }
      dirty();
    }
    if (totalOwned() > snap.total || S.upg.length > snap.upg) { o.lastBuy = now; dirty(); }
    if ((S.shakers || 0) > snap.shakers) {
      const r = rankOf('mise');
      if (r >= 0) {
        o.slots[r] = null; o.walks++; dirty();
        if (typeof toast === 'function') toast('🧹 <b>St. Mise-en-Place</b> saw a Golden Dumpling roll across her board and walked off the shrine in disgust.');
      }
    }
    takeSnap();
  }

  function slow() {
    const o = ensure(), now = Date.now();
    regen(o, now);
    // Our Lady of Leftovers pays for the time the game was closed (or asleep in a background tab).
    const gapS = o.seen ? (now - o.seen) / 1000 : 0;
    const lo = open() ? scaleOf('leftovers') : 0;
    if (lo && gapS >= AWAY_MIN) {
      const v = baseGps() * Math.min(gapS, AWAY_CAP) * 0.15 * lo;
      if (v > 0 && isFinite(v)) {
        earn(v); o.leftPaid += v;
        if (typeof toast === 'function') toast(`🫗 <b>Our Lady of Leftovers</b> kept a plate warm while you were gone: +${fmt(v)} steaks.`);
      }
    }
    o.seen = now;
    if (open()) {
      const b = scaleOf('butcher');
      if (b) o.peakButcher = Math.max(o.peakButcher, butcherBonus(b));
      if (has('tempo') && tempoWave(now) >= 0.95) o.tempoPeak = 1;
      if (has('vigil') && vigilMin() >= VIGIL_MAX_MIN) o.vigilMax = 1;
    }
    const t = clock();
    if (sales.length) sales = sales.filter(x => t - x.t < BUTCHER_WIN);
    dirty();
  }

  registerExt({
    id: ID,
    state: () => ({ slots: [null, null, null], dev: DEV_MAX, devAt: 0, free: 3, lastBuy: 0, tried: {}, gold: {},
      spent: 0, moves: 0, walks: 0, clawed: 0, leftPaid: 0, peakButcher: 0, tempoPeak: 0, vigilMax: 0, seen: 0 }),
    gps: () => mults().gps,
    click: () => mults().click,
    cost: () => mults().cost,
    shakerRate: () => mults().shakerRate,
    buffDur: () => mults().buffDur,
    tick: () => { if (open() || snap) watch(); },
    slow,
    // Saints are loyal: they stay on the wall through a cook-off, and the new run grants one free placement.
    compete() { const o = ensure(); o.free = Math.max(o.free, 1); o.lastBuy = Date.now(); sales = []; takeSnap(); dirty(); },
    tab: { label: 'Shrine', shown: open, render, update },
    place, takeDown, // for tests and the console
  });

  // ---------- Achievements ----------
  const CAT = 'Shrine';
  const slotted = () => st().slots.filter(Boolean).length;
  extAch(CAT, 'shr_first', 'First Candle', '😇', 'Enshrine your first saint above the pass.', () => (st().moves || 0) >= 1);
  extAch(CAT, 'shr_full', 'Full Altar', '🛐', 'Fill all three niches of the shrine.', () => slotted() >= 3);
  extAch(CAT, 'shr_pilgrim', 'Pilgrim of the Pass', '📿', 'Spend 15 Devotion.', () => (st().spent || 0) >= 15);
  extAch(CAT, 'shr_all', 'Litany of the Line', '⛩️', 'Enshrine every saint at least once.', () => SAINTS.every(x => st().tried && st().tried[x.id]));
  extAch(CAT, 'shr_gold', 'Hall of Gold', '👑', 'Seat 6 different saints in the Gold niche.', () => Object.keys(st().gold || {}).length >= 6);
  extAch(CAT, 'shr_butcher', 'Wholesale Slaughter', '🦴', 'Push the Butcher\'s blessing to +100% cooking power.', () => (st().peakButcher || 0) >= 1);
  extAch(CAT, 'shr_vigil', 'Hands Off the Register', '🎐', `Max out St. Vigil's blessing (${VIGIL_MAX_MIN} minutes without buying).`, () => !!st().vigilMax);
  extAch(CAT, 'shr_tempo', 'High Tide', '🌗', 'Have Saint Tempo enshrined at the top of his tide.', () => !!st().tempoPeak);
  extAch(CAT, 'shr_left', 'Back for Seconds', '🫗', 'Come back to a plate kept warm by Our Lady of Leftovers.', () => (st().leftPaid || 0) > 0);
  extAch(CAT, 'shr_mise', 'Clean Break', '🧹', 'Have St. Mise-en-Place walk off the shrine.', () => (st().walks || 0) >= 1, true);
  extAch(CAT, 'shr_trinity', 'Unholy Trinity', '🔱', 'Enshrine the Butcher, the Grease Martyr and Saint Searwell at the same time.',
    () => ['butcher', 'grease', 'searwell'].every(has), true);
  [['shr_first', 1], ['shr_full', 1], ['shr_pilgrim', 3], ['shr_all', 4], ['shr_gold', 3], ['shr_butcher', 3],
   ['shr_vigil', 2], ['shr_tempo', 3], ['shr_left', 2], ['shr_mise', 2], ['shr_trinity', 4]]
    .forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });

  // ---------- UI ----------
  let sel = null; // selected saint id in the roster
  const rankTable = x => RANKS.map(r => `<div class="x-saints-tr ${r.id}"><b>${r.name}</b><span>▲ ${x.up(r.scale)}</span><span>▼ ${x.down(r.scale)}</span></div>`).join('');
  function saintTip(x) {
    const r = rankOf(x.id);
    let h = tipHead(x.icon, x.name, x.patron) + `<div>${x.lore}</div><hr>` + rankTable(x);
    if (x.id === 'wanderer') { const b = wandererPick(); h += `<hr><div>This hour: ${b ? `${b.icon} <b>${b.name}</b> (${p1(wandererShare(b))} of your production)` : 'no equipment yet'}.</div>`; }
    if (x.id === 'tempo') h += `<hr><div>Tide right now: ${(tempoWave() * 100).toFixed(0)}% (${tempoWave() >= 0 ? 'rising high' : 'ebbing'}).</div>`;
    if (x.id === 'vigil') h += `<hr><div>Last purchase ${fmtTime(vigilMin() * 60)} ago.</div>`;
    h += `<hr><div>${r >= 0 ? `Enshrined in the <b>${RANKS[r].name}</b> niche.` : 'Not enshrined. Select, then click a niche.'}</div>`;
    return h;
  }
  const costLabel = how => how === 'free' ? 'free' : how === 'dev' ? '1 🙏' : '';
  function liveNote(id, s) {
    if (id === 'butcher') return `now +${p1(butcherBonus(s))} cooking`;
    if (id === 'tempo') { const v = tempoNow(s); return `now ${v >= 0 ? '+' : '−'}${p1(Math.abs(v))} steaks/s`; }
    if (id === 'vigil') return `now +${p1(vigilBonus(s))} steaks/s`;
    if (id === 'wanderer') { const b = wandererPick(); return b ? `${b.icon} ${b.name} this hour` : 'no equipment yet'; }
    if (id === 'leftovers') return idle() ? 'idle: blessing active' : 'you are cooking: no idle bonus';
    if (id === 'porter') return isNight() ? 'night shift: doubled' : 'day shift';
    return '';
  }

  function css() {
    if (document.getElementById('ext-saints-css')) return;
    const c = el('style');
    c.id = 'ext-saints-css';
    c.textContent = `
#view-ext-saints .x-saints-wall { position: relative; padding: 18px 14px 0; margin-bottom: 10px; border-radius: 8px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 0%, rgba(212, 162, 76,.22), transparent 60%),
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(255,255,255,.035) 31px 32px),
    repeating-linear-gradient(90deg, transparent 0 31px, rgba(255,255,255,.035) 31px 32px), var(--charred, #141012);
  border: 2px solid #2b2326; box-shadow: inset 0 0 40px rgba(0,0,0,.6); }
#view-ext-saints .x-saints-shelf { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 12px; align-items: end; max-width: 760px; margin: 0 auto; }
#view-ext-saints .x-saints-niche { position: relative; cursor: pointer; text-align: center; color: var(--paper, #f3ead8);
  padding: 22px 8px 12px; min-height: 172px; border-radius: 999px 999px 4px 4px; border: 4px solid var(--rim);
  background: radial-gradient(ellipse at 50% 30%, rgba(255,160,60,.18), transparent 65%), linear-gradient(180deg, #2a1d1a, #171113);
  box-shadow: 0 0 0 2px #0c0909, inset 0 0 18px rgba(0,0,0,.7), 0 6px 14px rgba(0,0,0,.45); transition: transform .12s, box-shadow .2s; }
#view-ext-saints .x-saints-niche.gold { --rim: #d9a62e; min-height: 196px; background-color: #2a1d1a; }
#view-ext-saints .x-saints-niche.copper { --rim: #b8643a; }
#view-ext-saints .x-saints-niche.tin { --rim: #9aa1a8; }
#view-ext-saints .x-saints-niche::before { content: ''; position: absolute; inset: 4px; border-radius: inherit; pointer-events: none;
  border: 1px solid rgba(255,255,255,.12); }
#view-ext-saints .x-saints-niche .x-saints-rank { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); white-space: nowrap;
  font: 700 11px/1 var(--mono, ui-monospace, monospace); letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px;
  background: var(--rim); color: #1a1214; border-radius: 3px; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
#view-ext-saints .x-saints-niche .x-saints-big { display: block; font-size: 40px; line-height: 1; margin: 6px 0 8px; color: #ffb35c;
  filter: drop-shadow(0 0 8px rgba(212, 162, 76,.7)); }
#view-ext-saints .x-saints-niche.gold .x-saints-big { font-size: 50px; color: #ffd36b; }
#view-ext-saints .x-saints-niche b { display: block; font-stretch: 80%; font-weight: 800; font-size: 16px; line-height: 1.1; }
#view-ext-saints .x-saints-niche small { display: block; margin-top: 4px; font: 11px/1.3 var(--mono, ui-monospace, monospace); color: #c9b9a3; }
#view-ext-saints .x-saints-niche small.up { color: #ffb35c; }
#view-ext-saints .x-saints-niche small.down { color: #ff7a6a; }
#view-ext-saints .x-saints-niche.empty .x-saints-big { color: #5a4c46; filter: none; }
#view-ext-saints .x-saints-niche.empty b { color: #8f8478; }
#view-ext-saints .x-saints-niche.target { box-shadow: 0 0 0 2px #0c0909, 0 0 0 5px var(--ember, #d4a24c), 0 0 22px rgba(212, 162, 76,.6); transform: translateY(-3px); }
#view-ext-saints .x-saints-niche.target.nope { box-shadow: 0 0 0 2px #0c0909, 0 0 0 5px #5a4c46; transform: none; cursor: not-allowed; }
#view-ext-saints .x-saints-x { position: absolute; top: 10px; right: 14%; width: 22px; height: 22px; border-radius: 50%; border: 1px solid #5a4c46;
  background: #1a1214; color: #c9b9a3; font: 700 13px/18px var(--mono, monospace); cursor: pointer; padding: 0; }
#view-ext-saints .x-saints-x:hover { color: #fff; border-color: var(--fire, #e0301e); background: var(--fire, #e0301e); }
#view-ext-saints .x-saints-candles { display: flex; justify-content: center; gap: 30%; margin-top: 4px; height: 0; }
#view-ext-saints .x-saints-pass { margin: 26px -14px 0; padding: 10px 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px;
  background: linear-gradient(180deg, #c9ccd1, #8d9298 55%, #6c7177); border-top: 2px solid #e6e8eb; color: #141012; }
#view-ext-saints .x-saints-pips { display: flex; gap: 6px; align-items: center; }
#view-ext-saints .x-saints-pip { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 16px;
  background: #2b2326; color: #5a4c46; border: 2px solid #141012; }
#view-ext-saints .x-saints-pip.on { background: radial-gradient(circle, #ffd36b, #d4a24c 70%); color: #3a1608; box-shadow: 0 0 10px rgba(212, 162, 76,.8); }
#view-ext-saints .x-saints-pass .mono { font-size: 13px; font-weight: 600; }
#view-ext-saints .x-saints-pass .x-saints-free { background: #141012; color: #ffd36b; padding: 3px 8px; border-radius: 3px; font: 600 12px var(--mono, monospace); }
#view-ext-saints .x-saints-pass .x-saints-sel { margin-left: auto; font-size: 14px; font-weight: 700; }
#view-ext-saints .x-saints-roster { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
#view-ext-saints .x-saints-card { position: relative; cursor: pointer; padding: 10px 12px 10px 54px; min-height: 92px; color: #241a16;
  background: var(--paper, #f3ead8); border: 1px solid #d8c9ad; border-radius: 3px; box-shadow: 0 2px 0 #c8b693;
  background-image: repeating-linear-gradient(0deg, transparent 0 21px, rgba(120,90,60,.08) 21px 22px); transition: transform .1s, box-shadow .15s; }
#view-ext-saints .x-saints-card:hover { transform: translateY(-1px); }
#view-ext-saints .x-saints-card .ic { position: absolute; left: 10px; top: 12px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  font-size: 20px; background: #141012; color: #ffb35c; box-shadow: 0 0 0 2px #d8c9ad; }
#view-ext-saints .x-saints-card b { display: block; font-stretch: 80%; font-weight: 800; font-size: 16px; line-height: 1.1; }
#view-ext-saints .x-saints-card i { display: block; font-size: 12px; color: #7a6a58; margin-bottom: 4px; }
#view-ext-saints .x-saints-card small { display: block; font-size: 12px; line-height: 1.3; }
#view-ext-saints .x-saints-card small.up { color: #9a4a0c; }
#view-ext-saints .x-saints-card small.down { color: #b0241a; }
#view-ext-saints .x-saints-card .x-saints-where { position: absolute; top: 8px; right: 8px; font: 700 10px var(--mono, monospace); text-transform: uppercase;
  letter-spacing: .06em; padding: 2px 6px; border-radius: 2px; color: #1a1214; display: none; }
#view-ext-saints .x-saints-card.in .x-saints-where { display: block; }
#view-ext-saints .x-saints-card.in-gold .x-saints-where { background: #d9a62e; }
#view-ext-saints .x-saints-card.in-copper .x-saints-where { background: #b8643a; color: #fff; }
#view-ext-saints .x-saints-card.in-tin .x-saints-where { background: #9aa1a8; }
#view-ext-saints .x-saints-card.sel { box-shadow: 0 0 0 3px var(--ember, #d4a24c), 0 0 16px rgba(212, 162, 76,.45); transform: translateY(-2px); }
#view-ext-saints .x-saints-tr { display: grid; grid-template-columns: 58px 1fr; gap: 0 8px; padding: 3px 0; font-size: 12px; }
#view-ext-saints .x-saints-tr span { grid-column: 2; }
#tooltip .x-saints-tr { display: grid; grid-template-columns: 58px 1fr; gap: 0 8px; padding: 3px 0; font-size: 12px; }
#tooltip .x-saints-tr span { grid-column: 2; }
#tooltip .x-saints-tr b { grid-row: span 2; }
#tooltip .x-saints-tr.gold b { color: #b8860b; } #tooltip .x-saints-tr.copper b { color: #b8643a; } #tooltip .x-saints-tr.tin b { color: #7d858c; }
@media (max-width: 700px) {
  #view-ext-saints .x-saints-wall { padding: 14px 8px 0; }
  #view-ext-saints .x-saints-shelf { gap: 6px; }
  #view-ext-saints .x-saints-niche { min-height: 150px; padding: 18px 4px 14px; border-width: 3px; }
  #view-ext-saints .x-saints-niche.gold { min-height: 168px; }
  #view-ext-saints .x-saints-niche .x-saints-big { font-size: 30px; }
  #view-ext-saints .x-saints-niche.gold .x-saints-big { font-size: 38px; }
  #view-ext-saints .x-saints-niche b { font-size: 13px; }
  #view-ext-saints .x-saints-niche small { font-size: 10px; }
  #view-ext-saints .x-saints-niche small.note { display: none; }
  #view-ext-saints .x-saints-x { right: 6%; top: 6px; }
  #view-ext-saints .x-saints-pass { margin: 22px -8px 0; padding: 8px; }
  #view-ext-saints .x-saints-pass .x-saints-sel { margin-left: 0; width: 100%; }
  #view-ext-saints .x-saints-roster { grid-template-columns: 1fr; }
}`;
    document.head.appendChild(c);
  }

  // Display order Copper / Gold / Tin so the Gold niche sits in the middle, raised.
  const SHOW = [1, 0, 2];
  function render(v) {
    css();
    v.appendChild(el('h2', '', 'Saints of the Line <small>the shrine above the pass</small>'));
    v.appendChild(el('p', 'hint', 'Every Diner keeps a little shrine to the patron saints of the kitchen. Each saint blesses <b>and</b> curses: the Gold niche gives the full effect, Copper half, Tin a quarter. Moving a saint costs 1 Devotion (max 3, +1 per real hour). Taking one down is free. Saints stay on the wall through cook-offs, and each cook-off grants one free placement into an empty niche.'));
    const wall = el('div', 'x-saints-wall');
    const shelf = el('div', 'x-saints-shelf');
    v.niches = [];
    SHOW.forEach(r => {
      const n = el('div', `x-saints-niche ${RANKS[r].id}`, `<button class="x-saints-x" title="Take down">×</button><span class="x-saints-big"></span><b></b><small class="up"></small><small class="down"></small><small class="note"></small><span class="x-saints-rank">${RANKS[r].name} · ${pct(RANKS[r].scale)}</span>`);
      n.rank = r;
      n.onclick = () => {
        if (sel) {
          const how = place(sel, r);
          if (how) { toast(`${ico(BY_ID[sel].icon)} <b>${BY_ID[sel].name}</b> now watches from the ${RANKS[r].name} niche${how === 'free' ? ' (free placement)' : ''}.`); sfx.chime(); sel = null; updateAll(); }
          else toast(st().slots[r] === sel ? 'That saint is already there.' : 'No Devotion left. Wait for the candles to relight.');
        } else if (st().slots[r]) { sel = st().slots[r]; update(v); }
      };
      n.querySelector('.x-saints-x').onclick = e => { e.stopPropagation(); if (takeDown(r)) { sfx.buy(); updateAll(); } };
      bindTip(n, () => {
        const id = st().slots[r], cost = sel ? placeCost(sel, r) : null;
        let h = id ? saintTip(BY_ID[id]) : tipHead('⛩️', `${RANKS[r].name} niche`, `${pct(RANKS[r].scale)} strength`) + '<div>Empty. Select a saint below, then click here.</div>';
        if (sel && sel !== id) h += `<hr><div>Place <b>${BY_ID[sel].name}</b> here: ${cost ? costLabel(cost) : 'not possible (no Devotion)'}.</div>`;
        return h;
      });
      shelf.appendChild(n); v.niches.push(n);
    });
    wall.appendChild(shelf);
    const pass = el('div', 'x-saints-pass', `<div class="x-saints-pips"></div><span class="mono x-saints-devt"></span><span class="x-saints-free"></span><span class="x-saints-sel"></span>`);
    v.pips = [];
    for (let k = 0; k < DEV_MAX; k++) { const p = el('span', 'x-saints-pip', '🙏'); pass.firstChild.appendChild(p); v.pips.push(p); }
    bindTip(pass.firstChild, () => tipHead('🙏', 'Devotion', `${st().dev}/${DEV_MAX}`) +
      `<div>Placing or moving a saint costs 1 Devotion. One candle relights every real hour, even while the game is closed. Taking a saint down is free.</div>`);
    wall.appendChild(pass);
    v.appendChild(wall);
    v.appendChild(el('h3', '', 'The litany'));
    v.appendChild(el('p', 'hint', 'Click a saint to select it, then click a niche. Hover for the effect at every rank.'));
    const roster = el('div', 'x-saints-roster');
    v.cards = SAINTS.map(x => {
      const c = el('div', 'x-saints-card', `<span class="ic">${x.icon}</span><span class="x-saints-where"></span><b>${x.name}</b><i>${x.patron}</i><small class="up">▲ ${x.up(1)}</small><small class="down">▼ ${x.down(1)}</small>`);
      c.onclick = () => { sel = sel === x.id ? null : x.id; update(v); };
      bindTip(c, () => saintTip(x));
      roster.appendChild(c);
      return c;
    });
    v.appendChild(roster);
  }

  function update(v) {
    if (!v.niches) return;
    const o = ensure();
    regen(o);
    v.niches.forEach(n => {
      const r = n.rank, id = o.slots[r], x = id && BY_ID[id], s = RANKS[r].scale;
      const key = (id || '') + '|' + (sel || '');
      n.classList.toggle('empty', !x);
      n.classList.toggle('target', !!sel);
      n.classList.toggle('nope', !!sel && !placeCost(sel, r));
      n.querySelector('.x-saints-x').style.display = x ? '' : 'none';
      if (n.key !== key) {
        n.key = key;
        n.querySelector('.x-saints-big').innerHTML = iconize(x ? x.icon : '😇');
        n.querySelector('b').textContent = x ? x.name : 'Empty niche';
        n.querySelector('.up').innerHTML = iconize(x ? '▲ ' + x.up(s) : (sel ? `Place here: ${costLabel(placeCost(sel, r)) || 'no Devotion'}` : 'Select a saint below'));
        n.querySelector('.down').textContent = x ? '▼ ' + x.down(s) : '';
      }
      n.querySelector('.note').textContent = x ? liveNote(id, s) : '';
    });
    v.pips.forEach((p, k) => p.classList.toggle('on', k < o.dev));
    v.querySelector('.x-saints-devt').textContent = o.dev >= DEV_MAX ? `Devotion ${o.dev}/${DEV_MAX} · candles full` : `Devotion ${o.dev}/${DEV_MAX} · next in ${fmtTime(nextDevIn())}`;
    const fr = v.querySelector('.x-saints-free');
    fr.textContent = o.free > 0 ? `${o.free} free placement${o.free === 1 ? '' : 's'}` : '';
    fr.style.display = o.free > 0 ? '' : 'none';
    const sl = v.querySelector('.x-saints-sel'), sk = sel || '';
    if (sl.key !== sk) { sl.key = sk; sl.innerHTML = iconize(sel ? `Selected: ${BY_ID[sel].icon} ${BY_ID[sel].name}, click a niche` : 'Pick a saint from the litany'); }
    v.cards.forEach((c, i) => {
      const x = SAINTS[i], r = o.slots.indexOf(x.id);
      c.classList.toggle('sel', sel === x.id);
      c.classList.toggle('in', r >= 0);
      RANKS.forEach((k, j) => c.classList.toggle('in-' + k.id, r === j));
      const w = r >= 0 ? RANKS[r].name : '';
      const tag = c.querySelector('.x-saints-where');
      if (tag.textContent !== w) tag.textContent = w;
    });
  }
})();
