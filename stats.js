'use strict';
/* Anonymous play statistics, sent to the stats server every 2 minutes. Holds no personal data:
   a random player id, game numbers and a coarse device type. Players can switch it off in Options.
   Off by default anywhere except the published site, unless localStorage 'kh_stats_url' is set. */

(() => {
  const PUBLIC_URL = 'https://pihole.taila9b352.ts.net:8443/v1/ingest';
  const read = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  const URL_ = location.hostname === 'vesdi4.github.io' ? PUBLIC_URL : read('kh_stats_url');
  const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'x';

  const enabled = () => read('kh_stats_off') !== '1';
  let mem = {};
  try { mem = JSON.parse(read('kh_stats') || '{}') || {}; } catch (e) { mem = {}; }
  if (!/^[0-9a-f]{32}$/.test(mem.pid || '')) mem = { pid: hex(16) };
  // First visit with stats: earlier stages and cook-offs are already history, so they aren't timed.
  if (mem.stage == null) { mem.stage = S.bestStage; mem.prest = S.prestiges; }
  const save = () => write('kh_stats', JSON.stringify(mem));
  save();

  const sid = hex(8), started = performance.now();
  let seq = 0, queue = [], sentAch = new Set(), sentTabs = new Set();
  // Click forensics: real mouse/touch clicks vs clicks fired by scripts or counted without any event.
  let heroEvents = 0, untrusted = 0, lastRunClicks = S.runClicks, ghost = 0, sessClicks = 0;
  let maxCps = 0, hot = 0;
  $('#hero').addEventListener('click', ev => { heroEvents++; if (!ev.isTrusted) untrusted++; }, true);

  // Once a second: click rate, milestones reached, click bookkeeping.
  setInterval(() => {
    const cps = R.clickTimes.filter(t => t > clock() - 1000).length;
    maxCps = Math.max(maxCps, cps);
    if (cps > 25) hot++;
    const d = S.runClicks - lastRunClicks;
    if (d >= 0) { sessClicks += d; ghost += Math.max(0, d - heroEvents); }
    lastRunClicks = S.runClicks; heroEvents = 0;
    while (mem.stage < S.bestStage) queue.push(['stage', String(++mem.stage), S.playTime]);
    while (mem.prest < S.prestiges) queue.push(['prest', String(++mem.prest), S.playTime]);
    S.ach.forEach(id => { const k = slug(id); if (!sentAch.has(k)) { sentAch.add(k); queue.push(['ach', k, S.playTime]); } });
    $$('#menu button:not(.hidden)').forEach(b => { const k = slug(b.textContent.trim()); if (!sentTabs.has(k)) { sentTabs.add(k); queue.push(['tab', k, S.playTime]); } });
  }, 1000);

  const counts = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0).slice(0, 40).map(([k, v]) => [slug(k), Math.floor(v)]));
  function payload(ev) {
    return {
      pid: mem.pid, sid, v: (document.querySelector('script[src^="core.js"]')?.src.match(/v=([0-9a-z.]+)/) || [])[1] || '0', seq: seq++,
      dev: { lang: (navigator.language || 'en').slice(0, 20).replace(/[^A-Za-z0-9-]/g, '') || 'en', mob: matchMedia('(hover: none)').matches, vw: Math.min(innerWidth, 20000) },
      s: {
        life: S.lifeEarned, bank: S.gains, run: S.runEarned, gps: baseGps(), cpow: clickPower(), cearn: S.clickEarned,
        clicks: S.clicks, rclicks: S.runClicks, crits: S.crits, gold: S.shakers, stage: S.bestStage, legend: S.legendRank,
        prest: S.prestiges, stars: S.medals, spent: S.medalsSpent, play: S.playTime, runt: S.runTime, ach: S.ach.length,
        upg: S.upg.length, bld: totalOwned(), scoops: S.scoops, blv: totalBLevels(), recs: totalRecords(), rep: fitness() * 100,
      },
      sess: { clicks: sessClicks, maxCps, hot, ghost, untrusted, len: (performance.now() - started) / 1000, events: seq },
      own: counts(S.owned), skl: counts(S.muscles), prk: counts(S.perks), tabs: [...sentTabs].slice(0, 40), split: slug(S.split), ev,
    };
  }

  let busy = false;
  function send(final) {
    if (!URL_ || !enabled() || busy) return;
    const ev = queue.slice(0, 300);
    let body;
    try { body = JSON.stringify(payload(ev)); } catch (e) { return; }
    // text/plain keeps this a "simple" request, so the browser needs no CORS preflight.
    const req = fetch(URL_, { method: 'POST', body, keepalive: final, mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' } });
    if (final) { queue = queue.slice(ev.length); save(); return; }
    busy = true;
    req.then(r => { if (r.ok) { queue = queue.slice(ev.length); save(); } }).catch(() => {}).finally(() => { busy = false; });
  }
  setTimeout(() => send(false), 20000);
  setInterval(() => send(false), 120000);
  addEventListener('pagehide', () => send(true));

  // Options toggle.
  const btn = $('#optStats');
  if (btn) {
    const label = () => { btn.textContent = `Anonymous stats: ${enabled() ? 'On' : 'Off'}`; };
    btn.onclick = () => { write('kh_stats_off', enabled() ? '1' : '0'); label(); };
    label();
  }
})();
