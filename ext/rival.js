'use strict';
/* Pests & Critics: cockroaches scurry over the frying pan and steal steaks, paying them back with interest
   when squashed, plus timed duels with a visiting food critic. (Internal ids still say free/freeloader/rival/duel.) */

const RV = {
  unlock: () => S.lifeEarned >= 2e8 || S.bestStage >= 5,
  share: 0.05,                 // each cockroach steals 5% of production
  pocket: 1800,                // a cockroach carries at most 30 min of its stolen share
  maxFree: () => 6 + (U.has('rv_open') ? 2 : 0),
  hits: () => U.has('rv_bouncer') ? 3 : 5,
  payback: g => (g ? 1.3 : 1.15) * (U.has('rv_loan') ? 1.25 : 1),
  rivalScale: l => 1 + 0.08 * Math.min(l, 25),
  rewardScale: l => 1 + 0.25 * Math.min(l, 25),
  RIVALS: ['Lukewarm Lou', 'Madame Crumb', 'Mr. Bland', 'Sour Simone', 'Professor Palate', 'Grumbling Greta', 'The Fork'],
};
const rvSt = () => extState('rival');
const rvFactor = () => RV.unlock() ? Math.max(0.5, 1 - RV.share * rvSt().free.length) : 1;
const rvRivalName = () => RV.RIVALS[rvSt().lvl % RV.RIVALS.length];
// Runtime only: spawn timer, the open challenge and the running duel.
let rvNextFree = 0, rvNextDuel = 0, rvOffer = null, rvDuel = null, rvLast = null, rvDirty = true;

function rvSpawn() {
  const st = rvSt(), used = new Set(st.free.map(f => f.k));
  const open = [...Array(RV.maxFree()).keys()].filter(k => !used.has(k));
  if (!open.length) return;
  const g = Math.random() < 0.03 ? 1 : 0;
  st.free.push({ k: open[Math.floor(Math.random() * open.length)], s: 0, g, h: 0 });
  st.most = Math.max(st.most, st.free.length);
  rvDirty = true;
  if (g && typeof toast === 'function') toast('🪲 A <b>golden cockroach</b> is scurrying over your steak. Squash it before it runs off with the good stuff!');
}
// Returns the payout, or 0 if the cockroach is still scurrying.
function rvHit(k) {
  const st = rvSt(), f = st.free.find(x => x.k === k);
  if (!f) return 0;
  if (++f.h < RV.hits()) return 0;
  st.free.splice(st.free.indexOf(f), 1);
  let v = f.s * RV.payback(f.g);
  if (f.g) { v += baseGps() * 90; st.golds++; }
  earn(v);
  st.popped++; st.refund += v;
  rvDirty = true;
  return v;
}
function rvStash() { return rvSt().free.reduce((n, f) => n + f.s, 0); }

function rvStartDuel() {
  if (!rvOffer) return;
  rvDuel = { x: rvOffer.x, base: S.runEarned, until: clock() + 60000 };
  rvOffer = null;
}
function rvDecline() { if (rvOffer) { rvOffer = null; rvSt().declined++; rvNextDuel = clock() + rand(20, 40) * 60000; } }
function rvEndDuel(won) {
  const st = rvSt(), name = rvRivalName();
  rvDuel = null;
  rvNextDuel = clock() + rand(20, 40) * 60000;
  let msg;
  if (won) {
    const v = baseGps() * 60 * RV.rewardScale(st.lvl) + st.debt * 1.25;
    earn(v);
    addBuff('gps', 1.5, 600, 'Rave Review');
    st.wins++; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); st.lvl++; st.won += v;
    msg = `🧐 <b>${name}</b> licked the plate clean! Rave review: +${fmt(v)} steaks${st.debt ? ' (bill paid back)' : ''} and ×1.5 steaks per second for 10 min.`;
    st.debt = 0;
  } else {
    const take = S.gains * 0.02;
    S.gains -= take; st.debt += take; st.losses++; st.streak = 0;
    msg = `🧐 <b>${name}</b> wrote a scathing review and walked out with ${fmt(take)} steaks. Impress them next time to get it back ×1.25.`;
  }
  if (typeof toast === 'function') { toast(msg); if (won && typeof sfx !== 'undefined') sfx.fanfare(); }
}

// ---------- Hero overlay (cockroaches scurrying over the frying pan) ----------
function rvCss() {
  if (typeof document === 'undefined' || document.getElementById('ext-rival-css')) return;
  const s = document.createElement('style');
  s.id = 'ext-rival-css';
  s.textContent = `
.x-rival-layer { position: absolute; left: 50%; top: 4px; width: min(370px, 88vw); aspect-ratio: 1; translate: -50% 0; pointer-events: none; z-index: 3; }
.x-rival-f { position: absolute; width: 38px; height: 38px; translate: -50% -50%; padding: 0; margin: 0; pointer-events: auto; cursor: pointer;
  background: transparent; border: 0; border-radius: 50%; color: #3b2314; font-size: 28px; line-height: 1;
  display: grid; place-items: center; animation: x-rival-in .5s ease-out; -webkit-tap-highlight-color: transparent; }
.x-rival-f:focus-visible { outline: 2px solid #d4a24c; outline-offset: 1px; }
.x-rival-f .x-rival-bug { display: grid; place-items: center; rotate: var(--rv-rot, 0deg);
  filter: drop-shadow(0 2px 1px rgba(0,0,0,.55)) drop-shadow(0 0 1px rgba(243,234,216,.45)); }
.x-rival-f .x-rival-bug > * { animation: x-rival-wiggle .34s ease-in-out infinite alternate; animation-delay: var(--rv-del, 0s); }
.x-rival-f .x-rival-bug svg, .x-rival-f .x-rival-bug .gi { width: 1em; height: 1em; fill: currentColor; }
.x-rival-f:hover { color: #5a3820; }
.x-rival-f.gold { color: #f2c14e; }
.x-rival-f.gold .x-rival-bug { filter: drop-shadow(0 0 5px rgba(255,190,60,.95)) drop-shadow(0 2px 1px rgba(0,0,0,.5)); }
.x-rival-f i { position: absolute; left: 6px; right: 6px; bottom: -3px; height: 3px; border-radius: 2px; background: rgba(20,16,18,.55); }
.x-rival-f i b { display: block; height: 100%; border-radius: 2px; background: #d4a24c; }
.x-rival-f.hit { animation: x-rival-hit .22s linear; }
.x-rival-f.full .x-rival-bug { filter: drop-shadow(0 0 4px rgba(224,48,30,.95)) drop-shadow(0 2px 1px rgba(0,0,0,.55)); }
@keyframes x-rival-in { from { opacity: 0; transform: scale(.3) translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes x-rival-wiggle { from { transform: rotate(-9deg) translateX(-1px); } to { transform: rotate(9deg) translateX(1px); } }
@keyframes x-rival-hit { 0% { transform: scale(1.15, .55); } 50% { transform: scale(.85, 1.1) rotate(8deg); } 100% { transform: none; } }
@media (prefers-reduced-motion: reduce) { .x-rival-f .x-rival-bug > * { animation: none; } }
#view-ext-rival .x-rival-banner { border-left: 6px solid #e0301e; background: #f3ead8; color: #141012; padding: 12px 16px; margin: 8px 0 14px;
  border-radius: 2px; box-shadow: 0 2px 0 rgba(0,0,0,.25); }
#view-ext-rival .x-rival-banner.idle { border-left-color: #8a9099; }
#view-ext-rival .x-rival-banner p { margin: 4px 0 8px; color: #3a2f28; }
#view-ext-rival .x-rival-banner .bar { background: rgba(20,16,18,.15); height: 8px; margin: 6px 0; }
#view-ext-rival .x-rival-banner .bar i { background: linear-gradient(90deg, #d4a24c, #e0301e); }
#view-ext-rival .x-rival-btns { display: flex; gap: 8px; flex-wrap: wrap; }
#view-ext-rival .x-rival-list .card .ic { color: #5a3820; }
#view-ext-rival .x-rival-list .card.gold .ic { color: #d9a520; }
#view-ext-rival h3 { margin-top: 22px; }
@media (max-width: 600px) { #view-ext-rival .comp-grid { grid-template-columns: 1fr 1fr; } #view-ext-rival .stat-box b { font-size: 22px; } }`;
  document.head.appendChild(s);
}
function rvSyncHero() {
  if (typeof document === 'undefined' || typeof el !== 'function') return;
  const area = document.getElementById('heroArea');
  if (!area) return;
  let layer = area.querySelector('.x-rival-layer');
  if (!layer) { rvCss(); layer = el('div', 'x-rival-layer'); area.appendChild(layer); rvDirty = true; }
  const st = rvSt();
  if (rvDirty) {
    rvDirty = false;
    layer.innerHTML = '';
    st.free.forEach(f => {
      const a = (-67.5 + f.k * 45) * Math.PI / 180;
      const b = el('button', 'x-rival-f' + (f.g ? ' gold' : ''), `<span class="x-rival-bug"><span>${f.g ? '🪲' : '🪳'}</span></span><i><b></b></i>`);
      b.style.left = (50 + 47 * Math.cos(a)) + '%';
      b.style.top = (50 + 47 * Math.sin(a)) + '%';
      // Face along the pan's rim (clockwise), with a little random skew so they don't march in formation.
      b.style.setProperty('--rv-rot', Math.round((-67.5 + f.k * 45) + 180 + (f.k * 37 % 30) - 15) + 'deg');
      b.style.setProperty('--rv-del', (-(f.k * 0.13) % 0.34).toFixed(2) + 's');
      b.dataset.k = f.k;
      b.setAttribute('aria-label', f.g ? 'Squash the golden cockroach' : 'Squash the cockroach');
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
        const r = b.getBoundingClientRect(), fx = document.getElementById('fx');
        const v = rvHit(f.k);
        if (fx && typeof floatAt === 'function') {
          const o = fx.getBoundingClientRect();
          floatAt(r.left + r.width / 2 - o.left, r.top - o.top, v ? `+${fmt(v)}` : `${RV.hits() - ((rvSt().free.find(x => x.k === f.k) || {}).h || 0)} more`, v ? 'crit' : 'auto');
        }
        if (v && typeof sfx !== 'undefined') sfx.chime();
      });
      if (typeof bindTip === 'function') bindTip(b, () => {
        const x = rvSt().free.find(y => y.k === f.k);
        if (!x) return '';
        return `${tipHead(x.g ? '🪲' : '🪳', x.g ? 'Golden cockroach' : 'Cockroach', 'Pests')}
          <p>Nibbling ${Math.round(RV.share * 100)}% of your steaks per second. Stolen crumbs: <b>${fmt(x.s)}</b>${rvFull(x) ? ' (belly full)' : ''}.</p>
          <p>Click ${RV.hits() - x.h} more ${RV.hits() - x.h === 1 ? 'time' : 'times'} to squash it: it coughs up ×${RV.payback(x.g).toFixed(2)}${x.g ? ' plus a shiny bonus' : ''}.</p>`;
      });
      layer.appendChild(b);
    });
  }
  for (const b of layer.children) {
    const f = st.free.find(x => x.k === +b.dataset.k);
    if (!f) continue;
    b.querySelector('b').style.width = (f.h / RV.hits() * 100) + '%';
    b.classList.toggle('full', rvFull(f));
  }
}
const rvCap = () => baseGps() / Math.max(0.01, rvFactor()) * RV.share * RV.pocket;
const rvFull = f => f.s >= rvCap() * 0.999;

// Spread stolen production over cockroaches that still have room in their bellies.
function rvBorrow(total) {
  const st = rvSt(), cap = rvCap();
  if (!(total > 0) || !isFinite(total)) return;
  const room = st.free.filter(f => f.s < cap);
  if (!room.length) return;
  const each = total / st.free.length;
  for (const f of room) f.s = Math.min(cap, f.s + each);
}

registerExt({
  id: 'rival',
  state: () => ({ free: [], popped: 0, golds: 0, refund: 0, most: 0, seen: 0,
    lvl: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, debt: 0, won: 0, declined: 0 }),
  gps: () => rvFactor(),
  tick: dt => {
    if (!RV.unlock()) return;
    const st = rvSt(), t = clock();
    if (st.free.length) {
      const f = rvFactor();
      rvBorrow(gps() / f * (1 - f) * dt);
    }
    if (!rvNextFree) rvNextFree = t + rand(45, 120) * 1000;
    if (t >= rvNextFree) { rvNextFree = t + rand(60, 150) * 1000 / (globalThis.HELL_ROACH_RATE || 1); if (st.free.length < RV.maxFree()) rvSpawn(); }
    if (!rvNextDuel) rvNextDuel = t + rand(20, 40) * 60000;
    if (!rvOffer && !rvDuel && t >= rvNextDuel) {
      rvOffer = { x: baseGps() * rand(75, 100) * RV.rivalScale(st.lvl) + 100, until: t + 180000 };
      if (typeof toast === 'function') toast(`🧐 Food critic <b>${rvRivalName()}</b> just sat down: cook ${fmt(rvOffer.x)} steaks in 60 seconds. Answer in the Pests & Critics tab.`);
    }
    if (rvOffer && t >= rvOffer.until) rvDecline();
    if (rvDuel) {
      if (S.runEarned - rvDuel.base >= rvDuel.x) rvEndDuel(true);
      else if (t >= rvDuel.until) rvEndDuel(false);
    }
    rvSyncHero();
  },
  slow: () => {
    const st = rvSt(), now = Date.now();
    // Time away (closed or hidden tab) was produced at the reduced rate, so the cockroaches kept that share.
    if (rvLast === null && st.seen) rvLast = st.seen;
    if (rvLast !== null && RV.unlock() && st.free.length) {
      const gap = (now - rvLast) / 1000;
      if (gap > 3) {
        const f = rvFactor(), v = gap > 61 ? awayGain(gap).v : baseGps() * gap;
        rvBorrow(v / f * (1 - f));
      }
    }
    rvLast = now; st.seen = now;
  },
  // Paid into the old run, so the stolen steaks count toward Stars and are reset with everything else.
  beforeCompete: () => {
    const st = rvSt(), v = rvStash();
    if (v > 0) earn(v);
    if (st.free.length && typeof toast === 'function') toast(`🪳 ${fmt(st.free.length)} ${st.free.length === 1 ? 'cockroach' : 'cockroaches'} fled the old kitchen and gave back ${fmt(v)} steaks, counted toward your Stars.`);
    st.refund += v; st.free = [];
  },
  compete: () => {
    rvOffer = null; rvDuel = null; rvNextDuel = clock() + rand(20, 40) * 60000;
    rvDirty = true;
  },
  tab: {
    label: 'Pests & Critics',
    shown: () => RV.unlock(),
    render: el0 => {
      rvCss();
      el0.innerHTML = '';
      el0.appendChild(el('h2', '', 'Pests & Critics'));
      el0.appendChild(el('p', 'hint', 'Cockroaches scurry over your steak and nibble at it: each one cuts steaks per second by 5% and hoards what it ate. Click one on the steak to squash it, and it coughs everything back up with interest. Now and then a food critic sits down for a 60-second tasting.'));
      const ban = el('div', 'x-rival-banner', `<b class="x-rival-title"></b><p class="x-rival-text mono"></p>
        <div class="bar hidden"><i></i></div>
        <div class="x-rival-btns"><button class="btn x-rival-acc">Serve the critic</button><button class="btn secondary x-rival-dec">Kick them out</button></div>`);
      ban.querySelector('.x-rival-acc').onclick = () => { rvStartDuel(); if (typeof sfx !== 'undefined') sfx.buy(); updateAll(); };
      ban.querySelector('.x-rival-dec').onclick = () => { rvDecline(); updateAll(); };
      el0.appendChild(ban);
      el0.appendChild(el('div', 'comp-grid', `
        <div class="stat-box"><small>🪳 Cockroaches</small><b class="mono x-rival-n">0</b><span class="x-rival-cut"></span></div>
        <div class="stat-box"><small>Stolen crumbs</small><b class="mono x-rival-stash">0</b><span class="x-rival-back"></span></div>
        <div class="stat-box"><small>🧐 Critic</small><b class="mono x-rival-lvl">0</b><span class="x-rival-rec"></span></div>`));
      el0.appendChild(el('h3', '', 'On the steak now'));
      el0.appendChild(el('div', 'cards x-rival-list'));
      el0.appendChild(el('h3', '', 'Pest log & reviews'));
      el0.appendChild(el('div', 'cards x-rival-stats'));
      el0._rv = { n: -1 };
    },
    update: el0 => {
      const st = rvSt(), q = s => el0.querySelector(s), t = clock();
      const ban = q('.x-rival-banner'), acc = q('.x-rival-acc'), dec = q('.x-rival-dec'), bar = q('.bar');
      let title, text, pct = null;
      if (rvDuel) {
        const got = S.runEarned - rvDuel.base;
        title = `🧐 Tasting for ${rvRivalName()}: ${fmtTime(Math.max(0, (rvDuel.until - t) / 1000))} left`;
        text = `${fmt(got)} / ${fmt(rvDuel.x)} steaks. Cook like mad and burn your boosts.`;
        pct = Math.min(100, got / Math.max(1, rvDuel.x) * 100);
      } else if (rvOffer) {
        title = `🧐 ${rvRivalName()} (pickiness ${st.lvl + 1}) wants a tasting`;
        text = `Cook ${fmt(rvOffer.x)} steaks in 60 seconds. Rave review: ${fmt(baseGps() * 60 * RV.rewardScale(st.lvl) + st.debt * 1.25)} steaks and ×1.5 steaks per second for 10 min. Bad review: they take 2% of your steaks. They leave in ${fmtTime(Math.max(0, (rvOffer.until - t) / 1000))}.`;
      } else {
        title = `${rvRivalName()} is sharpening a pencil`;
        text = `Next critic visit in about ${fmtTime(Math.max(0, (rvNextDuel - t) / 1000))}.${st.debt ? ` Critics walked off with ${fmt(st.debt)} of your steaks: win it back ×1.25.` : ''}`;
      }
      if (ban._t !== title) { ban._t = title; q('.x-rival-title').innerHTML = iconize(esc(title)); }
      q('.x-rival-text').textContent = text;
      ban.classList.toggle('idle', !rvDuel && !rvOffer);
      acc.classList.toggle('hidden', !rvOffer); dec.classList.toggle('hidden', !rvOffer);
      bar.classList.toggle('hidden', pct === null);
      if (pct !== null) bar.querySelector('i').style.width = pct + '%';

      const f = rvFactor();
      q('.x-rival-n').textContent = `${st.free.length}/${RV.maxFree()}`;
      q('.x-rival-cut').textContent = st.free.length ? `−${Math.round((1 - f) * 100)}% steaks per second` : 'the steak is spotless';
      q('.x-rival-stash').textContent = fmt(rvStash());
      q('.x-rival-back').textContent = `squash with ${RV.hits()} clicks each`;
      q('.x-rival-lvl').textContent = 'Lv ' + st.lvl;
      q('.x-rival-rec').textContent = `${st.wins} raves · ${st.losses} pans`;

      const list = q('.x-rival-list'), key = st.free.map(x => x.k + ':' + x.g).join(',');
      if (el0._rv.key !== key) {
        el0._rv.key = key;
        list.innerHTML = '';
        if (!st.free.length) list.appendChild(el('p', 'hint', 'No cockroaches right now. They sneak in every couple of minutes.'));
        st.free.forEach(x => {
          const c = el('div', 'card' + (x.g ? ' gold' : ''), `<div class="card-top"><span class="ic">${x.g ? '🪲' : '🪳'}</span><b>${x.g ? 'Golden cockroach' : 'Cockroach'}</b><span class="lv"></span></div><p></p><div class="bar"><i></i></div>`);
          c.dataset.k = x.k;
          list.appendChild(c);
        });
      }
      for (const c of list.querySelectorAll('.card')) {
        const x = st.free.find(y => y.k === +c.dataset.k);
        if (!x) continue;
        c.querySelector('.lv').textContent = `${x.h}/${RV.hits()} squashes`;
        c.querySelector('p').textContent = `Crumbs ${fmt(x.s)}${rvFull(x) ? ' (belly full)' : ''} · coughs up ${fmt(x.s * RV.payback(x.g))}`;
        c.querySelector('i').style.width = Math.min(100, x.s / Math.max(1, rvCap()) * 100) + '%';
      }
      const rec = `${st.popped}|${st.refund}|${st.golds}|${st.wins}|${st.losses}|${st.declined}|${st.bestStreak}`;
      if (el0._rv.rec !== rec) el0._rv.rec = rec, q('.x-rival-stats').innerHTML = iconize(`<div class="card"><div class="card-top"><span class="ic">🪳</span><b>Cockroaches squashed</b><span class="lv">${fmt(st.popped)}</span></div><p>Coughed up ${fmt(st.refund)} steaks in total · ${plural(st.golds, 'golden one')}</p></div>
        <div class="card"><div class="card-top"><span class="ic">🧐</span><b>Critic tastings</b><span class="lv">best streak ${st.bestStreak}</span></div><p>${st.wins} rave reviews, ${st.losses} bad reviews, ${st.declined} kicked out · ${fmt(st.won)} steaks in tips</p></div>`);
    },
  },
});

// ---------- Achievements ----------
[['rv_pop1', 'First Squish', '🪳', 'Squash your first cockroach.', () => rvSt().popped >= 1],
 ['rv_pop25', 'Shoe Specialist', '👟', 'Squash 25 cockroaches.', () => rvSt().popped >= 25],
 ['rv_pop100', 'Pest Control', '🧴', 'Squash 100 cockroaches.', () => rvSt().popped >= 100],
 ['rv_full', 'Infestation', '🐜', 'Have 6 cockroaches on the steak at once.', () => rvSt().most >= 6],
 ['rv_refund', 'Interest Accrued', '💰', 'Get 1T steaks back from squashed cockroaches.', () => rvSt().refund >= 1e12],
 ['rv_win1', 'Critic Approved', '🧐', 'Earn a rave review from a food critic.', () => rvSt().wins >= 1],
 ['rv_streak', 'Rave After Rave', '🏆', 'Earn 3 rave reviews in a row.', () => rvSt().bestStreak >= 3],
 ['rv_win10', 'Front Page Review', '📰', 'Earn 10 rave reviews.', () => rvSt().wins >= 10]]
  .forEach(([id, name, icon, desc, test]) => extAch('Pests & Critics', id, name, icon, desc, test));
extAch('Secret', 'rv_gold', 'All That Glitters', '🪲', 'Squash a golden cockroach.', () => rvSt().golds >= 1, true);
[['rv_pop1', 1], ['rv_pop25', 2], ['rv_pop100', 3], ['rv_full', 3], ['rv_refund', 4], ['rv_win1', 2], ['rv_streak', 3], ['rv_win10', 5], ['rv_gold', 3]]
  .forEach(([id, t]) => { if (ACH_BY_ID[id]) ACH_BY_ID[id].tier = t; });

// ---------- Upgrades ----------
extUpg({ id: 'rv_bouncer', kind: 'special', icon: '🩴', name: 'The Flip-Flop', cost: 5e9,
  desc: 'The ancient weapon. Cockroaches go down after 3 squashes instead of 5.', req: 'Squash 10 cockroaches', unlock: () => rvSt().popped >= 10 });
extUpg({ id: 'rv_loan', kind: 'special', icon: '🧾', name: 'Crumb Tax', cost: 2e11,
  desc: 'Squashed cockroaches cough up their crumbs ×1.25 more.', req: 'Squash 30 cockroaches', unlock: () => rvSt().popped >= 30 });
extUpg({ id: 'rv_open', kind: 'special', icon: '💡', name: 'Lights Off After Close', cost: 5e12,
  desc: 'Up to 8 cockroaches can sneak in instead of 6. More nibbling, bigger paybacks.', req: 'Earn 3 rave reviews', unlock: () => rvSt().wins >= 3 });
