// Signal bot: runs every ~15 minutes on GitHub Actions, checks the indicators on live candles,
// and sends new signals (and TP1 / SL / target events) to your Telegram. It never places orders.
'use strict';
const fs = require('fs');
let IND;
try { IND = require('./indicators.js'); }
catch (e) {
  console.log('PROBLEM: indicators.js in your repository is broken or incomplete.');
  console.log('Re-upload indicators.js from the newest signal-bot.zip (it is about 19 KB and its last line starts with module.exports).');
  console.log('Technical detail: ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const TOKEN = process.env.TELEGRAM_TOKEN || '', CHAT = process.env.TELEGRAM_CHAT_ID || '', TDKEY = process.env.TWELVEDATA_KEY || '';
const SEC = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400 };
const TD = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h' };
const MAXAGE = cfg.maxAgeCandles || 3;
const TZ = cfg.timezone || 'Asia/Riyadh', LANG = cfg.language === 'en' ? 'en' : 'ta', TA = LANG === 'ta';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
IND.setBE(cfg.breakEvenAfterTP1 !== false);

let state = { sent: {}, open: [], hb: '' };
try { state = JSON.parse(fs.readFileSync('state.json', 'utf8')); } catch (e) {}
state.sent = state.sent || {}; state.open = state.open || [];

const f = v => v.toFixed(v >= 100 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 6 : 8);
const when = t => new Date(t * 1000).toLocaleString('en-GB', { timeZone: TZ, hour12: false }) + ' (' + TZ.split('/').pop().replace('_', ' ') + ')';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MANUAL = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.argv.includes('--test');
async function send(text, html) {
  console.log('\n' + text + '\n');
  if (!TOKEN || !CHAT) { console.log('TELEGRAM: NOT SENT. The secret TELEGRAM_TOKEN or TELEGRAM_CHAT_ID is empty or has a different name (names are case-sensitive).'); return; }
  try {
    const r = await fetch('https://api.telegram.org/bot' + TOKEN + '/sendMessage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(html ? { chat_id: CHAT, text, parse_mode: 'HTML', disable_web_page_preview: true } : { chat_id: CHAT, text }) });
    if (r.ok) console.log('TELEGRAM: sent');
    else {
      const t = await r.text();
      const why = r.status === 401 || r.status === 404 ? 'the token is wrong (copy it again from BotFather, no spaces)' : r.status === 400 ? 'the chat id is wrong, or you have not pressed Start in your bot chat' : r.status === 403 ? 'the bot was blocked or removed from the chat' : 'unknown';
      console.log('TELEGRAM: NOT SENT, status ' + r.status + ' -> ' + why + '\n' + t.slice(0, 300));
    }
  } catch (e) { console.log('TELEGRAM: NOT SENT, network error ' + e.message); }
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
  if (w.source === 'twelvedata') raw = await twelve(w.symbol, w.tf);
  else {
    const errs = [];
    try { raw = await binance(w.symbol.replace('/', '').replace('USD', 'USDT'), w.tf); } catch (e) { errs.push(e.message); }
    if (!raw) { try { raw = await kraken(w); } catch (e) { errs.push(e.message); } }
    if (!raw) throw new Error(errs.join(' | '));
  }
  const now = Math.floor(Date.now() / 1000), sec = SEC[w.tf];
  return raw.filter(c => c.time + sec <= now);            // closed candles only: no repainting
}

function reasons(w, s, ind) {
  const buy = s.side === 'BUY', dr = s.dr || [], v = s.v || {}, p = { ...IND.defaults(ind), ...(w.params || {}) };
  const ob = dr.find(o => o.t === 'B' && o.e), lo = ob ? Math.min(ob.y1, ob.y2) : NaN, hi = ob ? Math.max(ob.y1, ob.y2) : NaN;
  const rr = 'TP1 ' + (s.r1 || 0).toFixed(1) + 'R, TP2 ' + (s.r2 || 0).toFixed(1) + 'R';
  const side = (a, b2) => buy ? a : b2;
  if (ind.id === 'liq') {
    const parts = (s.txt || '').split(' | '), conf = parts[1] || '', zone = parts[2] || '';
    return TA ? [
      side('விலை முந்தைய low (' + f(v.ssl) + ')-க்குக் கீழே சென்று sell-side liquidity-ஐ எடுத்துவிட்டுத் திரும்பியது.', 'விலை முந்தைய high (' + f(v.ssl) + ')-க்கு மேலே சென்று buy-side liquidity-ஐ எடுத்துவிட்டுத் திரும்பியது.'),
      conf === 'BOS' ? side('பிறகு முந்தைய உச்சம் (' + f(v.m) + ')-ஐ மேலே உடைத்தது (BOS): மேல்நோக்கிய மாற்றம் உறுதி.', 'பிறகு முந்தைய தாழ்வு (' + f(v.m) + ')-ஐ கீழே உடைத்தது (BOS): கீழ்நோக்கிய மாற்றம் உறுதி.') : side('பிறகு இறங்கு trend-line-ஐ மேலே உடைத்தது: மேல்நோக்கிய மாற்றம் உறுதி.', 'பிறகு ஏறு trend-line-ஐ கீழே உடைத்தது: கீழ்நோக்கிய மாற்றம் உறுதி.'),
      'விலை ' + (zone === 'FVG' ? 'FVG (விலை இடைவெளி)' : 'Order Block') + ' zone-க்குத் திரும்பி வந்து தொட்டது: இங்கே Entry.',
      'SL: sweep ஆன ' + side('low', 'high') + '-ஐத் தாண்டி (ATR buffer உடன்). ' + rr + '.'
    ] : [
      side('Price dipped below the previous low (' + f(v.ssl) + ') and took the sell-side liquidity, then turned back up.', 'Price pushed above the previous high (' + f(v.ssl) + ') and took the buy-side liquidity, then turned back down.'),
      conf === 'BOS' ? side('Then it broke the previous high (' + f(v.m) + ') upward (BOS): the shift up is confirmed.', 'Then it broke the previous low (' + f(v.m) + ') downward (BOS): the shift down is confirmed.') : side('Then it broke the falling trend line upward: the shift up is confirmed.', 'Then it broke the rising trend line downward: the shift down is confirmed.'),
      'Price came back and touched the ' + (zone === 'FVG' ? 'FVG (price gap)' : 'order block') + ' zone: entry here.',
      'SL: beyond the swept ' + side('low', 'high') + ' (with an ATR buffer). ' + rr + '.'
    ];
  }
  if (ind.id === 'smc') {
    const nb = dr.filter(o => o.t === 'T' && o.x === 'B').length, ch = dr.find(o => o.t === 'T' && o.x === 'CH'), imb = dr.find(o => o.x === 'IMB');
    const out = TA ? [
      nb + ' முறை ' + side('கீழ்நோக்கி', 'மேல்நோக்கி') + ' BOS (அமைப்பு உடைப்பு) நடந்தது: ' + side('இறங்குப்', 'ஏறும்') + ' போக்கு.',
      'கடைசி ' + side('low', 'high') + '-க்குப் பிறகு விலை முந்தைய ' + side('lower-high', 'higher-low') + (ch ? ' (' + f(ch.y) + ')' : '') + '-ஐ ' + side('மேலே', 'கீழே') + ' உடைத்தது (CHoCH): போக்கு மாறுகிறது.'
    ] : [
      nb + ' ' + side('downward', 'upward') + ' BOS (structure breaks) happened: a ' + side('falling', 'rising') + ' trend.',
      'After the last ' + side('low', 'high') + ', price broke the previous ' + side('lower high', 'higher low') + (ch ? ' (' + f(ch.y) + ')' : '') + ' ' + side('upward', 'downward') + ' (CHoCH): the trend is changing.'
    ];
    if (imb) out.push(TA ? 'விலை வேகமாக நகர்ந்து imbalance (IMB) விட்டுச்சென்றது.' : 'The move was fast and left an imbalance (IMB).');
    out.push(TA ? 'Order Block (' + f(lo) + ' – ' + f(hi) + ') உருவானது. விலை திரும்பி வந்து ' + p.fib + ' நிலையைத் தொட்டது: இங்கே Entry.' : 'An order block (' + f(lo) + ' – ' + f(hi) + ') formed. Price came back and touched the ' + p.fib + ' level: entry here.');
    out.push(TA ? 'SL: OB-க்கு அப்பால். TARGET (TP2): ' + f(s.tp2) + ' (CHoCH-க்குப் பிறகான ' + side('உச்சம்', 'தாழ்வு') + '). TP1 = பாதி தூரம்.' : 'SL: beyond the order block. TARGET (TP2): ' + f(s.tp2) + ' (the ' + side('high', 'low') + ' after the CHoCH). TP1 = half way.');
    return out;
  }
  if (ind.id === 'bio') {
    const bos = dr.find(o => o.t === 'T' && o.x === 'BOS'), idm = dr.find(o => o.t === 'T' && o.x === 'IDM');
    const out = TA ? ['BOS: ' + side('மேல்', 'கீழ்') + 'நோக்கி அமைப்பு உடைந்தது' + (bos ? ' (' + f(bos.y) + ')' : '') + '.'] : ['BOS: structure broke ' + side('upward', 'downward') + (bos ? ' (' + f(bos.y) + ')' : '') + '.'];
    if (idm) out.push(TA ? 'Inducement (IDM) liquidity எடுக்கப்பட்டது.' : 'The inducement (IDM) liquidity was taken.');
    out.push(TA ? 'Order Block (' + f(lo) + ' – ' + f(hi) + ')-ஐ விலை தொட்டது: இங்கே Entry.' : 'Price touched the order block (' + f(lo) + ' – ' + f(hi) + '): entry here.');
    out.push(TA ? 'SL: OB-க்கு அப்பால். TP2 = எதிர்ப்பக்க liquidity (' + f(s.tp2) + '), TP1 = அதற்குப் பாதி தூரம்.' : 'SL: beyond the order block. TP2 = the opposite liquidity (' + f(s.tp2) + '), TP1 = half way.');
    return out;
  }
  return [s.txt || ind.name];
}

function card(w, s, D, note) {
  const ind = IND.byId[w.indicator], buy = s.side === 'BUY', risk = Math.abs(s.entry - s.sl), px = D[D.length - 1].close, sec = SEC[w.tf];
  const d1 = Math.abs(s.tp1 - s.entry), d2 = Math.abs(s.tp2 - s.entry), diff = px - s.entry, away = Math.abs(diff), near = away <= risk * 0.25;
  const closed = when(D[s.i].time + sec);
  const where = TA ? 'Entry-ஐ விட ' + f(away) + (diff >= 0 ? ' மேலே' : ' கீழே') : f(away) + (diff >= 0 ? ' above entry' : ' below entry');
  const action = near ? (TA ? 'இப்போதே Market ' + s.side + ' போடலாம் (விலை Entry-க்கு அருகில் உள்ளது).' : 'A market ' + s.side + ' order is fine now (price is near entry).')
    : (TA ? 'விலை Entry-யிலிருந்து விலகிவிட்டது. வேண்டுமானால் ' + s.side + ' LIMIT @ Entry வையுங்கள், அல்லது இதைத் தவிர்க்கவும்.' : 'Price has moved away from entry. Place a ' + s.side + ' LIMIT at entry, or skip this one.');
  return (buy ? '🟢' : '🔴') + ' <b>' + s.side + ' — ' + esc(w.symbol) + '</b>  ·  ' + w.tf + '\n<i>' + esc(ind.name) + '</i>\n' +
    (TA ? (buy ? 'வாங்க: விலை ஏறும் என எதிர்பார்ப்பு' : 'விற்க: விலை இறங்கும் என எதிர்பார்ப்பு') : (buy ? 'Buy: expecting the price to rise' : 'Sell: expecting the price to fall')) + '\n\n' +
    '📍 <b>Entry:</b> <code>' + f(s.entry) + '</code>\n' +
    '      ' + (TA ? 'நிலை' : 'Status') + ': ✅ <b>' + (TA ? 'தொட்டுவிட்டது' : 'triggered') + '</b> ' + (TA ? '(zone தொடப்பட்ட candle: ' + closed + ')' : '(zone touched on the candle that closed ' + closed + ')') + '\n' +
    '🛑 <b>SL (Stop Loss):</b> <code>' + f(s.sl) + '</code>   (' + (TA ? 'தூரம்' : 'distance') + ' ' + f(risk) + ')\n' +
    '🎯 <b>TP1:</b> <code>' + f(s.tp1) + '</code>   (' + f(d1) + ')\n' +
    '🎯 <b>TP2:</b> <code>' + f(s.tp2) + '</code>   (' + f(d2) + ')\n' +
    '⚖️ Risk : Reward = 1 : ' + (d2 / risk).toFixed(1) + '\n\n' +
    '💲 ' + (TA ? 'இப்போதைய விலை' : 'Price now') + ': <code>' + f(px) + '</code> (' + where + ')\n' +
    '🧭 ' + action + (note ? '\n⚠️ ' + esc(note) : '') + '\n\n' +
    '🔁 <b>' + (TA ? 'TP1 தொட்டதும்' : 'When TP1 is hit') + ':</b> ' + (TA ? 'SL-ஐ Entry (' + f(s.entry) + ')-க்கு மாற்றுங்கள் (Break-even). Bot உங்களுக்குச் சொல்லும்.' : 'move your SL to the entry (' + f(s.entry) + '): break-even. The bot will tell you.') + '\n' +
    '⚠️ ' + (TA ? 'இது signal மட்டும். ஆர்டரை நீங்களே போடுங்கள்.' : 'This is a signal only. Place the order yourself.');
}
function why(w, s) {
  const ind = IND.byId[w.indicator], list = reasons(w, s, ind);
  return '<i>ℹ️ ' + (TA ? 'ஏன் இந்த ட்ரேட்?' : 'Why this trade?') + '\n' + list.map((x, k) => (k + 1) + ') ' + esc(x)).join('\n') + '\n' + (TA ? 'நேரங்கள்: ' : 'Times: ') + esc(TZ.split('/').pop().replace('_', ' ')) + '</i>';
}

async function main() {
  const cache = {}, errList = [], info = []; let errors = 0;
  for (const w of cfg.watches) {
    if (w.enabled === false) continue;
    try {
      const D = await candles(w); cache[w.name] = D; const sec = SEC[w.tf], now = Math.floor(Date.now() / 1000);
      const ind = IND.byId[w.indicator]; if (!ind) throw new Error('unknown indicator ' + w.indicator);
      const R = ind.calc(D, { ...IND.defaults(ind), ...(w.params || {}) }, IND.H);
      const ls = R.sigs[R.sigs.length - 1];
      const dp = IND.defaults(ind), diff = Object.keys(w.params || {}).filter(k => w.params[k] !== dp[k]).map(k => k + '=' + w.params[k]).slice(0, 10);
      info.push(w.symbol + ' ' + w.tf + ' [' + ind.name + '] settings changed from default: ' + (diff.length ? diff.join(', ') : 'none') + '\n   last closed candle ' + when(D[D.length - 1].time) + '; ' + (ls ? 'latest signal ' + ls.side + ' at ' + when(D[ls.i].time) : 'no signal in the loaded candles'));
      console.log('[' + w.name + '] ' + D.length + ' candles, ' + R.sigs.length + ' signals in history. ' + info[info.length - 1]);
      for (const s of R.sigs) {
        const t = D[s.i].time, key = w.name + '|' + w.indicator + '|' + t;
        const tag = '[' + w.name + '] ' + s.side + ' signal at ' + when(t) + ' -> ';
        if (state.sent[key]) { if (now - t <= 8 * sec) console.log(tag + 'already handled in an earlier run, not repeated'); continue; }
        state.sent[key] = 1;                                // remember it; old history is recorded silently
        if (now - t > MAXAGE * sec) { if (now - t <= 12 * sec) console.log(tag + 'NOT SENT: older than ' + MAXAGE + ' candles when the bot first saw it'); continue; }
        const ended = s.st && s.st !== 'OPEN' && s.st !== 'TP1 hit';
        if (ended) { console.log(tag + 'NOT SENT: the trade had already finished (' + s.st + ')'); continue; }
        const px = D[D.length - 1].close;
        const bad = (s.side === 'BUY' && px <= s.sl) || (s.side === 'SELL' && px >= s.sl);
        if (bad) { console.log(tag + 'NOT SENT: price is already beyond the stop loss'); continue; }
        console.log(tag + 'SENDING to Telegram');
        const note = s.st === 'TP1 hit' ? 'TP1 was already reached. Move SL to entry.' : (Math.abs(px - s.entry) > Math.abs(s.entry - s.sl) * 0.5 ? 'Price has already moved away from the entry. Be careful.' : '');
        await send(card(w, s, D, note), true);
        await send(why(w, s), true);
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
      if (!before && s.t1 && !ended) await send('✅ <b>' + (TA ? 'TP1 தொட்டது' : 'TP1 reached') + '</b> — ' + esc(o.symbol) + ' ' + o.tf + ' ' + o.side + ' (' + f(o.tp1) + ')\n' + (TA ? 'இப்போது SL-ஐ Entry (' + f(o.entry) + ')-க்கு மாற்றுங்கள் (Break-even).' : 'Now move your SL to the entry (' + f(o.entry) + '): break-even.'), true);
      if (ended) {
        const res = (TA ? { 'TP2': '🎯 TARGET (TP2) தொட்டது', 'SL': '❌ Stop Loss தொட்டது', 'TP1 then BE': '⚪ TP1-க்குப் பிறகு Entry-யில் மூடியது (சிறு லாபம்)', 'TP1 then SL': '❌ TP1-க்குப் பிறகு SL-ல் மூடியது' }
          : { 'TP2': '🎯 TARGET (TP2) reached', 'SL': '❌ Stop loss hit', 'TP1 then BE': '⚪ Stopped at entry after TP1 (small profit)', 'TP1 then SL': '❌ Stopped after TP1' })[s.st] || s.st;
        await send('<b>' + res + '</b>\n' + esc(o.symbol) + ' ' + o.tf + ' ' + o.side + ' (Entry ' + f(o.entry) + ')', true);
        done = true;
      }
      o.checked = x.time; o.t1 = s.t1;
    }
    if (!done) keep.push(o);
  }
  state.open = keep.slice(-50);
  const keys = Object.keys(state.sent); if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(k => delete state.sent[k]);
  if (MANUAL) await send('✅ Signal bot is working.\n' + (info.length ? info.join('\n') : 'No market is enabled in config.json') + '\nNew signals will be sent here automatically. Old signals are not repeated.' + (errList.length ? '\n⚠️ ' + errList.join('\n⚠️ ').slice(0, 600) : ''));
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
  R.sigs.forEach(s => { console.log(card(w, s, path, '')); console.log(why(w, s)); }); console.log('result so far:', R.sigs.map(s => s.st).join(','));
}
if (process.argv.includes('--selftest')) selftest(); else main().catch(e => { console.error(e); process.exit(1); });
