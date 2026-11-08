// Signal bot: runs every ~15 minutes on GitHub Actions, checks the indicators on live candles,
// and sends new signals (and TP1 / SL / target events) to your Telegram. It never places orders.
'use strict';
const VERSION = 'crtkl-2026-11-07';
const fs = require('fs');
const IND = require('./indicators.js');
let IFV_ERR = '';
try { IND.byId.ifv = require('./ifvg.js').IFV; } catch (e) { IFV_ERR = 'ifvg.js: ' + e.message; }
try { IND.byId.crt = require('./crt.js').CRT; } catch (e) { IFV_ERR += ' crt.js: ' + e.message; }
try { IND.byId.crtkl = require('./crtkl.js').CRTKL; } catch (e) { IFV_ERR += ' crtkl.js: ' + e.message; }
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
if (Array.isArray(cfg.indicators)) for (const k of Object.keys(IND.byId)) if (!cfg.indicators.includes(k)) delete IND.byId[k];   // keep only the indicators listed in config.json
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

const MANUAL = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.argv.includes('--test');
async function send(text) {
  console.log('\n' + text + '\n');
  if (!TOKEN || !CHAT) { console.log('TELEGRAM: NOT SENT. The secret TELEGRAM_TOKEN or TELEGRAM_CHAT_ID is empty or has a different name (names are case-sensitive).'); return; }
  try {
    const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, text }) });
    if (r.ok) console.log('TELEGRAM: sent');
    else {
      const t = await r.text();
      const why = r.status === 401 || r.status === 404 ? 'the token is wrong (copy it again from BotFather, no spaces)' : r.status === 400 ? 'the chat id is wrong, or you have not pressed Start in your bot chat' : r.status === 403 ? 'the bot was blocked or removed from the chat' : 'unknown';
      console.log('TELEGRAM: NOT SENT, status ' + r.status + ' -> ' + why + '\n' + t.slice(0, 300));
    }
  } catch (e) { console.log('TELEGRAM: NOT SENT, network error ' + e.message); }
}

async function binance(sym, tf, lim) {
  let err = '';
  for (const h of ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api.binance.us']) {
    try {
      const r = await fetch(h + '/api/v3/klines?symbol=' + sym + '&interval=' + tf + '&limit=' + (lim || 500)), a = await r.json();
      if (Array.isArray(a)) return a.map(x => ({ time: Math.floor(x[0] / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
      err = a.msg || r.status;
    } catch (e) { err = e.message; }
  }
  throw new Error('Binance: ' + err);
}
async function twelve(sym, tf, lim) {
  if (!TDKEY) throw new Error('TWELVEDATA_KEY secret is missing');
  const r = await fetch('https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(sym) + '&interval=' + TD[tf] + '&outputsize=' + (lim || 500) + '&timezone=UTC&apikey=' + TDKEY), j = await r.json();
  if (j.status === 'error' || !j.values) throw new Error('Twelve Data: ' + (j.message || 'no data'));
  return j.values.slice().reverse().map(x => ({ time: Math.floor(Date.parse(x.datetime.replace(' ', 'T') + 'Z') / 1000), open: +x.open, high: +x.high, low: +x.low, close: +x.close }));
}
const KR = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
async function kraken(w) {
  const pair = w.krakenPair || w.symbol.replace('/', '').replace('BTC', 'XBT');
  const r = await fetch('https://api.kraken.com/0/public/OHLC?pair=' + pair + '&interval=' + KR[w.tf]), j = await r.json();
  if (j.error && j.error.length) throw new Error('Kraken: ' + j.error.join(','));
  const k = Object.keys(j.result).find(x => x !== 'last');
  return j.result[k].map(x => ({ time: +x[0], open: +x[1], high: +x[2], low: +x[3], close: +x[4] }));
}
async function candles(w) {
  let raw;
  if (w.source === 'twelvedata') raw = await twelve(w.symbol, w.tf, w.limit);
  else {
    const errs = [];
    try { raw = await binance(w.symbol.replace('/', '').replace('USD', 'USDT'), w.tf, w.limit); } catch (e) { errs.push(e.message); }
    if (!raw) { try { raw = await kraken(w); } catch (e) { errs.push(e.message); } }
    if (!raw) throw new Error(errs.join(' | '));
  }
  const now = Math.floor(Date.now() / 1000), sec = SEC[w.tf];
  return raw.filter(c => c.time + sec <= now);            // closed candles only: no repainting
}

function text(w, s, D, note) {
  const risk = Math.abs(s.entry - s.sl), px = D[D.length - 1].close;
  return (s.side === 'BUY' ? '🟢 BUY ' : '🔴 SELL ') + w.symbol + ' ' + w.tf + '  [' + IND.byId[w.indicator].name + ']\n' +
    'Entry  ' + f(s.entry) + '\nSL     ' + f(s.sl) + '\nTP1    ' + f(s.tp1) + '  (move SL to entry when hit)\nTP2    ' + f(s.tp2) +
    '\nDistance from entry: SL ' + f(risk) + ' | TP1 ' + f(Math.abs(s.tp1 - s.entry)) + ' | TP2 ' + f(Math.abs(s.tp2 - s.entry)) +
    '\nRisk:Reward to TP2  1 : ' + (Math.abs(s.tp2 - s.entry) / risk).toFixed(1) +
    (s.why ? '\n' + s.why : '') + '\nCandle closed  ' + when(D[s.i].time) + '\nPrice now  ' + f(px) + (note ? '\n' + note : '') +
    '\nThis is a signal only. Place the order yourself and use your own risk limit.';
}

async function main() {
  const cache = {}, errList = [], info = []; let errors = 0;
  for (const w of cfg.watches) {
    if (w.enabled === false) continue;
    try {
      const D = await candles(w); cache[w.name] = D; const sec = SEC[w.tf], now = Math.floor(Date.now() / 1000);
      const ind = IND.byId[w.indicator]; if (!ind) throw new Error('unknown indicator ' + w.indicator + ' (available: ' + Object.keys(IND.byId).join(', ') + ')' + (IFV_ERR ? ' | ' + IFV_ERR : ''));
      const R = ind.calc(D, { ...IND.defaults(ind), ...(w.params || {}) }, IND.H);
      const ls = R.sigs[R.sigs.length - 1];
      const dp = IND.defaults(ind), diff = Object.keys(w.params || {}).filter(k => w.params[k] !== dp[k]).map(k => k + '=' + w.params[k]).slice(0, 10);
      info.push(w.symbol + ' ' + w.tf + ' [' + ind.name + '] settings changed from default: ' + (diff.length ? diff.join(', ') : 'none') + '\n   last closed candle ' + when(D[D.length - 1].time) + '; ' + (ls ? 'latest signal ' + ls.side + ' at ' + when(D[ls.i].time) : 'no signal in the loaded candles'));
      console.log('[' + w.name + '] ' + D.length + ' candles, ' + R.sigs.length + ' signals in history. ' + info[info.length - 1]);
      for (const s of R.sigs) {
        const t = D[s.i].time, key = w.name + '|' + w.indicator + '|' + t;
        if (state.sent[key]) continue;
        state.sent[key] = 1;                                // remember it; old history is recorded silently
        if (now - t > (w.maxAgeCandles || MAXAGE) * sec) continue;
        const ended = s.st && s.st !== 'OPEN' && s.st !== 'TP1 hit';
        if (ended) continue;                                // already finished before we saw it
        const px = D[D.length - 1].close;
        const bad = (s.side === 'BUY' && px <= s.sl) || (s.side === 'SELL' && px >= s.sl);
        if (bad) continue;
        const note = s.st === 'TP1 hit' ? 'TP1 was already reached. Move SL to entry.' : (Math.abs(px - s.entry) > Math.abs(s.entry - s.sl) * 0.5 ? 'Price has already moved away from the entry. Be careful.' : '');
        await send(text(w, s, D, note));
        state.open.push({ id: key, w: w.name, symbol: w.symbol, tf: w.tf, side: s.side, entry: s.entry, sl: s.sl, tp1: s.tp1, tp2: s.tp2, r1: s.r1, r2: s.r2, t1: s.t1 ? 1 : 0, checked: D[s.i].time });
      }
    } catch (e) { errors++; errList.push(w.name + ': ' + e.message); console.log('[' + w.name + '] ERROR ' + e.message); }
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
  if (MANUAL) await send('✅ Signal bot is working. [' + VERSION + ']\n' + (info.length ? info.join('\n') : 'No market is enabled in config.json') + '\nNew signals will be sent here automatically. Old signals are not repeated.' + (errList.length ? '\n⚠️ ' + errList.join('\n⚠️ ').slice(0, 600) : ''));
  const today = new Date().toISOString().slice(0, 10);
  if (errList.length && state.errDay !== today) { state.errDay = today; await send('⚠️ Signal bot problem:\n' + errList.slice(0, 3).join('\n').slice(0, 900)); }
  state.hb = today;       // changes daily, keeps the repository "active"
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
