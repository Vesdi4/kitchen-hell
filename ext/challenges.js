'use strict';
// Hell Shifts (handicapped runs started by a cook-off) and the Simmer switch.

const CH_LIST = [
  { id: 'bodyweight', name: 'Power Outage',      icon: '🔌', target: 5e8,  bonus: ['gps', 0.04],
    desc: 'The power is out. Only the Burnt Toaster, Rusty Pan and Microwave can be bought.' },
  { id: 'fasted',     name: 'Health Inspection', icon: '📝', target: 2e10, bonus: ['gps', 0.04],
    desc: 'The inspector is watching. No Ingredients or Hospitality upgrades, and kept ones do nothing.' },
  { id: 'onearm',     name: 'Burnt Hand',        icon: '🩹', target: 5e10, bonus: ['click', 0.04],
    desc: 'You grabbed the pan by the handle. Cooking is ×0.1.' },
  { id: 'injured',    name: 'Broken Supplier',   icon: '🚛', target: 3e10, bonus: ['gps', 0.04],
    desc: 'The delivery truck broke down. Equipment costs ×2.' },
  { id: 'offseason',  name: 'Dumpling Drought',  icon: '🏜️', target: 5e10, bonus: ['click', 0.04],
    desc: 'Golden Dumplings show up 4× less often.' },
  { id: 'heavylegs',  name: 'Gas Leak',          icon: '⛽', target: 2e10, bonus: ['gps', 0.04],
    desc: 'Half the burners are off and nobody lights a match. Steaks per second ×0.5.' },
];
const CH_BY_ID = Object.fromEntries(CH_LIST.map(c => [c.id, c]));
const DELOAD_MAX = 60, DELOAD_CD = 600000;

const chS = () => extState('challenges');
const chActive = id => chS().active === id;
const chWon = id => chS().won.includes(id);
function chBonus(type) {
  let m = 1;
  for (const c of CH_LIST) if (c.bonus[0] === type && chWon(c.id)) m *= 1 + c.bonus[1];
  return m;
}
const deloadOpen = () => S.bestStage >= 7;
const deloadMeter = () => chS().deload ? Math.min(DELOAD_MAX, Math.max(0, (Date.now() - chS().deloadSince) / 60000)) : 0;
const deloadCd = () => Math.max(0, DELOAD_CD - (Date.now() - chS().deloadToggled)) / 1000;
const deloadPayoff = m => ({ mult: 1 + m / 15, sec: m * 10 });
function toggleDeload() {
  const st = chS();
  if (!deloadOpen() || deloadCd() > 0) return null;
  const now = Date.now();
  let res = { on: true };
  if (st.deload) {
    const m = deloadMeter(), p = deloadPayoff(m);
    if (m >= DELOAD_MAX) st.maxCharged = true;
    if (p.sec >= 1) addBuff('gps', p.mult, p.sec, 'Full Flavor');
    res = { on: false, m, ...p };
  }
  Object.assign(st, { deload: !st.deload, deloadSince: now, deloadToggled: now });
  return res;
}
function chFinish(win) {
  const st = chS(), c = CH_BY_ID[st.active];
  st.active = null;
  if (!c || !win) return c;
  if (!st.won.includes(c.id)) st.won.push(c.id);
  st.best[c.id] = Math.min(st.best[c.id] || Infinity, S.runTime);
  if (S.runTime <= 1200) st.quick = true;
  if (typeof toast === 'function') {
    toast(`🏆 Hell Shift survived: <b>${c.name}</b>! +${c.bonus[1] * 100}% ${c.bonus[0] === 'gps' ? 'steaks per second' : 'cooking power'}, forever.`);
    sfx.fanfare();
  }
  return c;
}

registerExt({
  id: 'challenges',
  state: () => ({ armed: null, active: null, won: [], best: {}, quick: false,
    deload: false, deloadSince: 0, deloadToggled: 0, maxCharged: false }),
  gps: () => chBonus('gps') * (chActive('heavylegs') ? 0.5 : 1) * (chS().deload ? 0.5 : 1)
    // Health Inspection also cancels ingredient/hospitality upgrades kept in the Recipe Box.
    * (chActive('fasted') ? 1 / Math.max(1e-9, foodMult() * recoveryMult()) : 1),
  click: () => chBonus('click') * (chActive('onearm') ? 0.1 : 1) * (chS().deload ? 0.5 : 1),
  cost: () => chActive('injured') ? 2 : 1,
  shakerRate: () => chActive('offseason') ? 0.25 : 1,
  allowBuilding: b => !chActive('bodyweight') || BUILDINGS.indexOf(b) < 3,
  allowUpgrade: u => !chActive('fasted') || (u.kind !== 'food' && u.kind !== 'recovery'),
  compete: () => {
    const st = chS();
    // A shift only counts within its own run: another cook-off ends it unfinished.
    st.active = st.armed && CH_BY_ID[st.armed] ? st.armed : null;
    st.armed = null;
  },
  slow: () => {
    const st = chS();
    if (st.active && !CH_BY_ID[st.active]) st.active = null;
    if (st.active && S.runEarned >= CH_BY_ID[st.active].target) chFinish(true);
  },
  tab: {
    label: 'Hell Shifts',
    shown: () => S.prestiges >= 1 || deloadOpen() || !!chS().active,
    render: chRender,
    update: chUpdate,
  },
});

// ---------- Achievements ----------
const CH_TIERS = { bodyweight: 2, fasted: 3, onearm: 4, injured: 3, offseason: 4, heavylegs: 3 };
CH_LIST.forEach(c => { extAch('Hell Shifts', 'ch_' + c.id, c.name + ' Survivor', c.icon,
  `Survive the ${c.name} Hell Shift.`, () => chWon(c.id)); ACH_BY_ID['ch_' + c.id].tier = CH_TIERS[c.id]; });
extAch('Hell Shifts', 'ch_all', 'Kitchen From Hell', '🏆', 'Survive every Hell Shift.', () => CH_LIST.every(c => chWon(c.id)));
extAch('Hell Shifts', 'ch_deload', 'Perfect Reduction', '♨️', `Turn the heat back up with a full ${DELOAD_MAX}-minute simmer.`, () => chS().maxCharged);
extAch('Hell Shifts', 'ch_quick', 'Speed Service', '⏩', 'Survive a Hell Shift within 20 minutes of the run starting.', () => chS().quick, true);
ACH_BY_ID.ch_all.tier = 5; ACH_BY_ID.ch_deload.tier = 2; ACH_BY_ID.ch_quick.tier = 4;

// ---------- Tab ----------
function chRender(v) {
  if (!$('#ext-challenges-css')) document.head.appendChild(el('style', '', `
    #view-ext-challenges .x-challenges-status { border-top: 2px solid var(--ember, #d4a24c); border-bottom: 1px solid var(--rule, #8b9096); padding: 14px 0; margin-bottom: 18px; }
    #view-ext-challenges .x-challenges-status .bar { background: var(--rule, #8b9096); max-width: 520px; margin: 8px 0; }
    #view-ext-challenges .x-challenges-status .bar i { background: linear-gradient(90deg, var(--ember, #d4a24c), var(--red, #e0301e)); }
    #view-ext-challenges .x-challenges-status p { margin: 0 0 6px; }
    #view-ext-challenges .x-challenges-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    #view-ext-challenges .card.x-challenges-won .lv { color: var(--ember, #d4a24c); }
    #view-ext-challenges .x-challenges-deload { margin-top: 28px; }
    #view-ext-challenges .x-challenges-deload .big-btn { margin-top: 14px; }`)).id = 'ext-challenges-css';
  v.innerHTML = iconize(`<h2>Hell Shifts</h2>
    <p class="hint">Pick a kitchen disaster for your next run. The shift begins when you enter a cook-off. Reach the target in run steaks before your next cook-off to survive it, and earn a small bonus that stays forever.</p>
    <div class="x-challenges-locked locked-box">🔒 <b>Enter your first cook-off</b> to unlock Hell Shifts.</div>
    <div class="x-challenges-body">
      <div class="x-challenges-status"></div>
      <div class="cards x-challenges-cards"></div>
    </div>
    <div class="x-challenges-deload">
      <h2>Simmer</h2>
      <p class="hint">Turn the heat down on purpose. While simmering, steaks per second and cooking are halved, but flavor builds 1 per minute (up to ${DELOAD_MAX}), even while you're away. Turning the heat back up releases the flavor as a steaks boost of ×(1 + flavor/15) for flavor × 10 seconds. The switch has a 10 minute cooldown.</p>
      <div class="x-challenges-dl-locked locked-box">🔒 Reach the <b>${STAGES[3].name}</b> stage to unlock simmering.</div>
      <div class="x-challenges-dl-body">
        <div class="comp-grid">
          <div class="stat-box"><small>Status</small><b class="x-challenges-dl-state">Off</b><span class="x-challenges-dl-note"></span></div>
          <div class="stat-box"><small>Flavor</small><b class="mono x-challenges-dl-meter">0</b><span class="x-challenges-dl-next"></span></div>
          <div class="stat-box"><small>Boost if heat goes up now</small><b class="mono x-challenges-dl-pay">—</b><span class="x-challenges-dl-dur"></span></div>
        </div>
        <button class="big-btn x-challenges-dl-btn"></button>
      </div>
    </div>`);
  const wrap = v.querySelector('.x-challenges-cards');
  CH_LIST.forEach(c => {
    const card = el('div', 'card', `<div class="card-top"><span class="ic">${c.icon}</span><b>${c.name}</b><span class="lv"></span></div>
      <p>${c.desc}</p><p>Target: <b class="mono">${fmt(c.target)}</b> run steaks · Reward: +${c.bonus[1] * 100}% ${c.bonus[0] === 'gps' ? 'steaks per second' : 'cooking power'}</p>
      <p class="x-challenges-best"></p><button class="btn"></button>`);
    card.querySelector('button').onclick = () => {
      const st = chS();
      if (st.active === c.id || chWon(c.id)) return;
      st.armed = st.armed === c.id ? null : c.id;
      sfx.buy();
      updateAll();
    };
    c.card = card;
    wrap.appendChild(card);
  });
  v.querySelector('.x-challenges-dl-btn').onclick = () => {
    const r = toggleDeload();
    if (!r) return;
    if (r.on) toast('♨️ Simmering. Flavor is building.');
    else if (r.sec >= 1) { sfx.fanfare(); toast(`🔥 <b>Full Flavor!</b> ×${r.mult.toFixed(2)} steaks per second for ${fmtTime(r.sec)}.`); }
    else toast('♨️ Heat back up before any flavor built.');
    updateAll();
  };
}

function chStatusHtml() {
  const st = chS();
  if (st.active) {
    const c = CH_BY_ID[st.active];
    return `<p><b>${c.icon} ${c.name} shift in progress</b> · ${c.desc}</p>
      <div class="bar"><i></i></div><p class="mono x-challenges-prog"></p>
      ${st.armed ? `<p>Next shift: <b>${CH_BY_ID[st.armed].name}</b> (a cook-off now ends this one unfinished).</p>` : ''}
      <div class="x-challenges-row"><button class="btn secondary" data-act="abandon">⛔ Walk out of the shift</button>
      ${st.armed ? '<button class="btn secondary" data-act="disarm">Unschedule next</button>' : ''}</div>`;
  }
  if (st.armed) {
    const c = CH_BY_ID[st.armed], p = pendingMedals();
    return `<p><b>${c.icon} ${c.name} is on the schedule.</b> It begins at your next cook-off.</p>
      <div class="x-challenges-row"><button class="btn" data-act="compete"${p < 1 ? ' disabled' : ''}>🏁 ${p < 1 ? 'Not enough for a Star yet' : 'Enter cook-off now'}</button>
      <button class="btn secondary" data-act="disarm">Unschedule</button></div>`;
  }
  return `<p>No Hell Shift scheduled. Pick one below. Survived: <b class="mono">${chS().won.length} / ${CH_LIST.length}</b></p>`;
}

function chUpdate(v) {
  const st = chS(), open = S.prestiges >= 1 || !!st.active;
  v.querySelector('.x-challenges-locked').classList.toggle('hidden', open);
  v.querySelector('.x-challenges-body').classList.toggle('hidden', !open);
  if (open) {
    const box = v.querySelector('.x-challenges-status'), html = chStatusHtml();
    // Rebuild the status block only when its layout changes, so its buttons stay clickable at 10 updates/s.
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = iconize(html);
      box.querySelectorAll('button[data-act]').forEach(b => { b.onclick = () => chAction(b.dataset.act); });
    }
    if (st.active) {
      const c = CH_BY_ID[st.active], pct = Math.min(100, S.runEarned / c.target * 100);
      box.querySelector('.bar i').style.width = pct + '%';
      box.querySelector('.x-challenges-prog').textContent = `${fmt(S.runEarned)} / ${fmt(c.target)} run steaks · ${pct.toFixed(1)}% · run time ${fmtTime(S.runTime)}`;
    }
    CH_LIST.forEach(c => {
      const won = chWon(c.id), btn = c.card.querySelector('button');
      c.card.classList.toggle('x-challenges-won', won);
      c.card.querySelector('.lv').textContent = won ? 'Survived' : st.active === c.id ? 'In progress' : st.armed === c.id ? 'Scheduled' : '';
      c.card.querySelector('.x-challenges-best').textContent = st.best[c.id] != null ? `Best time: ${fmtTime(st.best[c.id])}` : '';
      btn.textContent = won ? 'Survived' : st.active === c.id ? 'In progress' : st.armed === c.id ? 'Unschedule' : 'Schedule for next cook-off';
      btn.classList.toggle('secondary', st.armed === c.id);
      btn.disabled = won || st.active === c.id;
    });
  }
  const dl = deloadOpen();
  v.querySelector('.x-challenges-dl-locked').classList.toggle('hidden', dl);
  v.querySelector('.x-challenges-dl-body').classList.toggle('hidden', !dl);
  if (!dl) return;
  const m = deloadMeter(), p = deloadPayoff(m), cd = deloadCd();
  v.querySelector('.x-challenges-dl-state').textContent = st.deload ? 'Simmering' : 'Full heat';
  v.querySelector('.x-challenges-dl-note').textContent = st.deload ? 'steaks and cooking ×0.5' : 'full output';
  v.querySelector('.x-challenges-dl-meter').textContent = `${Math.floor(m)} / ${DELOAD_MAX}`;
  v.querySelector('.x-challenges-dl-next').textContent = !st.deload ? 'builds while simmering' : m >= DELOAD_MAX ? 'full flavor' : `next point in ${fmtTime(60 - (m % 1) * 60)}`;
  v.querySelector('.x-challenges-dl-pay').textContent = st.deload && p.sec >= 1 ? '×' + p.mult.toFixed(2) : '—';
  v.querySelector('.x-challenges-dl-dur').textContent = st.deload && p.sec >= 1 ? `for ${fmtTime(p.sec)}` : `max ×${deloadPayoff(DELOAD_MAX).mult} for ${fmtTime(deloadPayoff(DELOAD_MAX).sec)}`;
  const btn = v.querySelector('.x-challenges-dl-btn');
  btn.disabled = cd > 0;
  btn.textContent = cd > 0 ? `Switch available in ${fmtTime(cd)}` : st.deload ? 'Heat up · release the flavor' : 'Start simmering';
}

function chAction(act) {
  const st = chS();
  if (act === 'disarm') st.armed = null;
  else if (act === 'compete') { askCompete(); return; }
  else if (act === 'abandon') {
    const c = CH_BY_ID[st.active];
    if (!c) return;
    modal(`<h2>Walk out of ${c.name}?</h2><p>The disaster ends right away and you get no reward. You can schedule it again for a later cook-off.</p>`, [
      { label: 'Keep going', cls: 'secondary' },
      { label: 'Walk out', action: () => { chFinish(false); toast(`⛔ You walked out of ${c.name}.`); updateAll(); } },
    ]);
    return;
  }
  updateAll();
}
