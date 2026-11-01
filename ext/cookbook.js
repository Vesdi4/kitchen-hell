'use strict';
// Cursed Cookbook: a recipe-spell minigame on the Molecular Kitchen. Recipes cost Ink, which seeps
// back over real time (also while the game is closed) and comes back slower the drier the book is.
// Every recipe can misfire; casting on a dry book or spamming casts makes misfires likelier.
// NEW ICONS: '🖋️': 'quill-ink', '📕': 'evil-book', '📚': 'book-pile', '✒️': 'quill', '🔮': 'crystal-ball', '💡': 'desk-lamp'
(() => {
  const ID = 'cookbook';
  const BASE_OK = 0.85, INK_CAP = 100;
  const REGEN = 1 / 1500; // fraction of max per second at the top of the curve
  const RA = 0.3, RB = 0.7; // regen speed = REGEN × (RA + RB × fill): slow when dry, ~43 min from empty to full
  const SPAM_WIN = 20000;

  const st = () => extState(ID);
  const labs = () => own('lab');
  const maxInk = () => Math.min(INK_CAP, (4 + labs() ** 0.6 + 10 * Math.log(1 + labs())) * (U.has('cb_u0') ? 1.1 : 1));
  const regenMul = () => U.has('cb_u2') ? 1.25 : 1;
  // Closed form of df/dt = k(RA + RB f), so offline time is exact and needs no ticking.
  function inkNow(o = st(), now = Date.now()) {
    const m = maxInk();
    if (m <= 0) return 0;
    if (o.ink == null || !o.at) return m;
    const f0 = Math.min(1, Math.max(0, (+o.ink || 0) / m)), dt = Math.max(0, (now - o.at) / 1000);
    const f = (f0 + RA / RB) * Math.exp(REGEN * regenMul() * RB * Math.min(dt, 1e6)) - RA / RB;
    return m * Math.min(1, Math.max(0, isFinite(f) ? f : 1));
  }
  function setInk(o, v) { o.ink = Math.max(0, Math.min(maxInk(), v)); o.at = Date.now(); }
  const regenPerSec = (o = st()) => maxInk() * REGEN * regenMul() * (RA + RB * inkNow(o) / Math.max(1e-9, maxInk()));
  function timeToFull(o = st()) {
    const m = maxInk(), f = inkNow(o) / Math.max(1e-9, m);
    if (f >= 0.9999) return 0;
    return Math.log((1 + RA / RB) / (f + RA / RB)) / (REGEN * regenMul() * RB);
  }

  let recent = []; // runtime-only cast timestamps, for the spam penalty
  const onScreen = () => typeof document === 'undefined' ? 0 : document.querySelectorAll('button.shaker:not(.storm)').length;
  const posBuffs = () => R.buffs.filter(b => b.mult > 1 && b.until > clock());
  const prodMin = m => baseGps() * 60 * m;
  const steadyMul = (o = st()) => (o.steadyUntil || 0) > Date.now() ? (+o.steadyMul || 1) : 1;
  const spamPen = () => { const t = Date.now(); recent = recent.filter(x => t - x < SPAM_WIN); return Math.min(0.2, 0.04 * recent.length); };
  const fmtPct = x => (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%';

  // fail chance for a spell right now, before paying its ink
  function failChance(sp, gamble = false) {
    const o = st(), m = maxInk(), f = m > 0 ? inkNow(o) / m : 0;
    let fail = 1 - BASE_OK - (U.has('cb_u1') ? 0.05 : 0) + Math.max(0, 0.35 - f) * 0.4 + spamPen();
    if (sp.extraFail) fail += sp.extraFail();
    fail *= steadyMul(o) * (gamble ? 2 : 1);
    return Math.min(0.95, Math.max(0.02, fail));
  }
  const cost = sp => sp.base + sp.pct * maxInk();

  const SPELLS = [
    { id: 'fold', name: 'Fortune Fold', icon: '🔮', at: 1, base: 2, pct: 0.1,
      desc: 'Pinch a wish into the dough. The next Golden Dumpling hears it.',
      good: 'The next Golden Dumpling is a Fortune Dumpling: a big tip plus a Dinner Rush.',
      bad: 'The next Golden Dumpling comes out stale and pays almost nothing.',
      cast(ok, o) { o.next = ok ? 'fortune' : 'stale'; return ok ? 'The next dumpling is blessed.' : 'The next dumpling will be stale.'; } },
    { id: 'stockpot', name: 'Bottomless Stockpot', icon: '🍲', at: 1, base: 3, pct: 0.3,
      desc: 'Stir counter-clockwise and the pot fills itself.',
      good: '20 minutes of production instantly (at most 15% of your bank).',
      bad: 'Grease fire: lose up to 6 min of production (max 5% of bank) and steaks/sec ×0.7 for 45 s.',
      cast(ok) {
        if (ok) { const v = Math.min(S.gains * 0.15, prodMin(20)) + 10; earn(v); return `+${fmt(v)} steaks.`; }
        const v = Math.min(S.gains * 0.05, prodMin(6)); S.gains -= v;
        addBuff('gps', 0.7, 45, 'Grease Fire ×0.7');
        return `Grease fire! −${fmt(v)} steaks.`;
      } },
    { id: 'spatula', name: 'Possessed Spatula', icon: '🥄', at: 3, base: 5, pct: 0.2,
      desc: 'The spatula starts flipping on its own. Try to keep up.',
      good: 'Cooking ×25 for 15 seconds.', bad: 'Butterfingers: cooking ×0.5 for 30 seconds.',
      cast(ok) {
        if (ok) { addBuff('click', 25, 15, 'Possessed Spatula ×25'); return 'Cooking ×25 for 15 s.'; }
        addBuff('click', 0.5, 30, 'Butterfingers ×0.5'); return 'Butterfingers! Cooking ×0.5.';
      } },
    { id: 'mantra', name: 'Mise en Place Mantra', icon: '🧘', at: 5, base: 5, pct: 0.15,
      desc: 'Everything in its place. Even the curses.',
      good: 'Misfire chance ×0.2 for 4 minutes.', bad: 'Shaky hands: misfire chance ×3 for 6 minutes.',
      cast(ok, o) {
        o.steadyMul = ok ? 0.2 : 3; o.steadyUntil = Date.now() + (ok ? 240000 : 360000);
        return ok ? 'Steady hands for 4 min.' : 'Shaky hands for 6 min.';
      } },
    { id: 'summon', name: 'Golden Dumpling Invocation', icon: '🥟', at: 8, base: 10, pct: 0.55,
      desc: 'Fold eight pleats, whisper the name. Something golden answers.',
      good: 'A Golden Dumpling appears right now. +10% misfire per dumpling already on screen.',
      bad: 'Soggy dough: steaks/sec ×0.5 for 40 seconds.',
      extraFail: () => 0.1 * onScreen(),
      cast(ok, o) {
        if (ok) { Hooks.spawnShaker(shakerStay()); o.summons = (o.summons || 0) + 1; return 'A Golden Dumpling appears!'; }
        addBuff('gps', 0.5, 40, 'Soggy Dough ×0.5'); return 'Soggy dough! Steaks/sec ×0.5.';
      } },
    { id: 'lamp', name: 'Heat Lamp Hex', icon: '💡', at: 12, base: 7, pct: 0.2,
      desc: 'Hold the rush under the lamp a little longer.', needBuff: true,
      good: 'Every active boost gets +20% of its duration (at most +4 min each).',
      bad: 'The bulb pops: every active boost loses 30% of its remaining time.',
      cast(ok) {
        const t = clock(), list = posBuffs();
        list.forEach(b => {
          if (ok) { b.until += Math.min(240000, 0.2 * (b.dur || 0)); b.dur = Math.max(b.dur || 0, b.until - t); }
          else b.until = t + (b.until - t) * 0.7;
        });
        return ok ? `${list.length} boost${list.length === 1 ? '' : 's'} kept warm.` : 'The bulb pops! Boosts cut short.';
      } },
    { id: 'possess', name: 'Haunted Appliances', icon: '👻', at: 15, base: 8, pct: 0.25,
      desc: 'A ghost moves into one of your machines and works triple shifts.',
      good: 'A random equipment type: steaks/sec ×(1 + 4% per unit owned, up to 200) for 40 s.',
      bad: 'Blown fuse: steaks/sec ×0.8 for 60 seconds.',
      cast(ok) {
        if (ok) {
          const list = BUILDINGS.filter(b => own(b.id) >= 1);
          if (!list.length) return 'No equipment to haunt.';
          const b = list[Math.floor(Math.random() * list.length)], m = 1 + Math.min(own(b.id), 200) * 0.04;
          addBuff('gps', m, 40, `Haunted ${b.pl} ×${fmt(m)}`);
          return `Haunted ${b.pl}: ×${fmt(m)} for 40 s.`;
        }
        addBuff('gps', 0.8, 60, 'Blown Fuse ×0.8'); return 'Blown fuse! Steaks/sec ×0.8.';
      } },
    { id: 'coupon', name: 'Cursed Coupon', icon: '🏷️', at: 20, base: 10, pct: 0.15,
      desc: 'Clip it at midnight. Suppliers will not remember why they agreed.',
      good: 'Equipment 8% cheaper for 90 seconds.', bad: 'The supplier remembers: equipment 5% pricier for 10 minutes.',
      cast(ok, o) {
        o.costMul = ok ? 0.92 : 1.05; o.costUntil = Date.now() + (ok ? 90000 : 600000);
        return ok ? 'Equipment −8% for 90 s.' : 'Equipment +5% for 10 min.';
      } },
    { id: 'starter', name: 'Feed the Starter', icon: '🥖', at: 30, base: 15, pct: 0.4, bank: 0.03,
      desc: 'Pour steaks into the old crock and listen to it bubble. Also eats 3% of your bank.',
      good: 'The starter bubbles. 1 in 5 (guaranteed by the 5th bubble) it gives a Sourdough loaf.',
      bad: 'It turns moldy and eats another 3% of your bank.',
      can: () => scoopsUnlocked() ? '' : 'Starter asleep',
      cast(ok, o) {
        if (!ok) { const v = S.gains * 0.03; S.gains -= v; return `Moldy! −${fmt(v)} steaks more.`; }
        o.pity = (o.pity || 0) + 1;
        if (Math.random() < 0.2 || o.pity >= 5) { o.pity = 0; S.scoops++; o.loaves = (o.loaves || 0) + 1; return '+1 Sourdough loaf!'; }
        return 'It bubbles happily, but no loaf yet.';
      } },
    { id: 'basket', name: 'Mystery Basket', icon: '🎲', at: 40, base: 3, pct: 0.05,
      desc: 'Open the basket and cook whatever is inside.', gamble: true,
      good: 'Casts a random other unlocked recipe for free, with double misfire chance.', bad: 'Whatever is in there decides.' },
  ];
  const SP_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));

  // '' if castable, else the reason
  function blocked(sp, free = false) {
    if (labs() < sp.at) return 'Locked';
    if (sp.can && sp.can()) return sp.can();
    if (sp.needBuff && !posBuffs().length) return 'Needs a boost';
    if (!free && cost(sp) > maxInk()) return 'Book too thin';
    if (!free && inkNow() < cost(sp)) return 'Low ink';
    return '';
  }
  function log(o, ok, sp, text) {
    o.log = [{ ok, id: sp.id, text, t: Date.now() }, ...(Array.isArray(o.log) ? o.log : [])].slice(0, 5);
  }
  function resolve(o, sp, fail) {
    const ok = Math.random() >= fail;
    if (sp.bank) S.gains -= S.gains * sp.bank;
    const text = sp.cast(ok, o);
    if (ok) { o.okSpells[sp.id] = 1; o.streak = 0; o.okStreak = (o.okStreak || 0) + 1; }
    else { o.backfires++; o.runBackfires++; o.streak = (o.streak || 0) + 1; o.okStreak = 0; }
    o.bestStreak = Math.max(o.bestStreak || 0, o.streak || 0);
    o.bestOk = Math.max(o.bestOk || 0, o.okStreak || 0);
    return { ok, text };
  }
  function cast(id) {
    const sp = SP_BY_ID[id], o = st();
    if (!sp || blocked(sp)) return null;
    const pool = sp.gamble ? SPELLS.filter(s => !s.gamble && !blocked(s, true)) : [];
    const pick = sp.gamble ? pool[Math.floor(Math.random() * pool.length)] : sp;
    const fail = pick ? failChance(pick, !!sp.gamble) : 0; // rolled on the ink before paying
    setInk(o, inkNow(o) - cost(sp));
    if (o.ink < 1) o.dry = true;
    o.casts++; o.runCasts++;
    o.bySpell[sp.id] = (o.bySpell[sp.id] || 0) + 1;
    recent.push(Date.now());
    if (!pick) { log(o, true, sp, 'The basket was empty.'); return { ok: true, text: 'The basket was empty.', sp }; }
    const res = resolve(o, pick, fail);
    let name = sp.name;
    if (sp.gamble) { name = `${sp.name} → ${pick.name}`; o.okSpells[sp.id] = 1; res.icon = pick.icon; }
    log(o, res.ok, sp, `${name}: ${res.text}`);
    return Object.assign(res, { sp, name });
  }

  registerExt({
    id: ID,
    state: () => ({ ink: null, at: 0, casts: 0, runCasts: 0, backfires: 0, runBackfires: 0, streak: 0, bestStreak: 0, okStreak: 0, bestOk: 0,
      bySpell: {}, okSpells: {}, log: [], next: '', steadyMul: 1, steadyUntil: 0, costMul: 1, costUntil: 0, summons: 0, pity: 0, loaves: 0, stale: 0, fortunes: 0, dry: false }),
    cost: () => { const o = st(); return (o.costUntil || 0) > Date.now() && isFinite(+o.costMul) && o.costMul > 0 ? +o.costMul : 1; },
    slow() {
      const o = st();
      for (const k of ['bySpell', 'okSpells']) if (!o[k] || typeof o[k] !== 'object') o[k] = {};
      if (!Array.isArray(o.log)) o.log = [];
      for (const k of ['casts', 'runCasts', 'backfires', 'runBackfires']) if (!isFinite(+o[k])) o[k] = 0;
      // Fold ink into a fresh timestamp now and then, so a shrinking book (sold labs) is clamped.
      if (o.ink != null && o.at && Date.now() - o.at > 60000) setInk(o, inkNow(o));
    },
    shaker() {
      const o = st();
      if (!o.next) return null;
      const kind = o.next;
      o.next = '';
      if (kind === 'fortune') {
        o.fortunes = (o.fortunes || 0) + 1;
        const v = luckyAmount(1.5);
        earn(v);
        addBuff('gps', 6, 70, 'Dinner Rush ×6');
        return { title: 'Fortune Dumpling!', text: `The cookbook's wish came true: +${fmt(v)} steaks and a Dinner Rush (×6 for 70 s).` };
      }
      o.stale = (o.stale || 0) + 1;
      const v = luckyAmount(0.1);
      earn(v);
      return { title: 'Stale Dumpling...', text: `Rock hard. Someone still paid +${fmt(v)} steaks for it.` };
    },
    // A new run: the book keeps its ink and history; temporary curses fade.
    compete() { const o = st(); o.runCasts = 0; o.runBackfires = 0; o.costUntil = 0; o.steadyUntil = 0; o.next = ''; recent = []; },
    tab: { label: 'Cookbook', shown: () => labs() >= 1, render, update },
    cast, ink: () => inkNow(), maxInk, // for tests and the console
  });

  // ---------- Achievements & upgrades ----------
  const CAT = 'Cookbook';
  const o0 = () => st();
  extAch(CAT, 'cb_first', 'Lick the Spoon', '📖', 'Cast your first recipe from the Cursed Cookbook.', () => (o0().casts || 0) >= 1);
  extAch(CAT, 'cb_50', 'Dog-Eared', '🖋️', 'Cast 50 recipes in total.', () => (o0().casts || 0) >= 50);
  extAch(CAT, 'cb_250', 'Chef of the Dark Arts', '📕', 'Cast 250 recipes in total.', () => (o0().casts || 0) >= 250);
  extAch(CAT, 'cb_summon', 'Takeout From Beyond', '🥟', 'Summon 10 Golden Dumplings with the cookbook.', () => (o0().summons || 0) >= 10);
  extAch(CAT, 'cb_all', 'Full Tasting Menu', '📚', 'Successfully cast every recipe at least once.', () => SPELLS.every(s => o0().okSpells && o0().okSpells[s.id]));
  extAch(CAT, 'cb_loaf', 'It Lives!', '🥖', 'Get a Sourdough loaf from Feed the Starter.', () => (o0().loaves || 0) >= 1);
  extAch(CAT, 'cb_dry', 'Bone Dry', '🕯️', 'Cast a recipe that leaves less than 1 ink in the book.', () => !!o0().dry);
  extAch(CAT, 'cb_ok10', 'Steady Ladle', '🧘', 'Cast 10 recipes in a row without a misfire.', () => (o0().bestOk || 0) >= 10);
  extAch(CAT, 'cb_curse3', 'Cursed Kitchen', '💀', 'Misfire 3 times in a row.', () => (o0().bestStreak || 0) >= 3, true);
  extAch(CAT, 'cb_stale', 'Day-Old Special', '🔮', 'Catch a Stale Dumpling.', () => (o0().stale || 0) >= 1, true);
  [['cb_first', 1], ['cb_50', 2], ['cb_250', 4], ['cb_summon', 3], ['cb_all', 4], ['cb_loaf', 3], ['cb_dry', 2], ['cb_ok10', 3], ['cb_curse3', 3], ['cb_stale', 2]]
    .forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });

  [['cb_u0', 'Grease-proof Pages', '📜', 3e14, 10, '+10% maximum ink.'],
   ['cb_u1', 'Annotated Margins', '✒️', 3e15, 40, '+5% success chance on every recipe.'],
   ['cb_u2', 'Bottomless Inkwell', '🖋️', 4e16, 100, 'Ink seeps back 25% faster.']]
    .forEach(([id, name, icon, c, n, desc]) => extUpg({
      id, kind: 'special', icon, name, cost: c, desc, req: `Cast ${n} cookbook recipes`, unlock: () => (st().casts || 0) >= n,
    }));

  // ---------- UI ----------
  const CSS = `
#view-ext-cookbook .x-cookbook-book { display: grid; grid-template-columns: minmax(220px, 250px) 1fr; gap: 10px; padding: 10px; align-items: start;
  background: radial-gradient(circle at 30% 0, #3a1f17, var(--char, #141012) 70%); border: 2px solid #3a2724; border-radius: 8px;
  box-shadow: inset 0 0 0 4px #1d1416, inset 0 -8px 0 #2b1d1c, 0 6px 18px rgba(0,0,0,.35); }
#view-ext-cookbook .x-cookbook-page { position: relative; background: var(--paper, #f3ead8); color: #241a17; border-radius: 3px; padding: 14px 14px 12px;
  background-image: repeating-linear-gradient(180deg, transparent 0 25px, rgba(140,110,80,.16) 25px 26px);
  box-shadow: inset 0 0 26px rgba(120,70,30,.28), 0 2px 0 #c9b998; }
#view-ext-cookbook .x-cookbook-page h3 { margin: 0 0 6px; font-size: 18px; color: #3b1a12; }
#view-ext-cookbook .x-cookbook-inkv { font-family: var(--mono, ui-monospace, monospace); font-size: 28px; font-weight: 700; color: #1c1214; line-height: 1.1; }
#view-ext-cookbook .x-cookbook-inkv small { font-size: 14px; color: #6d5a4e; font-weight: 500; }
#view-ext-cookbook .x-cookbook-bar { position: relative; height: 16px; margin: 6px 0 4px; background: #d9ccb2; border: 1px solid #8b7660; border-radius: 3px; }
#view-ext-cookbook .x-cookbook-bar i { position: relative; display: block; height: 100%; border-radius: 2px; transition: width .4s;
  background: linear-gradient(180deg, #3a2a3e, #120c14); box-shadow: inset 0 -3px 0 rgba(212, 162, 76,.35); }
#view-ext-cookbook .x-cookbook-bar i::after { content: ''; position: absolute; right: 6px; top: 100%; width: 5px; height: 9px;
  background: #120c14; border-radius: 0 0 4px 4px; }
#view-ext-cookbook .x-cookbook-sub { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #6d5a4e; }
#view-ext-cookbook .x-cookbook-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; margin: 10px 0; font-size: 13px; }
#view-ext-cookbook .x-cookbook-stats b { font-family: var(--mono, ui-monospace, monospace); }
#view-ext-cookbook .x-cookbook-fx { font-size: 13px; min-height: 18px; }
#view-ext-cookbook .x-cookbook-fx div { padding: 2px 0; }
#view-ext-cookbook .x-cookbook-fx .bad { color: var(--fire, #e0301e); }
#view-ext-cookbook .x-cookbook-log { list-style: none; margin: 4px 0 0; padding: 0; font-size: 12.5px; }
#view-ext-cookbook .x-cookbook-log li { padding: 4px 0 4px 8px; border-left: 3px solid #2f7d4a; border-bottom: 1px dashed #b8a586; margin-bottom: 3px; }
#view-ext-cookbook .x-cookbook-log li.bad { border-left-color: var(--fire, #e0301e); color: #7a1d12; }
#view-ext-cookbook .x-cookbook-log li.empty { border-left-color: #b8a586; color: #8a7764; font-style: italic; }
#view-ext-cookbook .x-cookbook-spells { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 8px; align-content: start; }
#view-ext-cookbook .x-cookbook-spell { display: flex; flex-direction: column; gap: 4px; padding: 10px 10px 8px; color: #241a17; border-radius: 3px;
  background: var(--paper, #f3ead8); border-top: 3px solid var(--ember, #d4a24c); box-shadow: inset 0 0 18px rgba(120,70,30,.22);
  -webkit-mask: radial-gradient(circle 4px at 50% 100%, transparent 98%, #000) 0 0 / 12px 100% repeat-x;
          mask: radial-gradient(circle 4px at 50% 100%, transparent 98%, #000) 0 0 / 12px 100% repeat-x; padding-bottom: 12px; }
#view-ext-cookbook .x-cookbook-spell .hd { display: flex; align-items: center; gap: 8px; }
#view-ext-cookbook .x-cookbook-spell .hd .ic { font-size: 22px; color: #6b1d10; }
#view-ext-cookbook .x-cookbook-spell .hd b { font-stretch: 80%; font-weight: 800; font-size: 16px; line-height: 1.1; }
#view-ext-cookbook .x-cookbook-spell .meta { display: flex; justify-content: space-between; font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #5a4a40; }
#view-ext-cookbook .x-cookbook-spell .meta .ok { color: #2f6b3f; font-weight: 600; }
#view-ext-cookbook .x-cookbook-spell .meta .ok.risky { color: var(--fire, #e0301e); }
#view-ext-cookbook .x-cookbook-spell p { margin: 0; font-size: 12.5px; line-height: 1.3; flex: 1; }
#view-ext-cookbook .x-cookbook-spell .btn { margin-top: 2px; }
#view-ext-cookbook .x-cookbook-spell.locked { filter: grayscale(.8); opacity: .55; }
#view-ext-cookbook .x-cookbook-spell.flash-ok { animation: x-cookbook-ok .7s; }
#view-ext-cookbook .x-cookbook-spell.flash-bad { animation: x-cookbook-bad .7s; }
@keyframes x-cookbook-ok { 0% { box-shadow: 0 0 0 3px #ffb03a, 0 0 22px #d4a24c; } 100% { box-shadow: inset 0 0 18px rgba(120,70,30,.22); } }
@keyframes x-cookbook-bad { 0%, 40% { box-shadow: 0 0 0 3px #e0301e, 0 0 22px #e0301e; transform: translateX(-3px); } 100% { transform: none; } }
@media (max-width: 760px) {
  #view-ext-cookbook .x-cookbook-book { grid-template-columns: 1fr; padding: 6px; }
  #view-ext-cookbook .x-cookbook-spells { grid-template-columns: 1fr 1fr; gap: 6px; }
  #view-ext-cookbook .x-cookbook-spell p { display: none; }
}
@media (max-width: 380px) { #view-ext-cookbook .x-cookbook-spells { grid-template-columns: 1fr; } }`;

  function spellTip(sp) {
    const lock = labs() < sp.at;
    let h = tipHead(sp.icon, sp.name, `Recipe · ${sp.at} Molecular Kitchen${sp.at === 1 ? '' : 's'}`) + `<div><i>${sp.desc}</i></div><hr>`;
    h += `<div>✨ <b>Success:</b> ${sp.good}</div><div>💀 <b>Misfire:</b> ${sp.bad}</div><hr>`;
    h += `<div>Cost: <b>${fmt(cost(sp))}</b> ink (${sp.base} + ${Math.round(sp.pct * 100)}% of max)${sp.bank ? ` + ${sp.bank * 100}% of your bank` : ''}</div>`;
    if (!lock) h += `<div>Misfire chance now: <b>${fmtPct(failChance(sp, false))}</b>${sp.gamble ? ' (the picked recipe rolls at double)' : ''}</div>`;
    return h + '<div class="hint">Misfires get likelier when the book is below 35% ink or you cast several recipes within 20 s.</div>';
  }

  function render(v) {
    if (!document.getElementById('ext-cookbook-css')) {
      const css = el('style'); css.id = 'ext-cookbook-css'; css.textContent = CSS; document.head.appendChild(css);
    }
    v.appendChild(el('h2', '', 'Cursed Cookbook <small>found in the Molecular Kitchen</small>'));
    v.appendChild(el('p', 'hint', 'Cook recipe-spells with ink from the cursed book. Ink seeps back over real time, even while the kitchen is closed, but slower when the book runs dry. Any recipe can misfire.'));
    const book = el('div', 'x-cookbook-book');
    const page = el('div', 'x-cookbook-page', `
      <h3>🖋️ Ink</h3>
      <div class="x-cookbook-inkv"></div>
      <div class="x-cookbook-bar"><i></i></div>
      <div class="x-cookbook-sub x-cookbook-regen"></div>
      <div class="x-cookbook-stats">
        <span>Casts this run</span><b class="x-cookbook-rc"></b>
        <span>Casts total</span><b class="x-cookbook-tc"></b>
        <span>Misfires</span><b class="x-cookbook-bf"></b>
        <span>Misfire streak</span><b class="x-cookbook-sk"></b>
      </div>
      <div class="x-cookbook-fx"></div>
      <h3 style="margin-top:10px">📜 Last casts</h3>
      <ul class="x-cookbook-log"></ul>`);
    bindTip(page.querySelector('.x-cookbook-bar'), () => tipHead('🖋️', 'Ink', 'Regenerates in real time') +
      `<div>Max ink: <b>${fmt(maxInk())}</b> (grows with Molecular Kitchens, up to ${INK_CAP}).</div><div>Seeps back at ${(regenPerSec() * 60).toFixed(2)} per minute now; the fuller the book, the faster.</div>`);
    book.appendChild(page);
    const grid = el('div', 'x-cookbook-spells');
    v.cards = SPELLS.map(sp => {
      const c = el('div', 'x-cookbook-spell', `<div class="hd"><span class="ic">${sp.icon}</span><b>${sp.name}</b></div>
        <div class="meta"><span class="cost"></span><span class="ok"></span></div><p>${sp.good}</p><button class="btn"></button>`);
      c.querySelector('button').onclick = () => {
        const r = cast(sp.id);
        if (!r) return;
        c.classList.remove('flash-ok', 'flash-bad'); void c.offsetWidth; c.classList.add(r.ok ? 'flash-ok' : 'flash-bad');
        toast(`${r.ok ? (r.icon || sp.icon) : '💀'} <b>${esc(r.name || sp.name)}</b> ${r.ok ? '' : '<b>misfired!</b> '}${esc(r.text)}`);
        if (r.ok) sfx.chime(); else sfx.sell();
        updateAll();
      };
      bindTip(c, () => spellTip(sp));
      grid.appendChild(c);
      return c;
    });
    book.appendChild(grid);
    v.appendChild(book);
    v.logKey = null;
  }

  function update(v) {
    const o = st(), ink = inkNow(o), m = maxInk(), now = Date.now();
    v.querySelector('.x-cookbook-inkv').innerHTML = `${ink.toFixed(1)} <small>/ ${m.toFixed(1)}</small>`;
    v.querySelector('.x-cookbook-bar i').style.width = (m > 0 ? ink / m * 100 : 0) + '%';
    const ttf = timeToFull(o);
    v.querySelector('.x-cookbook-regen').textContent = `+${(regenPerSec(o) * 60).toFixed(2)}/min · ${ttf > 0 ? 'full in ' + fmtTime(ttf) : 'book is full'}`;
    v.querySelector('.x-cookbook-rc').textContent = fmt(o.runCasts || 0);
    v.querySelector('.x-cookbook-tc').textContent = fmt(o.casts || 0);
    v.querySelector('.x-cookbook-bf').textContent = fmt(o.backfires || 0);
    v.querySelector('.x-cookbook-sk').textContent = String(o.streak || 0);
    const fx = [];
    if (o.next === 'fortune') fx.push('<div>🔮 Next Golden Dumpling: <b>Fortune</b></div>');
    if (o.next === 'stale') fx.push('<div class="bad">🔮 Next Golden Dumpling: <b>Stale</b></div>');
    if ((o.steadyUntil || 0) > now) fx.push(`<div${o.steadyMul > 1 ? ' class="bad"' : ''}>🧘 Misfire ×${o.steadyMul} · ${fmtTime((o.steadyUntil - now) / 1000)}</div>`);
    if ((o.costUntil || 0) > now) fx.push(`<div${o.costMul > 1 ? ' class="bad"' : ''}>🏷️ Equipment ${o.costMul < 1 ? '−' : '+'}${Math.round(Math.abs(1 - o.costMul) * 100)}% · ${fmtTime((o.costUntil - now) / 1000)}</div>`);
    const fxh = fx.join('');
    const fxn = v.querySelector('.x-cookbook-fx');
    if (fxn.dataset.h !== fxh) { fxn.dataset.h = fxh; fxn.innerHTML = iconize(fxh); }
    const lk = JSON.stringify(o.log || []);
    if (v.logKey !== lk) {
      v.logKey = lk;
      const items = (o.log || []).map(e => `<li class="${e.ok ? '' : 'bad'}">${e.ok ? '' : '💀 '}${esc(e.text)}</li>`).join('') || '<li class="empty">The pages are still blank.</li>';
      v.querySelector('.x-cookbook-log').innerHTML = iconize(items);
    }
    SPELLS.forEach((sp, k) => {
      const c = v.cards[k], lock = labs() < sp.at, why = blocked(sp), btn = c.querySelector('button');
      c.classList.toggle('locked', lock);
      c.querySelector('.cost').textContent = lock ? `needs ${sp.at} labs` : `${fmt(cost(sp))} ink`;
      const okn = c.querySelector('.ok'), p = 1 - failChance(sp, false);
      okn.textContent = lock ? '' : sp.gamble ? 'random' : `${fmtPct(p)} success`;
      okn.classList.toggle('risky', !sp.gamble && p < 0.75);
      btn.textContent = why || 'Cast';
      btn.disabled = !!why;
    });
  }
})();
