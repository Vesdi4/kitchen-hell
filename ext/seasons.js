'use strict';
/* Kitchen Seasons: calendar events with a passive effect and seasonal dishes that drop from Golden Dumplings and cooking.
   Dishes are kept forever; the Menu Swap Pass upgrade lets a run pick any season. */

(() => {
// Months are 0-based and inclusive. Item kinds: g = +1% steaks per second, c = +2% cooking power.
// The last item of every season drops only from cooking.
const SEASONS = [
  { id: 'newyear', name: 'New Year Banquet', icon: '🥂', from: 0, to: 0, effect: 'Cooking ×1.25 while the banquet lasts.',
    items: [['🍾', 'Champagne Tower', 'Forty glasses, one very nervous waiter.', 'g'], ['🦞', 'Midnight Lobster', 'Ordered at 11:59. Served at 12:01. Happy New Year.', 'g'],
      ['🍤', 'Shrimp Cocktail', 'Retro, chilled and gone in ninety seconds.', 'g'], ['🧀', 'Countdown Cheese Board', 'Ten cheeses, one per second until midnight.', 'g'],
      ['⏳', 'Last-Minute Roast', 'The roast needs ten more minutes. Midnight needs four.', 'g'], ['🥗', 'Resolution Salad', 'Ordered once, on January 1st. Never again.', 'c'],
      ['🎊', 'Confetti Soufflé', 'It rose, everyone cheered, then it fell.', 'c']] },
  { id: 'spring', name: 'Spring Market', icon: '🌸', from: 2, to: 3, effect: 'Equipment is 5% cheaper.',
    items: [['🌱', 'Pea Shoots', 'Grown on the windowsill above the deep fryer.', 'g'], ['🥕', 'Baby Carrots', 'Pulled this morning, still a bit muddy.', 'g'],
      ['🍓', 'First Strawberries', 'Half of them never made it out of the walk-in.', 'g'], ['🌿', 'Wild Herb Bundle', 'Foraged behind the dumpster. Do not ask.', 'g'],
      ['🥚', 'Duck Eggs', 'Bigger yolks, angrier ducks.', 'g'], ['🍯', 'Wildflower Honey', 'Sticky on every ticket for a week.', 'c'],
      ['🌸', 'Edible Blossoms', 'Plated with tweezers while holding your breath.', 'c']] },
  { id: 'summer', name: 'Summer BBQ', icon: '☀️', from: 5, to: 7, effect: 'Steaks per second ×1.1.',
    items: [['🌭', 'Charred Sausages', 'Blackened on the outside, legendary on the inside.', 'g'], ['🌽', 'Grilled Corn', 'Butter, salt and a burnt thumb.', 'g'],
      ['🍉', 'Watermelon Wedge', 'Ninety percent water, one hundred percent relief.', 'g'], ['🍢', 'Mystery Skewers', 'Some meat, some peppers, some secrets.', 'g'],
      ['🍔', 'Smash Burger', 'Pressed flat with a spatula and pure rage.', 'g'], ['🍦', 'Melting Cone', 'Served fast or served as soup.', 'c'],
      ['🍖', 'Ten-Hour Brisket', 'Someone stayed up all night watching the smoker.', 'c']] },
  { id: 'spooky', name: 'Hell Night', icon: '🎃', from: 9, to: 9, effect: 'Golden Dumplings appear 15% more often.',
    items: [['🎃', 'Pumpkin Soup in a Pumpkin', 'The bowl is also dinner.', 'g'], ['👻', 'Ghost Pepper Wings', 'The ghost is the guest who ordered them.', 'g'],
      ['🦇', 'Bat-Wing Pasta', 'Squid ink farfalle. Probably.', 'g'], ['🕸️', 'Spun-Sugar Cobweb', 'Draped over the dessert cart by a very patient demon.', 'g'],
      ['🕯️', 'Candlelit Cauldron Stew', 'Bubbling since last October.', 'g'], ['🍬', "Devil's Candy", 'Trick or treat: the treat is also a trick.', 'c'],
      ['💀', 'Sugar Skull Cake', 'Grinning at you from the pastry fridge.', 'c']] },
  { id: 'winter', name: 'Feast of Lights', icon: '❄️', from: 11, to: 11, effect: '+0.5% steaks per second per Walk-in Freezer owned (up to +20%).',
    items: [['🦪', 'Snow-Chilled Oysters', 'Kept cold by simply leaving the back door open.', 'g'], ['🍪', 'Gingerbread Line Cooks', 'Small, brave, and missing a leg each.', 'g'],
      ['🌲', 'Pine-Smoked Ham', 'The whole kitchen smells like a forest fire. Lovely.', 'g'], ['🍷', 'Mulled Wine', 'Simmered with cinnamon, served with warnings.', 'g'],
      ['🍲', 'Feast Stew', 'Four thousand calories per ladle.', 'g'], ['🥧', 'Candlelight Pie', 'Baked by the light of three hundred candles and one fire alarm.', 'c'],
      ['🎁', 'Truffle Hamper', 'You knew what it was from the smell.', 'c']] },
];
const SEASON_BY_ID = Object.fromEntries(SEASONS.map(s => [s.id, s]));
SEASONS.forEach(s => { s.items = s.items.map(([icon, name, desc, kind], k) => ({ id: `${s.id}_${k}`, icon, name, desc, kind, click: k === s.items.length - 1 })); });
const SEA_ITEMS = SEASONS.flatMap(s => s.items);
const SEA_SHAKER_CHANCE = 0.12, SEA_CLICK_CHANCE = 1 / 8000, SEA_SET_BONUS = 0.04;

const seaSt = () => extState('seasons');
const seaHas = id => !!seaSt().got[id];
const seaCount = s => (s ? s.items : SEA_ITEMS).filter(i => seaHas(i.id)).length;
const seaDone = s => s.items.every(i => seaHas(i.id));
let seaNow = () => new Date(); // swapped in tests
const calendarSeason = (d = seaNow()) => SEASONS.find(s => d.getMonth() >= s.from && d.getMonth() <= s.to) || null;
const seasonPicked = () => U.has('seasonpass') && SEASON_BY_ID[seaSt().pick] ? SEASON_BY_ID[seaSt().pick] : null;
const activeSeason = () => seasonPicked() || calendarSeason();
const isSeason = id => { const s = activeSeason(); return !!s && s.id === id; };
const DAY = 86400000;
// Days until the live calendar season ends, or until the next one starts when off-season.
function seasonDays() {
  const d = seaNow(), cur = calendarSeason(d);
  if (cur) return Math.max(1, Math.ceil((new Date(d.getFullYear(), cur.to + 1, 1) - d) / DAY));
  let best = Infinity;
  for (const s of SEASONS) {
    let start = new Date(d.getFullYear(), s.from, 1);
    if (start <= d) start = new Date(d.getFullYear() + 1, s.from, 1);
    best = Math.min(best, Math.ceil((start - d) / DAY));
  }
  return best;
}
function nextCalendarSeason() {
  const d = seaNow();
  for (let k = 1; k <= 12; k++) { const s = calendarSeason(new Date(d.getFullYear(), d.getMonth() + k, 1)); if (s) return s; }
  return SEASONS[0];
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const seasonDates = s => s.from === s.to ? MONTHS[s.from] : `${MONTHS[s.from]}–${MONTHS[s.to]}`;
const seaSwitchCost = () => Math.max(5e5, baseGps() * 600) * 2 ** seaSt().switches;
const collectGps = () => 1 + 0.01 * SEA_ITEMS.filter(i => i.kind === 'g' && seaHas(i.id)).length + SEA_SET_BONUS * SEASONS.filter(seaDone).length;
const collectClick = () => 1 + 0.02 * SEA_ITEMS.filter(i => i.kind === 'c' && seaHas(i.id)).length;
const winterMult = () => 1 + Math.min(0.2, 0.005 * own('mealprep'));

function seaGrant(item) {
  seaSt().got[item.id] = Date.now();
  const s = SEASON_BY_ID[item.id.split('_')[0]];
  const bonus = item.kind === 'g' ? '+1% steaks per second' : '+2% cooking power';
  return { title: 'Seasonal special!', text: `${item.icon} <b>${item.name}</b> joins your ${s.name} menu: ${bonus} forever.${seaDone(s) ? ` Menu complete, +${SEA_SET_BONUS * 100}% more!` : ''}` };
}
function seaSwitch(id) {
  const st = seaSt();
  if (!U.has('seasonpass')) return false;
  if (id === null) { st.pick = null; return true; } // back to the calendar is free
  if (!SEASON_BY_ID[id] || isSeason(id)) return false;
  const c = seaSwitchCost();
  if (S.gains < c) return false;
  S.gains -= c;
  st.pick = id; st.switches++; st.everSwitched = true;
  return true;
}

registerExt({
  id: 'seasons',
  state: () => ({ got: {}, pick: null, switches: 0, lastClicks: -1, everSwitched: false, holiday: false }),
  gps: () => collectGps() * (isSeason('summer') ? 1.1 : 1) * (isSeason('winter') ? winterMult() : 1),
  click: () => collectClick() * (isSeason('newyear') ? 1.25 : 1),
  cost: () => isSeason('spring') ? 0.95 : 1,
  shakerRate: () => isSeason('spooky') ? 1.15 : 1,
  shaker: () => {
    const s = activeSeason();
    if (!s || Math.random() >= SEA_SHAKER_CHANCE) return null;
    const left = s.items.filter(i => !i.click && !seaHas(i.id));
    return left.length ? seaGrant(left[Math.floor(Math.random() * left.length)]) : null;
  },
  tick: () => {
    const st = seaSt();
    if (st.lastClicks < 0 || S.clicks < st.lastClicks) st.lastClicks = S.clicks;
    const n = Math.min(S.clicks - st.lastClicks, 1000);
    st.lastClicks = S.clicks;
    const s = activeSeason();
    if (!n || !s) return;
    const item = s.items.find(i => i.click);
    if (seaHas(item.id) || Math.random() >= 1 - (1 - SEA_CLICK_CHANCE) ** n) return;
    const res = seaGrant(item);
    if (typeof toast === 'function') { toast(`${s.icon} <b>${res.title}</b> ${res.text}`); sfx.fanfare(); }
  },
  slow: () => {
    const d = seaNow(), m = d.getMonth(), day = d.getDate();
    if ((m === 9 && day === 31) || (m === 0 && day === 1)) seaSt().holiday = true;
  },
  compete: () => { const st = seaSt(); st.pick = null; st.switches = 0; },
  tab: {
    label: 'Seasons',
    shown: () => S.bestStage >= 4,
    render(v) {
      if (!document.getElementById('ext-seasons-css')) {
        const css = document.createElement('style');
        css.id = 'ext-seasons-css';
        css.textContent = `
#view-ext-seasons .x-seasons-head { border-left: 6px solid var(--ember, #d4a24c); background: var(--chalk-2, #f3ead8); padding: 12px 16px; margin: 8px 0 14px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
#view-ext-seasons .x-seasons-head .x-seasons-big { font-size: 34px; color: var(--ember, #d4a24c); line-height: 1; }
#view-ext-seasons .x-seasons-head .x-seasons-txt { flex: 1; min-width: 200px; }
#view-ext-seasons .x-seasons-head b { font-stretch: 80%; font-size: 21px; font-weight: 800; display: block; }
#view-ext-seasons .x-seasons-head small { font-family: var(--mono); font-size: 12px; color: var(--muted, #6e6258); }
#view-ext-seasons .x-seasons-head.off { border-left-color: var(--rule, #8b9096); }
#view-ext-seasons .x-seasons-head.off .x-seasons-big { color: var(--muted, #6e6258); }
#view-ext-seasons .cards { margin-top: 10px; }
#view-ext-seasons .card.x-seasons-live .card-top b::after { content: ' · live'; font-family: var(--mono); font-size: 12px; font-weight: 500; color: var(--red, #e0301e); }
#view-ext-seasons .card.x-seasons-done .card-top .lv { color: var(--ember, #d4a24c); }
#view-ext-seasons .ach-grid { margin-top: 8px; }
#view-ext-seasons .ach { font-family: var(--mono); color: var(--muted, #6e6258); }
#view-ext-seasons .ach.got { color: var(--ink, #141012); }
#view-ext-seasons .ach.x-seasons-clk:not(.got) { border-style: dashed; }`;
        document.head.appendChild(css);
      }
      v.innerHTML = iconize(`<h2>Kitchen Seasons</h2>
        <p class="hint">The kitchen follows the real calendar. Each season has its own effect and a seasonal menu to collect:
          Golden Dumplings sometimes drop a seasonal dish, and one rare dish drops only from cooking. Collected dishes stay forever.</p>
        <div class="x-seasons-head"><span class="x-seasons-big"></span><div class="x-seasons-txt"><b></b><span class="x-seasons-eff"></span><br><small></small></div>
          <button class="btn secondary x-seasons-cal">Back to the calendar menu</button></div>
        <div class="comp-grid">
          <div class="stat-box"><small>Dishes collected</small><b class="mono x-seasons-n"></b><span class="x-seasons-sets"></span></div>
          <div class="stat-box"><small>Forever bonus</small><b class="mono x-seasons-bonus"></b><span class="x-seasons-bclick"></span></div>
          <div class="stat-box"><small>Menu Swap Pass</small><b class="mono x-seasons-pass"></b><span class="x-seasons-passinfo"></span></div>
        </div>
        <div class="cards x-seasons-list"></div>`);
      v.querySelector('.x-seasons-cal').onclick = () => { if (seaSwitch(null)) { sfx.chime(); updateAll(); } };
      const list = v.querySelector('.x-seasons-list');
      SEASONS.forEach(s => {
        const c = el('div', 'card', `<div class="card-top"><span class="ic">${s.icon}</span><b>${s.name}</b><span class="lv"></span></div>
          <p>${s.effect}</p><p class="x-seasons-when"></p><div class="ach-grid"></div><button class="btn"></button>`);
        const grid = c.querySelector('.ach-grid');
        s.tiles = s.items.map(it => {
          const t = el('div', 'ach' + (it.click ? ' x-seasons-clk' : ''), '?');
          bindTip(t, () => {
            const bonus = it.kind === 'g' ? '+1% steaks per second' : '+2% cooking power';
            if (!seaHas(it.id)) return tipHead('❔', '???', 'Not found') + `<div>${it.click ? 'Very rare drop from cooking' : 'Drops from Golden Dumplings'} during ${s.name}. Gives ${bonus}.</div>`;
            return tipHead(it.icon, it.name, 'Collected') + `<div>${it.desc}</div><div><b>${bonus}</b> forever.</div>`;
          });
          t.dataset.got = '0';
          grid.appendChild(t);
          return t;
        });
        c.querySelector('button').onclick = () => {
          if (seaSwitch(s.id)) { sfx.buy(); toast(`${s.icon} The kitchen now serves the <b>${s.name}</b> menu for this run.`); updateAll(); }
        };
        s.card = c;
        list.appendChild(c);
      });
    },
    update(v) {
      const cur = activeSeason(), picked = seasonPicked(), cal = calendarSeason(), days = seasonDays(), pass = U.has('seasonpass');
      const head = v.querySelector('.x-seasons-head');
      head.classList.toggle('off', !cur);
      const key = cur ? cur.id : 'off';
      if (head.dataset.s !== key) { head.dataset.s = key; head.querySelector('.x-seasons-big').innerHTML = ico(cur ? cur.icon : '⌛'); }
      head.querySelector('b').textContent = cur ? cur.name : 'Off-season';
      head.querySelector('.x-seasons-eff').textContent = cur ? cur.effect + (cur.id === 'winter' ? ` Now +${Math.round((winterMult() - 1) * 100)}%.` : '')
        : 'No seasonal menu right now. Collected dishes keep working.';
      head.querySelector('small').textContent = picked ? `Swapped in with the Menu Swap Pass for this run. On the calendar: ${cal ? cal.name : 'off-season'}.`
        : cur ? `${plural(days, 'day')} left` : `${nextCalendarSeason().name} starts in ${plural(days, 'day')}`;
      head.querySelector('.x-seasons-cal').classList.toggle('hidden', !picked);
      v.querySelector('.x-seasons-n').textContent = `${seaCount()} / ${SEA_ITEMS.length}`;
      v.querySelector('.x-seasons-sets').textContent = `${SEASONS.filter(seaDone).length} / ${SEASONS.length} sets complete`;
      v.querySelector('.x-seasons-bonus').textContent = `+${Math.round((collectGps() - 1) * 100)}%`;
      v.querySelector('.x-seasons-bclick').textContent = `steaks per second · +${Math.round((collectClick() - 1) * 100)}% cooking power`;
      v.querySelector('.x-seasons-pass').textContent = pass ? 'Owned' : 'None';
      v.querySelector('.x-seasons-passinfo').textContent = pass ? `next swap costs ${fmt(seaSwitchCost())} steaks`
        : S.bestStage >= 3 ? 'buy it in the upgrade store' : `unlocks at the ${STAGES[3].name} stage`;
      SEASONS.forEach(s => {
        const n = seaCount(s), live = !!cur && cur.id === s.id, c = s.card, btn = c.querySelector('button');
        c.classList.toggle('x-seasons-live', live);
        c.classList.toggle('x-seasons-done', n === s.items.length);
        c.querySelector('.lv').textContent = `${seasonDates(s)} · ${n}/${s.items.length}${n === s.items.length ? ` · set +${SEA_SET_BONUS * 100}%` : ''}`;
        c.querySelector('.x-seasons-when').textContent = live ? 'Dishes are dropping now.' : cal && cal.id === s.id ? 'Live on the calendar (you swapped to another menu).' : `On the calendar in ${seasonDates(s)}.`;
        s.items.forEach((it, k) => {
          const got = seaHas(it.id), t = s.tiles[k];
          if (t.dataset.got !== String(+got)) { t.dataset.got = String(+got); t.classList.toggle('got', got); t.innerHTML = got ? ico(it.icon) : '?'; }
        });
        btn.classList.toggle('hidden', !pass);
        btn.textContent = live ? 'On the menu' : `Swap menu · ${fmt(seaSwitchCost())}`;
        btn.disabled = live || S.gains < seaSwitchCost();
      });
    },
  },
});

extUpg({ id: 'seasonpass', kind: 'special', icon: '🎟️', name: 'Menu Swap Pass', cost: 2.5e6,
  desc: 'Swap to any kitchen season for this run from the Seasons tab. Each swap costs 10 minutes of production, doubling every time.',
  req: `Reach the ${STAGES[4].name} stage`, unlock: () => S.bestStage >= 4 });

const seaIcon = id => SEASON_BY_ID[id].icon;
SEASONS.forEach(s => { extAch('Kitchen Seasons', 'sea_set_' + s.id, `${s.name} Menu`, s.icon, `Collect every ${s.name} dish.`, () => seaDone(s)); ACH_BY_ID['sea_set_' + s.id].tier = 3; });
[[1, 'Seasonal Special', '🎁', 1], [10, 'Seasonal Pantry', '🌸', 2], [20, 'Seasonal Hoarder', '❄️', 3], [SEA_ITEMS.length, 'Year-Round Kitchen', '📅', 5]]
  .forEach(([n, name, icon, tier]) => { extAch('Kitchen Seasons', 'sea_n' + n, name, icon, `Collect ${n} seasonal dish${n === 1 ? '' : 'es'}.`, () => seaCount() >= n); ACH_BY_ID['sea_n' + n].tier = tier; });
extAch('Kitchen Seasons', 'sea_pass', 'Off the Menu', '🎟️', 'Swap seasons with the Menu Swap Pass.', () => seaSt().everSwitched);
ACH_BY_ID.sea_pass.tier = 2;
extAch('Kitchen Seasons', 'sea_holiday', 'Holiday Shift', seaIcon('spooky'), 'Cook on Hell Night (31 October) or New Year\'s Day.', () => seaSt().holiday, true);
ACH_BY_ID.sea_holiday.tier = 3;
})();
