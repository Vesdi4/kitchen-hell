'use strict';
// Ingredient Exchange: a trading minigame on the Walk-in Freezer building.
// Prices are stored as a factor p around 1; a unit costs index × base × p, where the index is
// baseGps captured when the exchange opens in a run. So prices are measured in "seconds of production".

const MKT_GOODS = [
  { id: 'oats',    name: 'Rice Sacks',       icon: '🍚', base: 0.4, vol: 0.8 },
  { id: 'rice',    name: 'Olive Oil Tins',   icon: '🫒', base: 0.6, vol: 0.8 },
  { id: 'bars',    name: 'Chili Crates',     icon: '🌶️', base: 0.9, vol: 1 },
  { id: 'chicken', name: 'Vanilla Pods',     icon: '🌼', base: 1.4, vol: 1 },
  { id: 'pb',      name: 'Saffron Threads',  icon: '🏵️', base: 2,   vol: 1.1 },
  { id: 'whey',    name: 'Wagyu Sides',      icon: '🥩', base: 2.8, vol: 1.2 },
  { id: 'preworkout', name: 'Caviar Tins',   icon: '🫧', base: 3.6, vol: 1.4 },
  { id: 'creatine', name: 'Black Truffles',  icon: '🍄', base: 4.5, vol: 1.5 },
];
const MKT_FLOOR = 0.25, MKT_CEIL = 3, MKT_HIST = 40, MKT_TICK = 60, MKT_RELIST = 4;
// Hidden trend modes: drift and volatility are per tick in log-price.
const MKT_MODES = {
  stable: { w: 30, drift: 0,      vol: 0.02, len: [6, 20] },
  rise:   { w: 22, drift: 0.025,  vol: 0.03, len: [5, 15] },
  fall:   { w: 22, drift: -0.025, vol: 0.03, len: [5, 15] },
  wild:   { w: 14, drift: 0,      vol: 0.08, len: [4, 10] },
  spike:  { w: 6,  drift: 0.13,   vol: 0.04, len: [1, 3] },
  crash:  { w: 6,  drift: -0.15,  vol: 0.04, len: [1, 3] },
};

const mktOpen = () => own('mealprep') >= 1;
const mktCap = () => 10 + own('mealprep') + (U.has('mkt_wh') ? 25 : 0);
const mktFee = () => U.has('mkt_broker') ? 0.01 : 0.02;
const mktS = () => extState('market');
const mktGauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) / Math.sqrt(0.5); };
function mktPickMode(g) {
  const tot = Object.values(MKT_MODES).reduce((n, m) => n + m.w, 0);
  let r = Math.random() * tot;
  for (const [k, m] of Object.entries(MKT_MODES)) { r -= m.w; if (r <= 0) { g.mode = k; break; } }
  if (!MKT_MODES[g.mode]) g.mode = 'stable';
  const len = MKT_MODES[g.mode].len;
  g.left = Math.round(rand(len[0], len[1]));
}
function mktStep(g, vm) {
  if (!(g.left > 0) || !MKT_MODES[g.mode]) mktPickMode(g);
  const m = MKT_MODES[g.mode];
  let lp = Math.log(g.p);
  lp += m.drift + m.vol * vm * mktGauss() - 0.04 * lp; // pull back toward the base price
  g.p = Math.min(MKT_CEIL, Math.max(MKT_FLOOR, Math.exp(lp)));
  if (!isFinite(g.p)) g.p = 1;
  g.left--;
  // Bouncing off a bound ends a run-away trend early.
  if ((g.p >= MKT_CEIL && m.drift > 0) || (g.p <= MKT_FLOOR && m.drift < 0)) g.left = 0;
  g.hist.push(+g.p.toFixed(4));
  if (g.hist.length > MKT_HIST) g.hist.splice(0, g.hist.length - MKT_HIST);
}
function mktNewGood(def) {
  const g = { p: rand(0.75, 1.3), mode: 'stable', left: 0, hist: [], n: 0, avg: 0 };
  g.hist.push(+g.p.toFixed(4));
  for (let i = 0; i < 24; i++) mktStep(g, def.vol);
  return g;
}
// Fills in missing or broken fields (older saves, bad imports).
function mktEnsure() {
  const s = mktS();
  if (!s.goods || typeof s.goods !== 'object') s.goods = {};
  MKT_GOODS.forEach(d => {
    const g = s.goods[d.id];
    if (!g || !isFinite(g.p) || !Array.isArray(g.hist)) s.goods[d.id] = mktNewGood(d);
    else { g.n = Math.max(0, Math.floor(g.n) || 0); g.avg = isFinite(g.avg) ? g.avg : 0; }
  });
  for (const k of ['index', 'acc', 'ticks', 'profit', 'profitSec', 'trades', 'worstSec']) if (!isFinite(s[k])) s[k] = 0;
  if (!s.flags || typeof s.flags !== 'object') s.flags = {};
  return s;
}
const mktPrice = (d, s = mktS()) => s.index * d.base * s.goods[d.id].p;

function mktTick() {
  const s = mktEnsure();
  MKT_GOODS.forEach(d => mktStep(s.goods[d.id], d.vol));
  s.ticks++;
  // Re-list when production has outgrown the index: lots consolidate so held value is unchanged.
  const bg = baseGps();
  if (isFinite(bg) && s.index > 0 && bg >= s.index * MKT_RELIST) {
    const k = bg / s.index;
    let refund = 0;
    MKT_GOODS.forEach(d => {
      const g = s.goods[d.id], keep = Math.floor(g.n / k);
      refund += (g.n - keep * k) * mktPrice(d, s);
      g.n = keep;
      if (!keep) g.avg = 0;
    });
    s.index = bg;
    if (refund > 0 && isFinite(refund)) S.gains += refund;
    if (typeof toast === 'function') toast(`📊 The <b>Ingredient Exchange</b> re-listed at a bigger scale. Held lots were consolidated at full value.`);
  }
}

function mktBuy(d, n) {
  const s = mktEnsure(), g = s.goods[d.id], price = mktPrice(d, s);
  if (!mktOpen() || !(price > 0)) return false;
  const room = Math.max(0, mktCap() - g.n);
  n = Math.min(n === 'max' ? room : n, room, Math.floor(S.gains / price));
  if (!(n >= 1)) return false;
  S.gains -= n * price;
  g.avg = (g.avg * g.n + g.p * n) / (g.n + n);
  g.n += n;
  s.trades++;
  if (g.p <= MKT_FLOOR * 1.2 && g.n >= mktCap()) s.flags.bottom = true;
  return true;
}
function mktSell(d, n) {
  const s = mktEnsure(), g = s.goods[d.id];
  if (!mktOpen() || s.index <= 0) return false;
  n = Math.min(n === 'max' ? g.n : n, g.n);
  if (!(n >= 1)) return false;
  const net = g.p * (1 - mktFee()), profitSec = n * d.base * (net - g.avg);
  S.gains += n * s.index * d.base * net;
  s.profit += profitSec * s.index;
  s.profitSec += profitSec;
  if (profitSec < 0) s.worstSec = Math.max(s.worstSec, -profitSec);
  if (n >= 5 && g.avg > 0 && net >= g.avg * 2) s.flags.flip = true;
  g.n -= n;
  if (!g.n) g.avg = 0;
  s.trades++;
  return true;
}

registerExt({
  id: 'market',
  state: () => ({ goods: {}, index: 0, acc: 0, ticks: 0, profit: 0, profitSec: 0, trades: 0, worstSec: 0, flags: {} }),
  slow: () => {
    if (!mktOpen()) return;
    const s = mktEnsure();
    if (!(s.index > 0)) s.index = Math.max(1, baseGps() || 1);
    if (++s.acc >= MKT_TICK) { s.acc = 0; mktTick(); }
  },
  // Held goods are kept; prices are relative, so they keep their worth in seconds of production.
  compete: () => { const s = mktEnsure(); s.index = 0; s.acc = 0; },
  tab: {
    label: 'Exchange',
    shown: mktOpen,
    render: root => {
      if (!document.getElementById('ext-market-css')) {
        const st = document.createElement('style');
        st.id = 'ext-market-css';
        st.textContent = `
#view-ext-market .x-market-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px auto; gap: 18px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--rule, #8b9096); }
#view-ext-market .x-market-info p { margin: 2px 0 0; font-size: 13px; color: var(--muted, #6e6258); }
#view-ext-market .x-market-price { font-family: var(--mono); font-size: 15px; font-weight: 600; color: var(--ink, #141012); }
#view-ext-market .x-market-up { color: var(--good, #3d8a3a); }
#view-ext-market .x-market-down { color: var(--red, #e0301e); }
#view-ext-market .x-market-spark { width: 150px; height: 40px; display: block; background: var(--chalk-2, #f3ead8); border: 1px solid var(--rule, #8b9096); }
#view-ext-market .x-market-btns { display: grid; grid-template-columns: repeat(3, auto); gap: 4px; }
#view-ext-market .x-market-btns .btn { padding: 4px 9px; font-size: 12px; min-width: 52px; }
#view-ext-market .x-market-head { margin-top: 18px; }
#view-ext-market .comp-grid { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 700px) {
  #view-ext-market .comp-grid { grid-template-columns: 1fr 1fr; }
  #view-ext-market .stat-box:nth-child(3) { padding-left: 0; border-left: 0; }
  #view-ext-market .stat-box b { font-size: 22px; }
  #view-ext-market .x-market-row { grid-template-columns: minmax(0, 1fr) 120px; gap: 10px; }
  #view-ext-market .x-market-spark { width: 120px; }
  #view-ext-market .x-market-btns { grid-column: 1 / -1; grid-template-columns: repeat(6, 1fr); }
  #view-ext-market .x-market-btns .btn { min-width: 0; padding: 6px 1px; font-size: 11px; white-space: nowrap; }
}`;
        document.head.appendChild(st);
      }
      root.innerHTML = iconize(`<h2>🧊 Ingredient Exchange</h2>
        <p class="hint">Something in the back of your Walk-in Freezers runs a black market for rare ingredients. Buy low, sell high: prices move every minute and follow hidden trends.
        Each ingredient's freezer shelf holds 10 lots plus one per Walk-in Freezer. Selling costs a small broker fee. Stock carries over when you enter a cook-off.</p>
        <div class="comp-grid">
          <div class="stat-box"><small>Next price tick</small><b class="mono x-market-next"></b><span class="x-market-index"></span></div>
          <div class="stat-box"><small>Freezer shelf</small><b class="mono x-market-cap"></b><span class="x-market-fee"></span></div>
          <div class="stat-box"><small>Stock value</small><b class="mono x-market-value"></b><span class="x-market-held"></span></div>
          <div class="stat-box"><small>Total profit</small><b class="mono x-market-profit"></b><span class="x-market-trades"></span></div>
        </div>
        <div class="x-market-list"></div>`);
      const list = root.querySelector('.x-market-list');
      MKT_GOODS.forEach(d => {
        const r = el('div', 'x-market-row', `<div class="x-market-info"><div class="card-top"><span class="ic">${d.icon}</span><b>${d.name}</b><span class="lv"></span></div>
          <p><span class="x-market-price"></span> <span class="x-market-chg mono"></span></p><p class="x-market-own mono"></p></div>
          <svg class="x-market-spark" viewBox="0 0 150 40" preserveAspectRatio="none"></svg>
          <div class="x-market-btns"><button class="btn" data-a="b1">Buy 1</button><button class="btn" data-a="b10">Buy 10</button><button class="btn" data-a="bmax">Buy max</button>
          <button class="btn secondary" data-a="s1">Sell 1</button><button class="btn secondary" data-a="s10">Sell 10</button><button class="btn secondary" data-a="smax">Sell all</button></div>`);
        r.querySelectorAll('button').forEach(b => b.onclick = () => {
          const a = b.dataset.a, n = a.endsWith('max') ? 'max' : +a.slice(1);
          if ((a[0] === 'b' ? mktBuy : mktSell)(d, n)) { sfx.buy(); updateAll(); }
        });
        bindTip(r.querySelector('.x-market-spark'), () => `${tipHead(d.icon, d.name, 'last ' + MKT_HIST + ' ticks')}
          <p>Range ${fmt(mktS().index * d.base * Math.min(...mktS().goods[d.id].hist))} – ${fmt(mktS().index * d.base * Math.max(...mktS().goods[d.id].hist))} steaks.</p>`);
        d.row = r;
        list.appendChild(r);
      });
      root._tick = -1;
    },
    update: root => {
      const s = mktEnsure(), cap = mktCap();
      if (!(s.index > 0)) s.index = Math.max(1, baseGps() || 1);
      let value = 0, held = 0;
      root.querySelector('.x-market-next').textContent = fmtTime(Math.max(0, MKT_TICK - s.acc));
      root.querySelector('.x-market-index').textContent = `index: ${fmt(s.index)} steaks/s`;
      root.querySelector('.x-market-cap').textContent = `${cap} lots`;
      root.querySelector('.x-market-fee').textContent = `per ingredient · sell fee ${Math.round(mktFee() * 100)}%`;
      const redraw = root._tick !== s.ticks;
      root._tick = s.ticks;
      MKT_GOODS.forEach(d => {
        const g = s.goods[d.id], r = d.row, price = mktPrice(d, s), h = g.hist;
        const prev = h.length > 1 ? h[h.length - 2] : g.p, chg = prev > 0 ? (g.p / prev - 1) * 100 : 0;
        value += g.n * price * (1 - mktFee()); held += g.n;
        r.querySelector('.x-market-price').textContent = fmt(price);
        const c = r.querySelector('.x-market-chg');
        c.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`;
        c.className = 'x-market-chg mono ' + (chg > 0.05 ? 'x-market-up' : chg < -0.05 ? 'x-market-down' : '');
        r.querySelector('.lv').textContent = `${g.n}/${cap}`;
        const pl = g.n ? g.n * d.base * s.index * (g.p * (1 - mktFee()) - g.avg) : 0;
        r.querySelector('.x-market-own').innerHTML = g.n
          ? `avg buy ${fmt(s.index * d.base * g.avg)} · <span class="${pl >= 0 ? 'x-market-up' : 'x-market-down'}">${pl >= 0 ? '+' : '-'}${fmt(Math.abs(pl))}</span> if sold`
          : 'none held';
        const room = cap - g.n, afford = price > 0 ? Math.floor(S.gains / price) : 0;
        r.querySelectorAll('button').forEach(b => {
          const a = b.dataset.a, n = a.endsWith('max') ? 1 : +a.slice(1);
          b.disabled = a[0] === 'b' ? room < n || afford < n : g.n < n;
        });
        if (redraw) {
          const lo = Math.min(...h), hi = Math.max(...h), span = hi - lo || 1, W = 150, H = 40;
          const pt = (v, i) => [(i / Math.max(1, h.length - 1) * W).toFixed(1), (H - 4 - (v - lo) / span * (H - 8)).toFixed(1)];
          let svg = '';
          for (let i = 1; i < h.length; i++) {
            const [x0, y0] = pt(h[i - 1], i - 1), [x1, y1] = pt(h[i], i);
            svg += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${h[i] < h[i - 1] ? '#e0301e' : '#141012'}" stroke-width="1.6" stroke-linecap="square"/>`;
          }
          if (g.avg > 0 && g.avg >= lo && g.avg <= hi) {
            const y = pt(g.avg, 0)[1];
            svg = `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#d4a24c" stroke-width="1" stroke-dasharray="3 3"/>` + svg;
          }
          r.querySelector('.x-market-spark').innerHTML = svg;
        }
      });
      root.querySelector('.x-market-value').textContent = fmt(value);
      root.querySelector('.x-market-held').textContent = `${plural(held, 'lot')} after fees`;
      const pr = root.querySelector('.x-market-profit');
      pr.textContent = (s.profit < 0 ? '-' : '') + fmt(Math.abs(s.profit));
      pr.classList.toggle('x-market-down', s.profit < 0);
      root.querySelector('.x-market-trades').textContent = `${plural(s.trades, 'trade')} · ${fmtTime(Math.max(0, s.profitSec))} of production`;
    },
  },
});

extUpg({ id: 'mkt_wh', kind: 'special', icon: '🧊', name: 'Extra Freezer Racks', cost: 2e11,
  desc: 'Ingredient Exchange freezer shelves hold 25 more lots of each ingredient.', req: 'Own 10 Walk-in Freezers', unlock: () => own('mealprep') >= 10 });
extUpg({ id: 'mkt_broker', kind: 'special', icon: '💼', name: 'Shady Ingredient Broker', cost: 5e12,
  desc: 'Ingredient Exchange sell fee drops from 2% to 1%.', req: 'Own 25 Walk-in Freezers', unlock: () => own('mealprep') >= 25 });

{
  const m = () => mktEnsure();
  const full = d => m().goods[d.id].n >= mktCap();
  const A = (id, name, icon, desc, test, tier, shadow) => { extAch('Ingredient Exchange', id, name, icon, desc, test, shadow); ACH_BY_ID[id].tier = tier; };
  A('mkt_first', 'First Delivery', '🚚', 'Make a trade on the Ingredient Exchange.', () => m().trades >= 1, 1);
  A('mkt_trades', 'Loading Dock Regular', '⚖️', 'Make 100 trades on the Ingredient Exchange.', () => m().trades >= 100, 3);
  A('mkt_p1', 'Side Hustle', '💰', 'Earn exchange profit worth 1 minute of production.', () => m().profitSec >= 60, 1);
  A('mkt_p2', 'Spice Trader', '🤑', 'Earn exchange profit worth 30 minutes of production.', () => m().profitSec >= 1800, 3);
  A('mkt_p3', 'Truffle Baron', '🏦', 'Earn exchange profit worth 4 hours of production.', () => m().profitSec >= 14400, 5);
  A('mkt_full', 'Packed to the Ceiling', '📦', 'Fill one freezer shelf on the Ingredient Exchange.', () => mktOpen() && MKT_GOODS.some(full), 2);
  A('mkt_allfull', 'Doomsday Pantry', '🏬', 'Fill every Ingredient Exchange freezer shelf at once.', () => mktOpen() && MKT_GOODS.every(full), 4);
  A('mkt_flip', 'Hot Flip', '📈', 'Sell at least 5 lots for double what you paid.', () => !!m().flags.flip, 3);
  A('mkt_loss', 'Spoiled Batch', '📉', 'Lose 2 minutes of production in a single sale.', () => m().worstSec >= 120, 2);
  A('mkt_bottom', 'Bottom Feeder', '🏷️', 'Fill a freezer shelf while that ingredient trades near its lowest price.', () => !!m().flags.bottom, 3, true);
}
