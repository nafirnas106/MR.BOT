// Signal bot: runs every ~15 minutes on GitHub Actions, checks the indicators on live candles,
// and sends new signals (and TP1 / SL / target events) to your Telegram. It never places orders.
'use strict';
const fs = require('fs');
const IND = require('./indicators.js');
const cfg = 
  try { IND.byId.ifv = require('./ifvg.js').IFV; } catch (e) { console.log('IFVG LOAD ERROR: ' + e.message); }JSON.parse(fs.readFileSync('config.json', 'utf8'));
const TOKEN = process.env.TELEGRAM_TOKEN || '', CHAT = process.env.TELEGRAM_CHAT_ID || '', TDKEY = process.env.TWELVEDATA_KEY || '';
const SEC = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400 };
const TD = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h' };
const MAXAGE = cfg.maxAgeCandles || 3;
IND.setBE(cfg.breakEvenAfterTP1 !== false);

let state = { sent: {}, open: [], hb: '' };
try { state = JSON.parse(fs.readFileSync('state.json', 'utf8')); } catch (e) {}
state.sent = state.sent || {}; state.open = state.open || [];

const f = v => v.toFixed(v >= 100 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 6 : 8);
const when = t => new Date(t * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', hour12: false }) + ' (Sri Lanka)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function send(text) {
  console.log('\n' + text + '\n');
  if (!TOKEN || !CHAT) return;
  try {
    const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text }) });
    if (!r.ok) console.log('Telegram error', r.status, await r.text());
  } catch (e) { console.log('Telegram failed:', e.message); }
}

async function binance(sym, tf) {
  let err = '';
  for (const h of ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us']) {
    try {
      const r = await fetch(h + '/api/v3/klines?symbol=' + sym + '&interval=' + tf + '&limit=500'), a = await r.json();
      if (Array.isArray(a)) return a.map(x => ({ time: Math.floor(x[0] / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
      err = a.msg || r.status;
    } catch (e) { err = e.message; }
  }
  throw new Error('Binance: ' + err);
}
async function twelve(sym, tf) {
  if (!TDKEY) throw new Error('TWELVEDATA_KEY secret is missing');
  const r = await fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(sym) + '&interval=' + TD[tf] + '&outputsize=500&timezone=UTC&apikey=' + TDKEY), j = await r.json();
  if (j.status === 'error' || !j.values) throw new Error('Twelve Data: ' + (j.message || 'no data'));
  return j.values.slice().reverse().map(x => ({ time: Math.floor(Date.parse(x.datetime.replace(' ', 'T') + 'Z') / 1000), open: +x.open, high: +x.high, low: +x.low, close: +x.close }));
}
async function candles(w) {
  const raw = w.source === 'binance' ? await binance(w.symbol.replace('/', '').replace('USD', 'USDT'), w.tf) : await twelve(w.symbol, w.tf);
  const now = Math.floor(Date.now() / 1000), sec = SEC[w.tf];
  return raw.filter(c => c.time + sec <= now);            // closed candles only: no repainting
}

function text(w, s, D, note) {
  const risk = Math.abs(s.entry - s.sl), px = D[D.length - 1].close;
  return (s.side === 'BUY' ? '🟢 BUY ' : '🔴 SELL ') + w.symbol + ' ' + w.tf + '  [' + IND.byId[w.indicator].name + ']\n' +
    'Entry  ' + f(s.entry) + '\nSL     ' + f(s.sl) + '\nTP1    ' + f(s.tp1) + '  (move SL to entry when hit)\nTP2    ' + f(s.tp2) +
    '\nRisk:Reward to TP2  1 : ' + (Math.abs(s.tp2 - s.entry) / risk).toFixed(1) +
    '\nCandle closed  ' + when(D[s.i].time) + '\nPrice now  ' + f(px) + (note ? '\n' + note : '') +
    '\nThis is a signal only. Place the order yourself and use your own risk limit.';
}

async function main() {
  const cache = {}; let errors = 0;
  for (const w of cfg.watches) {
    if (w.enabled === false) continue;
    try {
      const D = await candles(w); cache[w.name] = D; const sec = SEC[w.tf], now = Math.floor(Date.now() / 1000);
      const ind = IND.byId[w.indicator]; if (!ind) throw new Error('unknown indicator ' + w.indicator);
      const R = ind.calc(D, { ...IND.defaults(ind), ...(w.params || {}) }, IND.H);
      for (const s of R.sigs) {
        const t = D[s.i].time, key = w.name + '|' + w.indicator + '|' + t;
        if (state.sent[key]) continue;
        state.sent[key] = 1;                                // remember it; old history is recorded silently
        if (now - t > MAXAGE * sec) continue;
        const ended = s.st && s.st !== 'OPEN' && s.st !== 'TP1 hit';
        if (ended) continue;                                // already finished before we saw it
        const px = D[D.length - 1].close;
        const bad = (s.side === 'BUY' && px <= s.sl) || (s.side === 'SELL' && px >= s.sl);
        if (bad) continue;
        const note = s.st === 'TP1 hit' ? 'TP1 was already reached. Move SL to entry.' : (Math.abs(px - s.entry) > Math.abs(s.entry - s.sl) * 0.5 ? 'Price has already moved away from the entry. Be careful.' : '');
        await send(text(w, s, D, note));
        state.open.push({ id: key, w: w.name, symbol: w.symbol, tf: w.tf, side: s.side, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, r1: s.r1, r2: s.r2, t1: s.t1 ? 1 : 0, checked: D[s.i].time });
      }
    } catch (e) { errors++; console.log('[' + w.name + '] ' + e.message); }
    await sleep(1500);
  }
  // follow open signals: TP1, break-even, stop, target
  const keep = [];
  for (const o of state.open) {
    const D = cache[o.w]; if (!D) { keep.push(o); continue; }
    const s = { ...o }; let done = false;
    for (let j = 0; j < D.length && !done; j++) {
      const x = D[j]; if (x.time <= o.checked) continue;
      const before = s.t1, ended = IND.H.step(s, x, j);
      if (!before && s.t1 && !ended) await send('✅ ' + o.symbol + ' ' + o.tf + ' ' + o.side + ': TP1 reached (' + f(o.tp1) + '). Move your SL to entry (' + f(o.entry) + ').');
      if (ended) {
        const res = { 'TP2': '🎯 TARGET (TP2) reached', 'SL': '❌ Stop loss hit', 'TP1 then BE': '⚪ Stopped at entry after TP1 (small profit)', 'TP1 then SL': '❌ Stopped after TP1' }[s.st] || s.st;
        await send(res + ': ' + o.symbol + ' ' + o.tf + ' ' + o.side + ' (entry ' + f(o.entry) + ')');
        done = true;
      }
      o.checked = x.time; o.t1 = s.t1;
    }
    if (!done) keep.push(o);
  }
  state.open = keep.slice(-50);
  const keys = Object.keys(state.sent); if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(k => delete state.sent[k]);
  state.hb = new Date().toISOString().slice(0, 10);       // changes daily, keeps the repository "active"
  fs.writeFileSync('state.json', JSON.stringify(state));
  if (errors === cfg.watches.filter(w => w.enabled !== false).length && errors > 0) process.exitCode = 1;
}

// --- offline check: node bot.js --selftest
async function selftest() {
  const path = []; let t = Math.floor(Date.now() / 1000) - 900 * 80, px = 110;
  const cd = (o, c, hx = 0, lx = 0) => { path.push({ time: t, open: o, high: Math.max(o, c) + hx, low: Math.min(o, c) - lx, close: c }); t += 900; };
  for (let i = 0; i < 20; i++) { const o = px, c = px + (i % 2 ? 0.4 : -0.3); cd(o, c, 0.3, 0.3); px = c; }
  [-1, -1, -0.8, -1, 0.6, 0.7, 0.5, -0.8, -1.2, -1.5, -1.4, -1.1, 1.2, 1.0, 0.9, 0.5, -0.5, -0.9, -1.2, -1.4, -1.6, -1.5, -1.0, -0.6, -0.4, 0.2, -0.3].forEach(d => { const o = px, c = px + d; cd(o, c, 0.2, 0.2); px = c; });
  cd(px, px + 2.4, 0.1, 0.05); px += 2.4; cd(px + 0.2, px + 1.6, 0.1, 0.1); px += 1.8;
  [1.1, 1.3, 0.9, 1.0, 1.2, -0.8, -1.0, -1.2, -1.4, -1.6, -1.5, -1.2, -0.3, -0.3, -0.3, -0.3, -0.3, -0.3].forEach(d => { const o = px, c = px + d; cd(o, c, 0.15, 0.2); px = c; });
  [0.8, 1.2, 1.5, 1.4, 1.8, 2.0].forEach(d => { const o = px, c = px + d; cd(o, c, 0.2, 0.1); px = c; });
  const w = { name: 'TEST', symbol: 'TEST/USD', tf: '15m', indicator: 'smc' };
  const R = IND.SMC.calc(path, IND.defaults(IND.SMC), IND.H);
  console.log('self-test candles:', path.length, ' signals found:', R.sigs.length);
  R.sigs.forEach(s => console.log(text(w, s, path, '')), console.log('result so far:', R.sigs.map(s => s.st).join(',')));
}
if (process.argv.includes('--selftest')) selftest(); else main().catch(e => { console.error(e); process.exit(1); });
