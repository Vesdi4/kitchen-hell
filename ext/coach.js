'use strict';
/* The Kitchen Demon: a little demon living in the oven. You level it by feeding it steaks or equipment.
   Higher levels unlock Pacts (equipped auras; internally "styles") and the demon barks short timed
   Demands (internally "cues"). Internal ids/state still say coach/styles/cues. */

const COACH_LEVELS = [
  { title: 'Spark in the Pilot Light' },
  { title: 'Oven Imp',                 min: 5,  floor: 2e4 },
  { title: 'Crumb Gremlin',            b: 'pushups',    n: 40 },
  { title: 'Grease Sprite',            min: 10, floor: 9e4 },
  { title: 'Pan Fiend',                b: 'dumbbells',  n: 40 },
  { title: 'Sauce Goblin',             min: 15, floor: 4e5 },
  { title: 'Microwave Poltergeist',    b: 'pullup',     n: 40 },
  { title: 'Broiler Brute',            min: 20, floor: 2e6 },
  { title: 'Fryer Horror',             b: 'kettlebell', n: 40 },
  { title: 'Grill Warlock',            min: 30, floor: 1e7 },
  { title: 'Charcoal Duke',            b: 'bench',      n: 50 },
  { title: 'Baron of the Brick Oven',  min: 45, floor: 6e7 },
  { title: 'Archfiend of Ovens',       b: 'squat',      n: 50 },
  { title: 'Lord of the Pilot Light',  min: 60, floor: 4e8 },
  { title: 'The Infernal Sous-Chef',   b: 'trainer',    n: 50 },
];
const COACH_MAX = COACH_LEVELS.length; // displayed levels run 1..15
const COACH_XP_MAX = 10, COACH_XP_OFF = 0.04; // each banked demand (satisfaction point) takes 4% off the next feeding

const capPct = (n, per, cap) => 1 + Math.min(cap, Math.floor(n / per) / 100);
const COACH_STYLES = [
  { id: 'volume',   lv: 5,  icon: '🍲', name: 'Pact of the Bottomless Pot', desc: 'Steaks per second +8%.', gps: () => 1.08 },
  { id: 'power',    lv: 5,  icon: '🗡️', name: 'Pact of the Cursed Cleaver', desc: 'Cooking power +30%.', click: () => 1.3 },
  { id: 'garage',   lv: 6,  icon: '🗑️', name: 'Pact of the Dumpster',       desc: 'Equipment is 6% cheaper. Do not ask where it came from.', cost: () => 0.94 },
  { id: 'hype',     lv: 7,  icon: '🛎️', name: 'Pact of the Order Bell',     desc: 'Golden Dumplings appear 15% more often.', shakerRate: () => 1.15 },
  { id: 'tension',  lv: 8,  icon: '🕯️', name: 'Pact of the Slow Burn',      desc: 'All buffs last 20% longer.', buffDur: () => 1.2 },
  { id: 'basics',   lv: 9,  icon: '🤸', name: 'Pact of Burnt Toast',        desc: '+1% steaks per second per 10 Burnt Toasters (up to +25%).', gps: () => capPct(own('pushups'), 10, 0.25) },
  { id: 'crew',     lv: 10, icon: '🧽', name: 'Pact of the Dish Pit',       desc: '+1% steaks per second per 4 Dishwasher Crews (up to +25%).', gps: () => capPct(own('buddy'), 4, 0.25) },
  { id: 'mind',     lv: 11, icon: '👂', name: 'Pact of Whispers',           desc: 'Demands come 40% more often and their rewards last 50% longer.' },
  { id: 'period',   lv: 12, icon: '⚖️', name: 'Pact of Balance',            desc: 'Steaks per second +5%, cooking +5%, equipment 3% cheaper.', gps: () => 1.05, click: () => 1.05, cost: () => 0.97 },
  { id: 'showtime', lv: 13, icon: '🔥', name: 'Pact of the Open Flame',     desc: 'Cooking power +60%, but steaks per second −5%. Eyebrows not included.', click: () => 1.6, gps: () => 0.95 },
  { id: 'legacy',   lv: 14, icon: '👑', name: 'Pact of the Ash Crown',      desc: '+1% steaks per second per 5 demands ever fulfilled (up to +20%).', gps: () => capPct(extState('coach').cuesDone, 5, 0.2) },
];
const STYLE_BY_ID = Object.fromEntries(COACH_STYLES.map(s => [s.id, s]));

// Demands (cues): short timed micro-goals. Progress comes from watching core counters each frame.
const COACH_CUES = [
  { id: 'burst',  icon: '👆', text: 'Cook 20 times within 5 seconds', win: 25 },
  { id: 'endure', icon: '🔁', text: 'Cook 60 times in 20 seconds', win: 20 },
  { id: 'rest',   icon: '🫕', text: 'Let it simmer 12 seconds without cooking, then cook once', win: 40 },
  { id: 'buy',    icon: '🛒', text: 'Buy 10 pieces of equipment in 30 seconds', win: 30 },
  { id: 'upg',    icon: '✨', text: 'Buy 2 upgrades in 40 seconds', win: 40 },
];
const CUE_BY_ID = Object.fromEntries(COACH_CUES.map(c => [c.id, c]));

const coachUnlocked = () => S.bestStage >= 3;
const coachSt = () => extState('coach');
const coachLv = () => coachSt().level + 1;
const coachSlots = () => coachLv() >= COACH_MAX ? 2 : coachLv() >= 5 ? 1 : 0;
const activeStyles = () => (coachSt().styles || []).slice(0, coachSlots()).map(id => STYLE_BY_ID[id]).filter(Boolean);
const styleOn = id => activeStyles().some(s => s.id === id);
const styleMul = key => activeStyles().reduce((m, s) => m * (s[key] ? s[key]() : 1), 1);
const coachPassive = () => 1 + 0.01 * coachSt().level; // +1% steaks per second per feeding

function coachCost() {
  const L = COACH_LEVELS[coachSt().level + 1];
  if (!L) return null;
  const off = 1 - COACH_XP_OFF * Math.min(COACH_XP_MAX, coachSt().xp);
  if (L.b) return { b: B_BY_ID[L.b], n: Math.max(1, Math.ceil(L.n * off)) };
  return { v: Math.max(L.floor, L.min * 60 * baseGps()) * off };
}
const canPromote = c => !!c && (c.b ? own(c.b.id) >= c.n : S.gains >= c.v);
const costText = c => c.b ? `${c.n} ${c.b.name}` : fmt(c.v) + ' steaks';
function promoteCoach() {
  const st = coachSt(), c = coachCost();
  if (!canPromote(c)) return false;
  if (c.b) { S.owned[c.b.id] = Math.max(0, own(c.b.id) - c.n); st.invested += c.n; }
  else S.gains -= c.v;
  st.level++;
  st.xp = 0;
  return true;
}
// Signing a pact costs one of your highest pieces of equipment (free if you own none).
const switchPrice = () => BUILDINGS.slice().reverse().find(b => own(b.id) > 0) || null;
function equipStyle(id, slot) {
  const st = coachSt(), s = STYLE_BY_ID[id];
  if (!Array.isArray(st.styles)) st.styles = [null, null];
  if (!s || coachLv() < s.lv || slot >= coachSlots() || st.styles.includes(id)) return false;
  const hb = switchPrice();
  if (hb) S.owned[hb.id] = Math.max(0, own(hb.id) - 1);
  st.styles[slot] = id;
  st.switches++;
  return true;
}
function unequipStyle(slot) { coachSt().styles[slot] = null; }

// ---------- Cue runtime (not saved) ----------
let cue = null, cueResult = null, nextCue = 0, lastCueId = '';
let snapS = null, lastClicks = 0, lastOwned = 0, lastUpg = 0, lastClickAt = 0;
const clickLog = [];
function coachSync() {
  snapS = S; lastClicks = S.runClicks; lastOwned = totalOwned(); lastUpg = S.upg.length;
  clickLog.length = 0;
}
const cueGap = () => rand(120, 240) * 1000 / (styleOn('mind') ? 1.4 : 1);
function startCue(t) {
  let pool = COACH_CUES.filter(c => c.id !== lastCueId);
  if (availableUpgrades().filter(u => upgCost(u) <= S.gains * 3).length < 2) pool = pool.filter(c => c.id !== 'upg');
  const def = pool[Math.floor(Math.random() * pool.length)];
  lastCueId = def.id;
  cue = { id: def.id, start: t, until: t + def.win * 1000, n: 0, prev: t };
  cueResult = null;
  if (typeof toast === 'function') toast(`😈 <b>The Demon demands:</b> ${def.text}!`);
}
function finishCue(ok, t) {
  const st = coachSt(), def = CUE_BY_ID[cue.id];
  cue = null;
  nextCue = t + cueGap();
  if (!ok) {
    st.cuesFailed++; st.failStreak++;
    cueResult = { ok, text: 'Too slow. The demon sulks in the oven and burns a tray of cookies.' };
    return;
  }
  st.cuesDone++; st.failStreak = 0;
  st.xp = Math.min(COACH_XP_MAX, st.xp + 1);
  if (def.id === 'rest') st.restDone = (st.restDone || 0) + 1;
  const dur = styleOn('mind') ? 1.5 : 1, gpsBuff = Math.random() < 0.5;
  if (gpsBuff) addBuff('gps', 2, 60 * dur, 'Demon: Hellfire Rush');
  else addBuff('click', 4, 30 * dur, 'Demon: Possessed Hands');
  cueResult = { ok, text: gpsBuff ? 'The demon cackles with delight! Steaks per second ×2 for a minute, +1 satisfaction.' : 'The demon cackles with delight! Cooking ×4 for 30 seconds, +1 satisfaction.' };
  if (typeof toast === 'function') { toast(`😈 <b>Demon:</b> ${cueResult.text}`); sfx.chime(); }
}
function cueProgress(t) {
  if (!cue) return '';
  if (cue.id === 'burst') return `${clickLog.filter(x => x >= t - 5000).length} / 20 in the last 5 s`;
  if (cue.id === 'endure') return `${cue.n} / 60 cooks`;
  if (cue.id === 'rest') return `simmered ${Math.floor((t - cue.prev) / 1000)} / 12 s`;
  if (cue.id === 'buy') return `${cue.n} / 10 equipment`;
  if (cue.id === 'upg') return `${cue.n} / 2 upgrades`;
  return '';
}

function coachTick() {
  if (S !== snapS) { coachSync(); cue = null; }
  const t = clock();
  const dc = S.runClicks - lastClicks; lastClicks = S.runClicks;
  const dOwn = totalOwned() - lastOwned; lastOwned = totalOwned();
  const dUpg = S.upg.length - lastUpg; lastUpg = S.upg.length;
  if (dc > 0) for (let i = 0; i < Math.min(dc, 40); i++) clickLog.push(t);
  while (clickLog.length && clickLog[0] < t - 6000) clickLog.shift();
  if (!coachUnlocked()) return;
  if (!nextCue) nextCue = t + rand(45, 90) * 1000;
  if (!cue) { if (t >= nextCue) startCue(t); return; }
  // A hidden browser tab freezes frames; a demand that expired while away is dropped, not failed.
  if (t > cue.until + 5000) { cue = null; nextCue = t + cueGap(); return; }
  let ok = false;
  if (cue.id === 'burst') ok = clickLog.filter(x => x >= t - 5000).length >= 20;
  else if (cue.id === 'endure') ok = (cue.n += Math.max(0, dc)) >= 60;
  else if (cue.id === 'rest') { if (dc > 0) { if (t - cue.prev >= 12000) ok = true; cue.prev = t; } }
  else if (cue.id === 'buy') ok = (cue.n += Math.max(0, dOwn)) >= 10;
  else if (cue.id === 'upg') ok = (cue.n += Math.max(0, dUpg)) >= 2;
  if (ok) finishCue(true, t);
  else if (t >= cue.until) finishCue(false, t);
}

// ---------- UI ----------
const COACH_CSS = `
#view-ext-coach .x-coach-head { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 18px; align-items: center;
  padding: 16px 18px; border-radius: 8px; color: #f3ead8; border: 2px solid #3a2c2c;
  background: radial-gradient(120% 140% at 0% 100%, rgba(212, 162, 76,.28), transparent 55%), linear-gradient(180deg, #1f1719, #141012); }
#view-ext-coach .x-coach-badge { width: 72px; height: 72px; border-radius: 10px 10px 4px 4px; display: grid; place-items: center; font-size: 38px;
  color: #d4a24c; background: radial-gradient(circle at 50% 70%, #5a1a0c 0, #2a1210 55%, #141012 100%);
  border: 3px solid #8a9099; border-bottom-width: 6px; box-shadow: inset 0 0 14px rgba(212, 162, 76,.6), 0 0 16px rgba(224,48,30,.35);
  animation: x-coach-flicker 2.4s ease-in-out infinite; }
#view-ext-coach .x-coach-badge svg, #view-ext-coach .x-coach-badge .gi { filter: drop-shadow(0 0 6px rgba(212, 162, 76,.9)); }
@keyframes x-coach-flicker { 0%, 100% { box-shadow: inset 0 0 14px rgba(212, 162, 76,.6), 0 0 16px rgba(224,48,30,.35); }
  50% { box-shadow: inset 0 0 22px rgba(255,150,40,.85), 0 0 24px rgba(224,48,30,.55); } }
#view-ext-coach .x-coach-title { font-family: var(--display, inherit); font-stretch: 75%; font-weight: 800; font-size: 26px; line-height: 1.05; color: #ffb03a; }
#view-ext-coach .x-coach-sub { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #b9aa98; }
#view-ext-coach .x-coach-head .bar { background: #2b2326; height: 6px; margin: 8px 0 4px; max-width: 320px; border-radius: 3px; }
#view-ext-coach .x-coach-head .bar i { background: linear-gradient(90deg, #d4a24c, #e0301e); border-radius: 3px; }
#view-ext-coach .x-coach-head .btn { grid-column: 1 / -1; width: 100%; }
#view-ext-coach .x-coach-cue { border-left: 6px solid #8a9099; background: #f3ead8; color: #141012; padding: 12px 16px; max-width: 640px;
  border-radius: 2px; box-shadow: 0 2px 0 rgba(0,0,0,.25); }
#view-ext-coach .x-coach-cue.live { border-left-color: #e0301e; background: linear-gradient(90deg, #ffe3c4, #f3ead8 60%); }
#view-ext-coach .x-coach-cue b { font-stretch: 80%; font-size: 20px; font-weight: 800; }
#view-ext-coach .x-coach-cue .bar { background: rgba(20,16,18,.15); margin: 8px 0 4px; }
#view-ext-coach .x-coach-cue .bar i { background: #e0301e; transition: none; }
#view-ext-coach .x-coach-cue small { font-family: var(--mono, ui-monospace, monospace); font-size: 12px; color: #6b5d50; }
#view-ext-coach .x-coach-slots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#view-ext-coach .x-coach-slot { padding: 12px 14px; display: flex; gap: 12px; align-items: center; min-height: 58px; border-radius: 6px;
  background: #1b1416; color: #f3ead8; border: 1px solid #3a2c2c; }
#view-ext-coach .x-coach-slot .ic { font-size: 24px; color: #d4a24c; }
#view-ext-coach .x-coach-slot div { flex: 1; }
#view-ext-coach .x-coach-slot small { display: block; font-family: var(--mono, ui-monospace, monospace); font-size: 11px; color: #b9aa98; }
#view-ext-coach .x-coach-slot b { font-stretch: 80%; font-weight: 800; font-size: 17px; }
#view-ext-coach .x-coach-slot.empty { border-style: dashed; }
#view-ext-coach .x-coach-slot.empty b { color: #8f8478; font-weight: 600; }
#view-ext-coach .x-coach-slot.empty .ic { color: #8a9099; }
#view-ext-coach .card.x-coach-on { box-shadow: inset 4px 0 0 #d4a24c, 0 0 12px rgba(212, 162, 76,.3); padding-left: 12px; }
@media (max-width: 700px) {
  #view-ext-coach .x-coach-head { grid-template-columns: 56px 1fr; padding: 12px; }
  #view-ext-coach .x-coach-badge { width: 56px; height: 56px; font-size: 30px; }
  #view-ext-coach .x-coach-slots { grid-template-columns: 1fr; }
}`;

function coachEquipClick(s) {
  const st = coachSt(), slots = coachSlots();
  const hb = switchPrice(), price = hb ? `The demon wants 1 ${hb.name} as a signing fee.` : 'Free while you own no equipment.';
  const done = slot => { if (equipStyle(s.id, slot)) { sfx.buy(); toast(`😈 Pact signed in grease: <b>${esc(s.name)}</b>`); updateAll(); } };
  const empty = [...Array(slots).keys()].find(i => !STYLE_BY_ID[st.styles[i]]);
  const btns = empty !== undefined ? [{ label: 'Sign pact', action: () => done(empty) }]
    : [...Array(slots).keys()].map(i => ({ label: `Replace ${STYLE_BY_ID[st.styles[i]].name}`, action: () => done(i) }));
  btns.push({ label: 'Cancel', cls: 'secondary' });
  modal(`<h3>${s.icon} ${esc(s.name)}</h3><p>${esc(s.desc)}</p><p class="hint">${price} Every new pact costs a piece of equipment, so read the small print.</p>`, btns);
}

function coachRender(v) {
  if (!document.getElementById('ext-coach-css')) {
    const css = document.createElement('style');
    css.id = 'ext-coach-css';
    css.textContent = COACH_CSS;
    document.head.appendChild(css);
  }
  v.innerHTML = iconize(`<h2>The Kitchen Demon</h2>
    <p class="hint">Something lives in the oven, and it stays with you through every cook-off. Feed it steaks or whole pieces of equipment
      to make it grow, sign Pacts with it, and fulfil its Demands for short boosts. Each feeding also adds +1% steaks per second.</p>
    <div class="x-coach-head"><span class="x-coach-badge">😈</span>
      <div><div class="x-coach-sub x-coach-lv"></div><div class="x-coach-title"></div>
        <div class="bar"><i></i></div><div class="x-coach-sub x-coach-xp"></div></div>
      <button class="btn x-coach-promote"></button></div>
    <h3>Current demand</h3><div class="x-coach-cue"><b></b><div class="bar"><i></i></div><small></small></div>
    <h3>Pacts</h3><p class="hint x-coach-slothint"></p>
    <div class="x-coach-slots"></div>
    <div class="cards x-coach-styles" style="border-top:0"></div>`);
  v.querySelector('.x-coach-promote').onclick = () => {
    if (!promoteCoach()) return;
    sfx.fanfare();
    toast(`😈 *Burp.* The demon grew into a <b>${COACH_LEVELS[coachSt().level].title}</b> (Lv ${coachLv()}).`);
    updateAll();
  };
  const slots = v.querySelector('.x-coach-slots');
  [0, 1].forEach(i => {
    const n = el('div', 'x-coach-slot', `<span class="ic"></span><div><small>Pact ${ROMAN[i]}</small><b></b></div><button class="btn secondary">Tear up</button>`);
    n.querySelector('button').onclick = () => { unequipStyle(i); updateAll(); };
    slots.appendChild(n);
  });
  const list = v.querySelector('.x-coach-styles');
  COACH_STYLES.forEach(s => {
    const c = el('div', 'card', `<div class="card-top"><span class="ic">${s.icon}</span><b>${s.name}</b><span class="lv">Lv ${s.lv}</span></div>
      <p>${s.desc}</p><button class="btn secondary"></button>`);
    c.querySelector('button').onclick = () => coachEquipClick(s);
    s.card = c;
    list.appendChild(c);
  });
}

function coachUpdate(v) {
  const st = coachSt(), lv = coachLv(), c = coachCost(), t = clock();
  v.querySelector('.x-coach-lv').textContent = `Lv ${lv} / ${COACH_MAX} · +${st.level}% steaks per second`;
  v.querySelector('.x-coach-title').textContent = COACH_LEVELS[st.level].title;
  v.querySelector('.x-coach-head .bar i').style.width = (st.xp / COACH_XP_MAX * 100) + '%';
  v.querySelector('.x-coach-xp').textContent = c ? `Satisfaction ${st.xp} / ${COACH_XP_MAX} · next feeding −${Math.round(st.xp * COACH_XP_OFF * 100)}% · grows into: ${COACH_LEVELS[st.level + 1].title}`
    : `Fully grown and terrifying · ${fmt(st.cuesDone)} demands fulfilled`;
  const pb = v.querySelector('.x-coach-promote');
  pb.textContent = c ? (c.b ? `Feed it ${c.n} ${c.b.name}` : `Feed · ${fmt(c.v)} steaks`) : 'Fully grown';
  pb.disabled = !canPromote(c);
  if (c && c.b) pb.title = `You own ${fmt(own(c.b.id))} ${c.b.name}`;

  const box = v.querySelector('.x-coach-cue');
  box.classList.toggle('live', !!cue);
  if (cue) {
    const def = CUE_BY_ID[cue.id], left = Math.max(0, cue.until - t);
    box.querySelector('b').innerHTML = iconize(`${def.icon} ${def.text}`);
    box.querySelector('i').style.width = (left / (def.win * 1000) * 100) + '%';
    box.querySelector('small').textContent = `${(left / 1000).toFixed(1)} s left · ${cueProgress(t)}`;
  } else {
    box.querySelector('b').textContent = cueResult ? cueResult.text : 'The oven is ticking. Something in there is watching you cook.';
    box.querySelector('i').style.width = '0%';
    box.querySelector('small').textContent = nextCue ? `Next demand in about ${fmtTime(Math.max(0, (nextCue - t) / 1000))} · ${fmt(st.cuesDone)} fulfilled so far` : '';
  }

  const slots = coachSlots();
  const hb = switchPrice();
  v.querySelector('.x-coach-slothint').textContent = slots === 0 ? 'Grow the demon to Lv 5 and it will offer you its first pact.'
    : `${plural(slots, 'pact slot')} open${slots < 2 ? ' · second pact at Lv 15' : ''}. Signing a pact costs ${hb ? '1 ' + hb.name : 'nothing right now'}. Pacts are kept between cook-offs.`;
  v.querySelectorAll('.x-coach-slot').forEach((n, i) => {
    const s = i < slots ? STYLE_BY_ID[st.styles[i]] : null, open = i < slots;
    n.classList.toggle('empty', !s);
    n.querySelector('.ic').innerHTML = iconize(s ? s.icon : open ? '🔓' : '🔒');
    n.querySelector('b').textContent = s ? s.name : open ? 'No pact signed' : `Locked until Lv ${i ? COACH_MAX : 5}`;
    n.querySelector('button').classList.toggle('hidden', !s);
  });
  COACH_STYLES.forEach(s => {
    const on = activeStyles().includes(s), ready = lv >= s.lv, btn = s.card.querySelector('button');
    s.card.classList.toggle('locked-perk', !ready);
    s.card.classList.toggle('x-coach-on', on);
    btn.textContent = on ? 'Signed' : !ready ? `Locked · Lv ${s.lv}` : slots ? 'Sign…' : 'No pact slot yet';
    btn.disabled = on || !ready || !slots;
  });
}

registerExt({
  id: 'coach',
  state: () => ({ level: 0, xp: 0, styles: [null, null], cuesDone: 0, cuesFailed: 0, failStreak: 0, bestFailStreak: 0, switches: 0, invested: 0, restDone: 0 }),
  gps: () => coachPassive() * styleMul('gps'),
  click: () => styleMul('click'),
  cost: () => styleMul('cost'),
  shakerRate: () => styleMul('shakerRate'),
  buffDur: () => styleMul('buffDur'),
  tick: coachTick,
  slow: () => {
    const st = coachSt();
    if (!Array.isArray(st.styles)) st.styles = [null, null];
    st.bestFailStreak = Math.max(st.bestFailStreak || 0, st.failStreak);
  },
  compete: () => { coachSync(); cue = null; },
  tab: { label: 'Kitchen Demon', shown: coachUnlocked, render: coachRender, update: coachUpdate },
});

const DEMON_CAT = 'Kitchen Demon';
extAch(DEMON_CAT, 'coach_lv2', 'First Feeding', '😈', 'Feed the Kitchen Demon for the first time.', () => coachSt().level >= 1);
extAch(DEMON_CAT, 'coach_lv5', 'It Has Teeth Now', '🦷', 'Grow the Kitchen Demon to level 5.', () => coachSt().level >= 4);
extAch(DEMON_CAT, 'coach_lv10', "Don't Open the Oven", '👹', 'Grow the Kitchen Demon to level 10.', () => coachSt().level >= 9);
extAch(DEMON_CAT, 'coach_lv15', 'The Infernal Sous-Chef', '👑', 'Grow the Kitchen Demon to its final form.', () => coachSt().level >= COACH_MAX - 1);
extAch(DEMON_CAT, 'coach_style', 'Signed in Grease', '✍️', 'Sign a pact with the Kitchen Demon.', () => activeStyles().length >= 1);
extAch(DEMON_CAT, 'coach_style2', 'Double Dealing', '🔀', 'Keep two pacts at once.', () => activeStyles().length >= 2);
extAch(DEMON_CAT, 'coach_cue1', 'Yes, Demon!', '🎯', 'Fulfil a demand.', () => coachSt().cuesDone >= 1);
extAch(DEMON_CAT, 'coach_cue25', "Demon's Favourite", '🍖', 'Fulfil 25 demands.', () => coachSt().cuesDone >= 25);
extAch('Secret', 'coach_deaf', 'Oven Mitts Over Ears', '🔇', 'Ignore five demands in a row.', () => (coachSt().bestFailStreak || 0) >= 5, true);
[['coach_lv2', 1], ['coach_lv5', 2], ['coach_lv10', 3], ['coach_lv15', 5], ['coach_style', 2], ['coach_style2', 4], ['coach_cue1', 1], ['coach_cue25', 3], ['coach_deaf', 2]]
  .forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });
