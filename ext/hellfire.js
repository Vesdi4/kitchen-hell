'use strict';
// The Hellfire Contract: a ladder of infernal clauses signed with steaks. Each clause makes the Line Cooks and
// the whole kitchen stronger but pushes Damnation (0-3) up, and with it the chance that a Golden Dumpling
// comes out as a Charred Dumpling with a risky outcome table. Exorcism pauses Damnation for 30 real minutes;
// the Truce ends it for the run at a price. Also sets globalThis.HELL_ROACH_RATE for the cockroach module.
// NEW ICONS: '🖋️': 'quill', '🩸': 'blood', '🕊️': 'peace-dove', '🪦': 'tombstone', '💸': 'pay-money', '💔': 'broken-heart', '🌑': 'burning-embers', '🎰': 'slot-machine'
(() => {
  const ID = 'hellfire';
  const NOTARY_MS = 4 * 60000, EXORCISM_MS = 30 * 60000;
  const CHAR_CHANCE = [0, 0.33, 0.66, 0.9];
  const ROACH_RATE = [1, 1.4, 2, 3];
  const DAMN_NAME = ['Cold Kitchen', 'The Ovens Whisper', 'The Walls Sweat', 'Full Hellfire'];
  const DAMN_TEXT = [
    'The stoves are just stoves. Probably.',
    'The pilot lights hum your name. One in three dumplings comes out charred.',
    'The tiles are warm to the touch and the soup stares back. Two in three dumplings are charred.',
    'The kitchen is on fire and nobody minds. Nearly every dumpling is charred, and the cockroaches love it.',
  ];
  // cook: Line Cook multiplier, all: whole-kitchen multiplier, rate: Golden Dumpling rate, damn: Damnation after signing.
  const CLAUSES = [
    { name: 'Signed in Ketchup', icon: '🖋️', cost: 2e9, cooks: 10, cook: 1.4, all: 1, damn: 0,
      flavor: 'It is just ketchup. The Line Cooks stop blinking anyway.' },
    { name: 'Blood Oath Brigade', icon: '🩸', cost: 3e10, cooks: 20, cook: 1.2, all: 1.04, damn: 1,
      flavor: 'Every cook pricks a finger over the stockpot. The stock has never tasted better.' },
    { name: 'Collective Simmer', icon: '♨️', cost: 4e11, cooks: 30, cook: 1, all: 1.06, damn: 1,
      flavor: 'All burners on, all night, forever. Somebody in the walls is stirring.' },
    { name: 'Pact Below the Grill', icon: '🔱', cost: 6e12, cooks: 45, cook: 1.3, all: 1.06, damn: 2,
      flavor: 'You lift the grill grate and sign on the coals. They sign back.' },
    { name: 'The Ember Tithe', icon: '💸', cost: 1e14, cooks: 60, cook: 1, all: 1.08, rate: 1.1, damn: 2,
      flavor: 'One steak in ten goes down the drain to Somebody. Golden Dumplings come sniffing for the smell.' },
    { name: 'Brimstone Mise en Place', icon: '🌋', cost: 2e15, cooks: 80, cook: 1, all: 1.1, damn: 3,
      flavor: 'Every station prepped with sulfur, ash and a pinch of doom.' },
    { name: 'The Overlord Clause', icon: '😈', cost: 5e16, cooks: 100, cook: 1.15, all: 1.12, damn: 3,
      flavor: 'Small print: "the kitchen is now Hell, and you are its Chef." You sign without reading it.' },
  ];
  // Charred Dumpling outcomes (weights sum to 100).
  const CHARRED = [
    { id: 'burnt', name: 'Burnt', icon: '💸', w: 25, info: 'Lose 5% of your steaks (at most 10 min of production).' },
    { id: 'fire', name: 'Kitchen Fire', icon: '🔥', w: 23, info: 'Steaks per second ×0.5 for 60 s.' },
    { id: 'tip', name: "Devil's Tip", icon: '💰', w: 24, info: 'A big tip: 1.5× a normal Tip Jar.' },
    { id: 'overtime', name: 'Hellish Overtime', icon: '⏱️', w: 10, info: 'One random equipment type (10+ owned) boosts production by ×(1 + 0.12 per unit) for 30 s.' },
    { id: 'fingers', name: 'Brimstone Fingers', icon: '🍳', w: 8, info: 'Cooking ×111 for 10 s.' },
    { id: 'smoke', name: 'Smoke Signals', icon: '🕯️', w: 5, info: 'Another dumpling turns up within 20 s.' },
    { id: 'inferno', name: 'Inferno Rush', icon: '👹', w: 5, info: 'Steaks per second ×666 for 6 s. The jackpot.' },
  ];
  const W_TOTAL = CHARRED.reduce((a, c) => a + c.w, 0);

  const st = () => extState(ID);
  const signed = () => Math.min(CLAUSES.length, Math.max(0, +st().signed || 0));
  const unlocked = () => own('trainer') >= 10 && S.bestStage >= 5;
  const baseDamn = () => signed() ? CLAUSES[signed() - 1].damn : 0;
  const exorcised = (now = Date.now()) => (+st().exUntil || 0) > now;
  const damn = () => st().truce || exorcised() ? 0 : baseDamn();
  const charChance = () => CHAR_CHANCE[damn()] || 0;
  const safe = (v, d) => isFinite(v) && v > 0 ? v : d;
  const exorcismLen = () => EXORCISM_MS * (U.has('hf_water') ? 2 : 1);
  const exorcismCost = () => safe(Math.max(1e9, baseGps() * 600) * 2 ** Math.min(6, +st().exN || 0), 1e9);
  const truceCost = () => safe(Math.max(1e11, baseGps() * 3600) * 2 ** Math.min(4, +st().truces || 0), 1e11);
  const revokeCost = () => safe(Math.max(1e10, baseGps() * 300), 1e10);
  const TRUCE_KEEP = 0.75; // the Truce keeps only this share of each bonus
  const notaryLeft = () => Math.max(0, (+st().signedAt || 0) + NOTARY_MS - Date.now());

  // Multipliers are cached briefly: gps() is called many times per frame.
  let cache = null;
  function mults() {
    const now = Date.now();
    if (cache && now - cache.at < 250) return cache.m;
    const o = st(), n = signed(), keep = o.truce ? TRUCE_KEEP : 1;
    let cook = 1, all = 1, rate = 1;
    for (let k = 0; k < n; k++) { const c = CLAUSES[k]; cook *= c.cook; all *= c.all; rate *= c.rate || 1; }
    const soft = x => 1 + (x - 1) * keep;
    cook = soft(cook); all = soft(all); rate = soft(rate);
    let share = 0;
    if (n && own('trainer')) {
      const raw = rawGps();
      share = raw > 0 ? Math.min(1, own('trainer') * buildingBase(B_BY_ID.trainer) / raw) : 0;
    }
    const m = { gps: (1 + share * (cook - 1)) * all, rate, cook, all, share };
    if (!isFinite(m.gps) || m.gps <= 0) m.gps = 1;
    if (!isFinite(m.rate) || m.rate <= 0) m.rate = 1;
    cache = { at: now, m };
    return m;
  }
  const dirty = () => { cache = null; setRoachRate(); };
  function setRoachRate() { globalThis.HELL_ROACH_RATE = ROACH_RATE[damn()] || 1; }

  // ---------- Actions ----------
  function canSign() {
    const o = st(), n = signed(), c = CLAUSES[n];
    return !!c && unlocked() && !o.truce && own('trainer') >= c.cooks && notaryLeft() <= 0 && S.gains >= c.cost;
  }
  function sign() {
    if (!canSign()) return null;
    const o = st(), c = CLAUSES[signed()];
    S.gains -= c.cost;
    o.signed = signed() + 1;
    o.signedAt = Date.now();
    o.maxDamn = Math.max(+o.maxDamn || 0, c.damn);
    o.best = Math.max(+o.best || 0, o.signed);
    dirty();
    return c;
  }
  const canExorcise = () => !st().truce && baseDamn() > 0 && !exorcised() && S.gains >= exorcismCost();
  function exorcise() {
    if (!canExorcise()) return false;
    const o = st();
    S.gains -= exorcismCost();
    o.exUntil = Date.now() + exorcismLen();
    o.exN = (+o.exN || 0) + 1;
    o.exTotal = (+o.exTotal || 0) + 1;
    dirty();
    return true;
  }
  const canTruce = () => !st().truce && signed() >= 2 && S.gains >= truceCost();
  function truce() {
    if (!canTruce()) return false;
    const o = st();
    S.gains -= truceCost();
    o.truce = true;
    o.truces = (+o.truces || 0) + 1;
    o.truceTotal = (+o.truceTotal || 0) + 1;
    o.exUntil = 0;
    dirty();
    return true;
  }
  const canRevoke = () => !!st().truce && S.gains >= revokeCost();
  function revoke() {
    if (!canRevoke()) return false;
    const o = st();
    S.gains -= revokeCost();
    o.truce = false;
    o.revoked = (+o.revoked || 0) + 1;
    dirty();
    return true;
  }

  function charredOutcome(forced) {
    const o = st();
    o.charred = (+o.charred || 0) + 1;
    R.chain = 0; // fire breaks any Second Helping chain
    let c = forced ? CHARRED.find(x => x.id === forced) : null;
    if (!c) {
      let r = Math.random() * W_TOTAL, k = 0;
      while (k < CHARRED.length - 1 && (r -= CHARRED[k].w) >= 0) k++;
      c = CHARRED[k];
    }
    if (!o.seen || typeof o.seen !== 'object') o.seen = {};
    o.seen[c.id] = (+o.seen[c.id] || 0) + 1;
    if (c.id === 'burnt') {
      const loss = Math.max(0, Math.min(S.gains * 0.05, baseGps() * 600));
      S.gains -= loss;
      o.lost = (+o.lost || 0) + loss;
      return { title: 'Burnt!', text: `The dumpling was charcoal and so was the till: −${fmt(loss)} steaks.` };
    }
    if (c.id === 'fire') {
      addBuff('gps', 0.5, 60, 'Kitchen Fire ×0.5');
      return { title: 'Kitchen Fire!', text: 'Half the stations are busy putting themselves out: steaks per second ×0.5 for 60 seconds.' };
    }
    if (c.id === 'overtime') {
      const busy = BUILDINGS.filter(b => own(b.id) >= 10);
      if (busy.length) {
        const b = busy[Math.floor(Math.random() * busy.length)];
        const mult = 1 + Math.min(own(b.id), 150) * 0.12;
        addBuff('gps', mult, 30, `Hellish Overtime: ${b.pl} ×${fmt(mult)}`);
        return { title: `Hellish Overtime: ${b.pl}!`, text: `They work like the devil is watching (he is). Steaks per second ×${fmt(mult)} for 30 seconds.` };
      }
    }
    if (c.id === 'fingers') {
      addBuff('click', 111, 10, 'Brimstone Fingers ×111');
      return { title: 'Brimstone Fingers!', text: 'Your hands glow like coals: cooking ×111 for 10 seconds.' };
    }
    if (c.id === 'smoke') {
      R.nextShaker = clock() + 20000;
      return { title: 'Smoke Signals!', text: 'The smoke drifts out the window. Another dumpling will smell it within 20 seconds.' };
    }
    if (c.id === 'inferno') {
      if (R.buffs.some(b => b.type === 'gps' && b.mult > 1)) o.combo = true;
      addBuff('gps', 666, 6, 'Inferno Rush ×666');
      o.jackpots = (+o.jackpots || 0) + 1;
      return { title: 'INFERNO RUSH!', text: 'The whole kitchen erupts: steaks per second ×666 for 6 seconds!' };
    }
    const v = luckyAmount(1.5);
    earn(v);
    return { title: "Devil's Tip!", text: `A guest with horns and very good manners tipped +${fmt(v)} steaks.` };
  }

  // ---------- Charred dumplings on screen ----------
  // The spawn decides charred-ness once; the click passes it to the claim through claimFlag.
  let claimFlag = null, lastDamn = -1;
  function wrapSpawn() {
    const orig = Hooks.spawnShaker;
    if (!orig || orig.hfWrapped || typeof document === 'undefined') return;
    const w = function (stay, chainLink) {
      const charred = Math.random() < charChance();
      const r = orig.apply(this, arguments);
      const all = document.querySelectorAll('body > .shaker:not(.storm)');
      const s = all[all.length - 1];
      if (s && !s.hfSeen) {
        s.hfSeen = true;
        if (charred) {
          s.classList.add('charred');
          s.title = 'Charred Dumpling!';
          s.setAttribute('aria-label', 'Charred Dumpling');
          if (!s.querySelector('.x-hellfire-smoke')) s.appendChild(el('span', 'x-hellfire-smoke'));
        }
        const oc = s.onclick;
        if (oc) s.onclick = function (e) { claimFlag = charred; try { return oc.call(this, e); } finally { claimFlag = null; } };
      }
      return r;
    };
    w.hfWrapped = true;
    Hooks.spawnShaker = w;
  }

  registerExt({
    id: ID,
    state: () => ({ signed: 0, signedAt: 0, truce: false, truces: 0, exUntil: 0, exN: 0, exTotal: 0, truceTotal: 0, revoked: 0,
      charred: 0, seen: {}, jackpots: 0, combo: false, lost: 0, maxDamn: 0, best: 0 }),
    gps: () => mults().gps,
    shakerRate: () => mults().rate,
    shaker() {
      const flag = claimFlag;
      claimFlag = null;
      const ch = flag === null ? Math.random() < charChance() : flag;
      return ch ? charredOutcome() : null;
    },
    slow() {
      const o = st();
      if (!o.seen || typeof o.seen !== 'object') o.seen = {};
      const d = damn();
      if (d !== lastDamn) { lastDamn = d; dirty(); }
      if (o.exUntil && !exorcised() && !o.exNoted) {
        o.exNoted = true;
        if (typeof toast === 'function' && baseDamn() > 0 && !o.truce) toast('🕯️ <b>The exorcism wears off.</b> The ovens start whispering again.');
      }
      if (exorcised()) o.exNoted = false;
      wrapSpawn();
    },
    // A new run tears the contract up; lifetime stats stay.
    compete() { Object.assign(st(), { signed: 0, signedAt: 0, truce: false, truces: 0, exUntil: 0, exN: 0 }); dirty(); },
    tab: { label: 'Hellfire', shown: () => unlocked() || signed() > 0, render, update },
    // for tests and the console
    sign, exorcise, truce, revoke, charred: id => charredOutcome(id), damn, charChance, mults,
  });
  setRoachRate();

  // ---------- Achievements & upgrades ----------
  const CAT = 'Hellfire';
  extAch(CAT, 'hf_sign', 'Read the Small Print', '🖋️', 'Sign your first Hellfire clause.', () => (+st().best || 0) >= 1);
  extAch(CAT, 'hf_damn3', 'Full Hellfire', '🔥', 'Reach Damnation 3.', () => (+st().maxDamn || 0) >= 3);
  extAch(CAT, 'hf_all', 'Signed, Sealed, Seared', '📜', 'Sign every clause of the Hellfire Contract.', () => (+st().best || 0) >= CLAUSES.length);
  extAch(CAT, 'hf_char1', 'Well Done. Too Well Done.', '🌑', 'Catch a Charred Dumpling.', () => (+st().charred || 0) >= 1);
  extAch(CAT, 'hf_char50', 'Charcoal Connoisseur', '🌑', 'Catch 50 Charred Dumplings.', () => (+st().charred || 0) >= 50);
  extAch(CAT, 'hf_exorcise', 'Holy Water in the Fryer', '🕯️', 'Perform an exorcism.', () => (+st().exTotal || 0) >= 1);
  extAch(CAT, 'hf_truce', 'Ceasefire', '🕊️', 'Sign the Truce with the kitchen below.', () => (+st().truceTotal || 0) >= 1);
  extAch(CAT, 'hf_revoke', 'Changed My Mind', '💔', 'Tear up a Truce.', () => (+st().revoked || 0) >= 1);
  extAch(CAT, 'hf_burnt', 'Smoke Damage', '🪦', 'Get Burnt by 10 Charred Dumplings.', () => st().seen && (+st().seen.burnt || 0) >= 10);
  extAch(CAT, 'hf_666', 'Number of the Feast', '👹', 'Hit the Inferno Rush jackpot.', () => (+st().jackpots || 0) >= 1, true);
  extAch(CAT, 'hf_combo', 'Unholy Combo', '🎰', 'Hit Inferno Rush while another production boost is running.', () => !!st().combo, true);
  [['hf_sign', 1], ['hf_damn3', 3], ['hf_all', 4], ['hf_char1', 1], ['hf_char50', 3], ['hf_exorcise', 2], ['hf_truce', 2],
   ['hf_revoke', 3], ['hf_burnt', 2], ['hf_666', 4], ['hf_combo', 5]].forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });

  extUpg({ id: 'hf_water', kind: 'special', icon: '🕯️', name: 'Blessed Dish Soap', cost: 5e13,
    desc: 'Exorcisms last twice as long (60 minutes).', req: 'Perform 3 exorcisms', unlock: () => (+st().exTotal || 0) >= 3 });

  // ---------- UI ----------
  const pct = x => Math.round(x * 100) + '%';
  const clauseFx = c => [c.cook !== 1 ? `Line Cooks ×${c.cook}` : '', c.all !== 1 ? `steaks/sec +${Math.round((c.all - 1) * 100)}%` : '',
    c.rate ? `dumplings +${Math.round((c.rate - 1) * 100)}%` : ''].filter(Boolean).join(' · ');
  const flames = d => d ? '🔥'.repeat(d) : '—';
  const CSS = `
.shaker.charred { filter: drop-shadow(0 0 14px rgba(224,48,30,.95)); }
.shaker.charred .token { background: radial-gradient(circle at 35% 30%, #5a3a2c, #2a1612 50%, #0b0607);
  box-shadow: 0 0 0 3px #141012, 0 0 0 5px rgba(212, 162, 76,.55), 0 0 26px rgba(224,48,30,.9); animation: x-hellfire-ember 0.9s ease-in-out infinite alternate; }
.shaker.charred .token svg.dumpling { filter: brightness(.32) sepia(1) hue-rotate(-25deg) saturate(2.5) drop-shadow(0 0 3px #d4a24c); }
.shaker.charred .ray { background: repeating-conic-gradient(rgba(224,48,30,.9) 0 10deg, transparent 10deg 30deg); opacity: .6; }
.shaker.charred .x-hellfire-smoke { position: absolute; left: 50%; top: -6px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%;
  background: radial-gradient(circle, rgba(90,80,80,.75), transparent 70%); pointer-events: none; animation: x-hellfire-smoke 1.6s ease-out infinite; }
@keyframes x-hellfire-ember { to { box-shadow: 0 0 0 3px #141012, 0 0 0 5px rgba(255,170,60,.8), 0 0 36px rgba(176, 38, 38,1); } }
@keyframes x-hellfire-smoke { from { transform: translateY(0) scale(.6); opacity: .9; } to { transform: translateY(-34px) scale(1.8); opacity: 0; } }
#view-ext-hellfire .x-hellfire-top { display: grid; grid-template-columns: minmax(0, 300px) 1fr; gap: 12px; align-items: stretch; margin-bottom: 10px; }
#view-ext-hellfire .x-hellfire-gauge { position: relative; padding: 12px 12px 10px; background: var(--char, #141012); color: #f3ead8; border-radius: 6px;
  border: 2px solid #2b2326; box-shadow: inset 0 -6px 0 #2b2326, inset 0 0 40px rgba(224,48,30,.0); text-align: center; transition: box-shadow .6s; }
#view-ext-hellfire .x-hellfire-gauge.d1 { box-shadow: inset 0 -6px 0 #2b2326, inset 0 0 30px rgba(212, 162, 76,.18); }
#view-ext-hellfire .x-hellfire-gauge.d2 { box-shadow: inset 0 -6px 0 #2b2326, inset 0 0 40px rgba(224,48,30,.3); }
#view-ext-hellfire .x-hellfire-gauge.d3 { box-shadow: inset 0 -6px 0 #2b2326, inset 0 0 50px rgba(224,48,30,.55); border-color: #5a1a12; }
#view-ext-hellfire .x-hellfire-gauge svg { width: 100%; max-width: 260px; height: auto; display: block; margin: 0 auto; }
#view-ext-hellfire .x-hellfire-needle { transform-origin: 100px 100px; transition: transform .8s cubic-bezier(.3,1.6,.5,1); }
#view-ext-hellfire .x-hellfire-gauge.d3 .x-hellfire-needle { animation: x-hellfire-shake .25s linear infinite alternate; }
@keyframes x-hellfire-shake { to { translate: .8px -.6px; } }
#view-ext-hellfire .x-hellfire-gauge b { display: block; font-stretch: 80%; font-weight: 800; font-size: 20px; letter-spacing: .02em; color: #d4a24c; text-transform: uppercase; }
#view-ext-hellfire .x-hellfire-gauge.d3 b { color: #e0301e; text-shadow: 0 0 10px rgba(224,48,30,.7); }
#view-ext-hellfire .x-hellfire-gauge small { display: block; color: #b9aa98; font-size: 13px; line-height: 1.3; margin-top: 2px; }
#view-ext-hellfire .x-hellfire-gauge .x-hellfire-status { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #f3ead8; margin-top: 6px; }
#view-ext-hellfire .x-hellfire-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
#view-ext-hellfire .stat-box b.mono { font-family: var(--mono, ui-monospace, monospace); font-size: 22px; }
#view-ext-hellfire .x-hellfire-ladder { counter-reset: none; border-top: 2px solid #e0301e; margin-bottom: 12px; }
#view-ext-hellfire .x-hellfire-clause { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 10px 8px;
  border-bottom: 1px dashed rgba(138,144,153,.45); background: var(--paper, #f3ead8); color: var(--ink, #17171a); position: relative; }
#view-ext-hellfire .x-hellfire-clause .x-hellfire-no { font-family: var(--mono, ui-monospace, monospace); font-weight: 700; font-size: 13px; color: #6c675e; text-align: center; }
#view-ext-hellfire .x-hellfire-clause .x-hellfire-no .gi, #view-ext-hellfire .x-hellfire-clause .x-hellfire-no span:first-child { display: block; margin: 0 auto 2px; font-size: 22px; width: 24px; height: 24px; color: #e0301e; }
#view-ext-hellfire .x-hellfire-clause b { font-stretch: 80%; font-weight: 800; font-size: 16px; color: #141012; }
#view-ext-hellfire .x-hellfire-clause em { display: block; font-size: 13px; color: #6c675e; font-style: italic; line-height: 1.3; }
#view-ext-hellfire .x-hellfire-clause .mono { display: block; font-size: 12px; color: #a0281a; font-weight: 600; margin-top: 2px; }
#view-ext-hellfire .x-hellfire-clause .btn { white-space: nowrap; }
#view-ext-hellfire .x-hellfire-clause.signed { background: linear-gradient(90deg, rgba(224,48,30,.12), transparent 70%), var(--paper, #f3ead8); box-shadow: inset 4px 0 0 #e0301e; }
#view-ext-hellfire .x-hellfire-clause.signed::after { content: 'SIGNED'; position: absolute; right: 14px; top: 50%; transform: translateY(-50%) rotate(-8deg);
  font-family: var(--mono, ui-monospace, monospace); font-weight: 800; font-size: 15px; letter-spacing: .15em; color: #e0301e; border: 2px solid #e0301e; padding: 1px 8px; opacity: .85; }
#view-ext-hellfire .x-hellfire-clause.signed .btn { visibility: hidden; }
#view-ext-hellfire .x-hellfire-clause.x-hellfire-locked { opacity: .5; filter: grayscale(.6); }
#view-ext-hellfire .x-hellfire-clause.next { box-shadow: inset 4px 0 0 #d4a24c, 0 0 0 1px rgba(212, 162, 76,.5); }
#view-ext-hellfire .x-hellfire-clause.hidden-txt em, #view-ext-hellfire .x-hellfire-clause.hidden-txt b { filter: blur(3px); }
#view-ext-hellfire .x-hellfire-counter { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }
#view-ext-hellfire .x-hellfire-counter .card p { margin: 4px 0 8px; }
#view-ext-hellfire .x-hellfire-counter .card.active { box-shadow: 0 0 0 2px #d4a24c, 0 0 14px rgba(212, 162, 76,.35); }
#view-ext-hellfire .x-hellfire-counter .btn-row { display: flex; gap: 6px; flex-wrap: wrap; }
#view-ext-hellfire .x-hellfire-table { border-top: 2px solid #d4a24c; }
#view-ext-hellfire .x-hellfire-row { display: grid; grid-template-columns: minmax(0, 180px) 56px 1fr; gap: 2px 12px; padding: 7px 0; border-bottom: 1px dashed rgba(138,144,153,.45); font-size: 14px; align-items: baseline; }
#view-ext-hellfire .x-hellfire-row b { font-stretch: 80%; font-weight: 800; }
#view-ext-hellfire .x-hellfire-row .mono { font-size: 12px; color: #a0281a; }
#view-ext-hellfire .x-hellfire-row .x-hellfire-seen { grid-column: 3; font-size: 12px; color: #6c675e; }
@media (max-width: 700px) {
  #view-ext-hellfire .x-hellfire-top, #view-ext-hellfire .x-hellfire-counter { grid-template-columns: 1fr; }
  #view-ext-hellfire .x-hellfire-clause { grid-template-columns: 36px minmax(0, 1fr); }
  #view-ext-hellfire .x-hellfire-clause .btn { grid-column: 2; justify-self: start; }
  #view-ext-hellfire .x-hellfire-clause.signed .btn { display: none; }
  #view-ext-hellfire .x-hellfire-clause.signed::after { top: 8px; right: 8px; transform: rotate(-6deg); font-size: 11px; }
  #view-ext-hellfire .x-hellfire-clause.signed b { padding-right: 76px; }
  #view-ext-hellfire .x-hellfire-row { grid-template-columns: minmax(0, 1fr) 48px; }
  #view-ext-hellfire .x-hellfire-row > span:last-of-type, #view-ext-hellfire .x-hellfire-row .x-hellfire-seen { grid-column: 1 / -1; }
}`;
  function ensureCss() {
    if (document.getElementById('ext-hellfire-css')) return;
    const css = el('style');
    css.id = 'ext-hellfire-css';
    css.textContent = CSS;
    document.head.appendChild(css);
  }
  // Semicircle heat gauge: four zones, needle angle by Damnation.
  const arc = (a0, a1, r) => {
    const p = a => [100 + r * Math.cos(Math.PI * (1 - a)), 100 - r * Math.sin(Math.PI * (1 - a))].map(x => x.toFixed(1)).join(' ');
    return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
  };
  const GAUGE = `<svg viewBox="0 0 200 118" aria-hidden="true">
    <path d="${arc(0, 1, 80)}" stroke="#2b2326" stroke-width="26" fill="none"/>
    <path d="${arc(0.01, 0.24, 80)}" stroke="#6c675e" stroke-width="18" fill="none"/>
    <path d="${arc(0.26, 0.49, 80)}" stroke="#ffb03a" stroke-width="18" fill="none"/>
    <path d="${arc(0.51, 0.74, 80)}" stroke="#d4a24c" stroke-width="18" fill="none"/>
    <path d="${arc(0.76, 0.99, 80)}" stroke="#e0301e" stroke-width="18" fill="none"/>
    ${[0.25, 0.5, 0.75].map(a => `<path d="${arc(a - 0.002, a + 0.002, 80)}" stroke="#141012" stroke-width="28" fill="none"/>`).join('')}
    ${['0', 'I', 'II', 'III'].map((t, k) => { const a = Math.PI * (1 - (k * 0.25 + 0.125)); return `<text x="${(100 + 56 * Math.cos(a)).toFixed(1)}" y="${(104 - 56 * Math.sin(a)).toFixed(1)}" fill="#b9aa98" font-size="11" font-family="monospace" text-anchor="middle">${t}</text>`; }).join('')}
    <g class="x-hellfire-needle"><path d="M100 100 L96 98 L100 26 L104 98 Z" fill="#f3ead8"/><circle cx="100" cy="100" r="8" fill="#e0301e" stroke="#f3ead8" stroke-width="2"/></g>
  </svg>`;

  function render(v) {
    ensureCss();
    wrapSpawn();
    v.appendChild(el('h2', '', 'The Hellfire Contract'));
    v.appendChild(el('p', 'hint', 'Something below the kitchen wants to make a deal. Sign clauses with steaks for permanent power, but every few clauses raise Damnation, and Golden Dumplings start coming out <b>charred</b>: wild outcomes, good and very bad. Clauses need time to be notarized and the contract is torn up at every cook-off.'));
    const top = el('div', 'x-hellfire-top');
    const g = el('div', 'x-hellfire-gauge', `${GAUGE}<b class="x-hellfire-dname"></b><small class="x-hellfire-dtext"></small><div class="x-hellfire-status"></div>`);
    bindTip(g, () => tipHead('🌡️', 'Damnation', 'Set by the clauses you signed') + DAMN_NAME.map((n, k) =>
      `<div>${k === damn() ? '▶ ' : ''}<b>${k}: ${n}</b> · charred ${pct(CHAR_CHANCE[k])} · cockroaches ×${ROACH_RATE[k]}</div>`).join(''));
    top.appendChild(g);
    const stats = el('div', 'comp-grid x-hellfire-stats', `
      <div class="stat-box"><small>🌑 Charred chance</small><b class="mono x-hellfire-chance"></b><span class="x-hellfire-chance2"></span></div>
      <div class="stat-box"><small>🕯️ Exorcism</small><b class="mono x-hellfire-ex"></b><span class="x-hellfire-ex2"></span></div>
      <div class="stat-box"><small>📜 Contract bonus</small><b class="mono x-hellfire-bonus"></b><span class="x-hellfire-bonus2"></span></div>
      <div class="stat-box"><small>🌑 Charred caught</small><b class="mono x-hellfire-caught"></b><span class="x-hellfire-caught2"></span></div>`);
    bindTip(stats.children[2], () => {
      const m = mults();
      return tipHead('📜', 'Contract bonus', st().truce ? 'Truce: 75% of every bonus' : 'All signed clauses') +
        `<div>Line Cooks ×${m.cook.toFixed(2)} (they make ${pct(m.share)} of your base production)</div><div>Whole kitchen ×${m.all.toFixed(3)}</div><div>Golden Dumplings ×${m.rate.toFixed(2)} as often</div><hr><div>Total: steaks per second <b>×${m.gps.toFixed(3)}</b></div>`;
    });
    top.appendChild(stats);
    v.appendChild(top);

    v.appendChild(el('h3', '', 'The contract'));
    const lad = el('div', 'x-hellfire-ladder');
    v.clauseNodes = CLAUSES.map((c, k) => {
      const n = el('div', 'x-hellfire-clause', `<div class="x-hellfire-no">${c.icon}<span>§${k + 1}</span></div>
        <div><b>${c.name}</b><em>${c.flavor}</em><span class="mono">${clauseFx(c)} · Damnation ${flames(c.damn)}</span></div><button class="btn"></button>`);
      n.querySelector('button').onclick = () => {
        const r = sign();
        if (!r) return;
        sfx.fanfare();
        toast(`${r.icon} <b>${r.name}</b> signed. ${clauseFx(r)}.${r.damn > (k ? CLAUSES[k - 1].damn : 0) ? ` Damnation rises to <b>${r.damn}: ${DAMN_NAME[r.damn]}</b>.` : ''}`);
        updateAll();
      };
      bindTip(n, () => tipHead(c.icon, `§${k + 1} ${c.name}`, `Needs ${c.cooks} Line Cooks`) + `<div>${c.flavor}</div><hr><div>${clauseFx(c)}</div>
        <div>Damnation after signing: <b>${c.damn}</b> (${DAMN_NAME[c.damn]}, ${pct(CHAR_CHANCE[c.damn])} charred)</div><div>Price: <b>${fmt(c.cost)}</b> steaks</div>`);
      lad.appendChild(n);
      return n;
    });
    v.appendChild(lad);

    v.appendChild(el('h3', '', 'Counter-measures'));
    const cm = el('div', 'x-hellfire-counter');
    const ex = el('div', 'card x-hellfire-excard', `<div class="card-top"><span class="ic">🕯️</span><b>Kitchen Exorcism</b><span class="lv"></span></div>
      <p>A priest, a mop and a lot of holy water. Damnation drops to 0 for 30 minutes of real time (even while the game is closed). Every exorcism this run doubles the price.</p>
      <div class="bar"><i></i></div><div class="btn-row"><button class="btn"></button></div>`);
    ex.querySelector('button').onclick = () => { if (exorcise()) { sfx.chime(); toast('🕯️ <b>Exorcism!</b> The ovens go quiet. Golden Dumplings are golden again for a while.'); updateAll(); } };
    const tr = el('div', 'card x-hellfire-trcard', `<div class="card-top"><span class="ic">🕊️</span><b>The Truce</b><span class="lv"></span></div>
      <p>A permanent reversal clause: Damnation stays at 0 for the rest of the run and no new clauses can be signed. The kitchen below keeps a cut: you keep only 75% of every contract bonus. You can tear it up later for a fee.</p>
      <div class="btn-row"><button class="btn x-hellfire-trbtn"></button><button class="btn secondary x-hellfire-rvbtn"></button></div>`);
    tr.querySelector('.x-hellfire-trbtn').onclick = () => modal(`<h3>🕊️ Sign the Truce?</h3><p>Pay <b>${fmt(truceCost())}</b> steaks. No more charred dumplings this run, but all contract bonuses shrink to 75% and the ladder is frozen until you tear the Truce up.</p>`,
      [{ label: 'Sign the Truce', action: () => { if (truce()) { sfx.chime(); toast('🕊️ <b>Truce signed.</b> The kitchen cools down. Something below sighs.'); updateAll(); } } }, { label: 'Not yet', cls: 'secondary' }]);
    tr.querySelector('.x-hellfire-rvbtn').onclick = () => { if (revoke()) { sfx.buy(); toast('💔 <b>Truce torn up.</b> The pilot lights flare back to life.'); updateAll(); } };
    cm.appendChild(ex); cm.appendChild(tr);
    v.appendChild(cm);

    v.appendChild(el('h3', '', 'What a Charred Dumpling can do'));
    const tb = el('div', 'x-hellfire-table');
    v.rowNodes = CHARRED.map(c => {
      const r = el('div', 'x-hellfire-row', `<b>${c.icon} ${c.name}</b><span class="mono">${c.w}%</span><span>${c.info}</span><span class="x-hellfire-seen"></span>`);
      tb.appendChild(r);
      return r;
    });
    v.appendChild(tb);
  }

  function update(v) {
    const o = st(), now = Date.now(), n = signed(), d = damn(), bd = baseDamn(), m = mults();
    const g = v.querySelector('.x-hellfire-gauge');
    g.className = 'x-hellfire-gauge d' + d;
    const ang = (d * 0.25 + 0.125 - 0.5) * 180 + (d === 3 ? 6 : 0);
    v.querySelector('.x-hellfire-needle').style.transform = `rotate(${ang}deg)`;
    v.querySelector('.x-hellfire-dname').textContent = `${d}: ${DAMN_NAME[d]}`;
    v.querySelector('.x-hellfire-dtext').textContent = DAMN_TEXT[d];
    v.querySelector('.x-hellfire-status').textContent = o.truce ? `Truce in force (contract level ${bd})` : exorcised(now) ? `Exorcised · level ${bd} returns in ${fmtTime((o.exUntil - now) / 1000)}` : n ? `${n}/${CLAUSES.length} clauses signed` : 'No clauses signed yet';

    v.querySelector('.x-hellfire-chance').textContent = pct(charChance());
    v.querySelector('.x-hellfire-chance2').textContent = `cockroaches ×${ROACH_RATE[d]}`;
    v.querySelector('.x-hellfire-ex').textContent = exorcised(now) ? fmtTime((o.exUntil - now) / 1000) : 'off';
    v.querySelector('.x-hellfire-ex2').textContent = `${o.exN || 0} this run`;
    v.querySelector('.x-hellfire-bonus').textContent = `×${m.gps.toFixed(2)}`;
    v.querySelector('.x-hellfire-bonus2').textContent = `Line Cooks ×${m.cook.toFixed(1)}`;
    v.querySelector('.x-hellfire-caught').textContent = fmt(o.charred || 0);
    v.querySelector('.x-hellfire-caught2').textContent = `${o.jackpots || 0} jackpots · −${fmt(o.lost || 0)} burnt`;

    const left = notaryLeft();
    CLAUSES.forEach((c, k) => {
      const node = v.clauseNodes[k], btn = node.querySelector('button');
      const isSigned = k < n, isNext = k === n, far = k > n + 1;
      node.className = 'x-hellfire-clause' + (isSigned ? ' signed' : isNext ? ' next' : ' x-hellfire-locked') + (far ? ' hidden-txt' : '');
      if (isSigned) { btn.textContent = 'Signed'; btn.disabled = true; return; }
      if (!isNext) { btn.textContent = `Sign §${k} first`; btn.disabled = true; return; }
      btn.disabled = !canSign();
      btn.textContent = o.truce ? 'Frozen by the Truce' : !unlocked() ? 'Locked' : own('trainer') < c.cooks ? `Needs ${c.cooks} Line Cooks` : left > 0 ? `Notarizing · ${fmtTime(left / 1000)}` : `Sign · ${fmt(c.cost)}`;
    });

    const exc = v.querySelector('.x-hellfire-excard'), exOn = exorcised(now), exBtn = exc.querySelector('button');
    exc.classList.toggle('active', exOn);
    exc.querySelector('.lv').textContent = exOn ? fmtTime((o.exUntil - now) / 1000) + ' left' : `${o.exTotal || 0} total`;
    exc.querySelector('i').style.width = exOn ? Math.min(100, (o.exUntil - now) / exorcismLen() * 100) + '%' : '0%';
    exBtn.textContent = o.truce ? 'Not needed (Truce)' : bd === 0 ? 'Nothing to exorcise' : exOn ? 'Exorcism running' : `Exorcise · ${fmt(exorcismCost())}`;
    exBtn.disabled = !canExorcise();

    const trc = v.querySelector('.x-hellfire-trcard'), tb = trc.querySelector('.x-hellfire-trbtn'), rb = trc.querySelector('.x-hellfire-rvbtn');
    trc.classList.toggle('active', !!o.truce);
    trc.querySelector('.lv').textContent = o.truce ? 'in force' : n < 2 ? 'needs §2' : 'available';
    tb.textContent = o.truce ? 'Truce signed' : n < 2 ? 'Sign §2 first' : `Sign Truce · ${fmt(truceCost())}`;
    tb.disabled = !canTruce();
    rb.textContent = `Tear it up · ${fmt(revokeCost())}`;
    rb.style.display = o.truce ? '' : 'none';
    rb.disabled = !canRevoke();

    CHARRED.forEach((c, k) => { v.rowNodes[k].querySelector('.x-hellfire-seen').textContent = o.seen && o.seen[c.id] ? `seen ${o.seen[c.id]}×` : ''; });
  }
})();
