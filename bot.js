// bot.js - 24/7 signal bot. Same CRT + key level code as the app, so signals are identical.
// Runs on GitHub Actions (one pass every 5 minutes) or on any always-on machine with LOOP=1 (every minute).
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TWELVEDATA_KEY. Settings: config.json (the app's "Send settings" writes it).
'use strict';
const fs=require('fs');
global.window=global;global.document={getElementById:()=>({})};
let BE=true,TFI=0,TFN=['M5'],SYMS=[],P={crt:{}};
const f=v=>v.toFixed(v>=100?2:v>=1?4:v>=.01?6:8);
const tm=t=>{const s=new Date(t*1000).toISOString();return s.slice(8,10)+'/'+s.slice(5,7)+' '+s.slice(11,16)+' UTC'};
const tdT=s=>Date.parse((s.length==10?s+'T00:00:00':s.replace(' ','T'))+'Z')/1000;
// ---------- indicator code copied from the app ----------

const $=id=>document.getElementById(id);
const ema=(a,n)=>{const k=2/(n+1);let p=a[0];return a.map((v,i)=>i?(p=v*k+p*(1-k)):v)};
const rsi=(c,n)=>{let g=0,l=0;return c.map((v,i)=>{if(!i)return 50;const d=v-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=n){g+=u/n;l+=w/n}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n}return l?100-100/(1+g/l):100})};
const atr=(d,n)=>{let p=0;return d.map((x,i)=>{const tr=i?Math.max(x.high-x.low,Math.abs(x.high-d[i-1].close),Math.abs(x.low-d[i-1].close)):x.high-x.low;return p=i<n?(p*i+tr)/(i+1):(p*(n-1)+tr)/n})};
const mk=(d,i,side,en,sl,r1,r2)=>{const s=side=='BUY'?1:-1,r=Math.abs(en-sl);return{i,side,entry:en,sl,tp1:en+s*r1*r,tp2:en+s*r2*r,r1,r2,t1:0}};
function step(s,x,j){const b=s.side=='BUY';
 const sv=(s.t1&&BE)?s.entry:s.sl;if(b?x.low<=sv:x.high>=sv){s.st=s.t1?(BE?'TP1 then BE':'TP1 then SL'):'SL';s.R=s.t1?(BE?.5*s.r1:.5*s.r1-.5):-1;s.ei=j;return 1}
 if(b?x.high>=s.tp2:x.low<=s.tp2){s.st='TP2';s.R=.5*s.r1+.5*s.r2;s.ei=j;if(!s.t1)s.t1i=j;return 1}
 if(!s.t1&&(b?x.high>=s.tp1:x.low<=s.tp1)){s.t1=1;s.t1i=j;s.st='TP1 hit'}}
const H={ema,rsi,atr,mk,step};
// CRT (Candle Range Theory: Range, Raid, Run). Uses the mk/step helpers above.
const crtFmt=v=>v.toFixed(v>=100?2:v>=1?4:6);
const crtHl=m=>m>=1440?'D':m%60==0?(m/60)+'H':m+'m';
function klZones(H,j,p){
 const Z=[],a=Math.max(2,j-1-p.klLook),b=j-2;   // candles a..b are older than the CRT candle (j-1)
 const up=k=>H[k].c>H[k].o,dn=k=>H[k].c<H[k].o;
 const open=(z,from)=>{for(let q=from;q<=j-1;q++){if(z.kind=='S'&&H[q].c>z.top)return false;if(z.kind=='B'&&H[q].c<z.bot)return false}return true};
 for(let k=a;k<=b;k++){const c=H[k],r=c.h-c.l||1e-9;
  if(p.kOHP&&k>a&&k<b&&c.h>H[k-1].h&&c.h>=H[k+1].h){let ok=true;for(let q=k+1;q<=j-1;q++)if(H[q].h>c.h)ok=false;if(ok)Z.push({t:'OHP',kind:'S',bot:c.h,top:c.h,i:c.i0})}
  if(p.kOLP&&k>a&&k<b&&c.l<H[k-1].l&&c.l<=H[k+1].l){let ok=true;for(let q=k+1;q<=j-1;q++)if(H[q].l<c.l)ok=false;if(ok)Z.push({t:'OLP',kind:'B',bot:c.l,top:c.l,i:c.i0})}
  if(p.kRB){const uw=c.h-Math.max(c.o,c.c),lw=Math.min(c.o,c.c)-c.l,bd=Math.abs(c.c-c.o);
   if(uw>=.5*r&&uw>bd){const z={t:'RB',kind:'S',bot:Math.max(c.o,c.c),top:c.h,i:c.i0};if(open(z,k+1))Z.push(z)}
   if(lw>=.5*r&&lw>bd){const z={t:'RB',kind:'B',bot:c.l,top:Math.min(c.o,c.c),i:c.i0};if(open(z,k+1))Z.push(z)}}
  if(p.kOB&&k<b){const n=H[k+1];   // OB: last candle before an impulse that closes beyond it
   if(up(k)&&dn(k+1)&&n.c<c.l){const z={t:'OB',kind:'S',bot:c.l,top:c.h,i:c.i0};if(open(z,k+2))Z.push(z)}
   if(dn(k)&&up(k+1)&&n.c>c.h){const z={t:'OB',kind:'B',bot:c.l,top:c.h,i:c.i0};if(open(z,k+2))Z.push(z)}}
  if(p.kBB&&k<b){const n=H[k+1];   // BB: an order block that failed and now works the other way
   if(dn(k)&&up(k+1)&&n.c>c.h){let br=-1;for(let q=k+2;q<=j-1;q++)if(H[q].c<c.l){br=q;break}
    if(br>=0){let ok=true;for(let q=br;q<=j-1;q++)if(H[q].c>c.h)ok=false;if(ok)Z.push({t:'BB',kind:'S',bot:c.l,top:c.h,i:c.i0})}}
   if(up(k)&&dn(k+1)&&n.c<c.l){let br=-1;for(let q=k+2;q<=j-1;q++)if(H[q].c>c.h){br=q;break}
    if(br>=0){let ok=true;for(let q=br;q<=j-1;q++)if(H[q].c<c.l)ok=false;if(ok)Z.push({t:'BB',kind:'B',bot:c.l,top:c.h,i:c.i0})}}}
  if((p.kFVG||p.kIFVG)&&k>=a+2){const x=H[k-2],g=H[k];
   if(g.l>x.h){const bot=x.h,top=g.l;   // bullish gap
    let inv=false;for(let q=k+1;q<=j-1;q++)if(H[q].c<bot)inv=true;
    if(inv){if(p.kIFVG){const z={t:'IFVG',kind:'S',bot,top,i:x.i0};let ok=true;for(let q=k+1;q<=j-1;q++)if(H[q].c>top)ok=false;if(ok)Z.push(z)}}
    else if(p.kFVG)Z.push({t:'FVG',kind:'B',bot,top,i:x.i0})}
   if(g.h<x.l){const bot=g.h,top=x.l;   // bearish gap
    let inv=false;for(let q=k+1;q<=j-1;q++)if(H[q].c>top)inv=true;
    if(inv){if(p.kIFVG){const z={t:'IFVG',kind:'B',bot,top,i:x.i0};let ok=true;for(let q=k+1;q<=j-1;q++)if(H[q].c<bot)ok=false;if(ok)Z.push(z)}}
    else if(p.kFVG)Z.push({t:'FVG',kind:'S',bot,top,i:x.i0})}}}
 return Z}
const KLP={klLook:30,kOHP:1,kOLP:1,kRB:1,kOB:1,kFVG:1,kIFVG:1,kBB:1};
function klPick(H,j,ref,b,ex){if(j<3)return null;const rng=ref.h-ref.l;let kz=null;
 for(const z of klZones(H,j,KLP)){const sl=z.top==z.bot?.3*rng:.1*(z.top-z.bot);
  if(b){if(z.kind=='B'&&z.bot<=ref.l+.1*rng&&ex<=z.top&&ex>=z.bot-sl&&(!kz||z.top>kz.top))kz=z}
  else if(z.kind=='S'&&z.top>=ref.h-.1*rng&&ex>=z.bot&&ex<=z.top+sl&&(!kz||z.bot<kz.bot))kz=z}
 return kz}
function crtCalc(d,p){
 const n=d.length,S=[],M=[],bs=n>1?d[1].time-d[0].time:300,hs=p.htfMin*60;
 if(n<10||bs*4>hs)return{lines:[],sigs:S,marks:M,note:'The chart timeframe must be at most a quarter of the high timeframe'};
 const H=[],hi=new Array(n),need=Math.floor(hs/bs*.9),lab=crtHl(p.htfMin);
 for(let i=0;i<n;i++){const k=Math.floor((d[i].time+(p.off||0)*3600)/hs);let h=H[H.length-1];
  if(!h||h.k!=k){h={k,i0:i,o:d[i].open,h:d[i].high,l:d[i].low,c:d[i].close,cnt:0};H.push(h)}
  h.h=Math.max(h.h,d[i].high);h.l=Math.min(h.l,d[i].low);h.c=d[i].close;h.cnt++;hi[i]=H.length-1}
 let live=[],cur=-1,st=null;
 for(let i=0;i<n;i++){
  const c=d[i],j=hi[i];
  live=live.filter(s=>!step(s,c,i));
  if(j!=cur){cur=j;st={hi:-Infinity,lo:Infinity,rsD:-1,rsU:-1,done:false,bear:null,bull:null,ref:j>0&&H[j-1].cnt>=need?H[j-1]:null}}
  st.hi=Math.max(st.hi,c.high);st.lo=Math.min(st.lo,c.low);
  const ref=st.ref;
  if(c.close<c.open){if(st.bear&&st.bear.e==i-1)st.bear.e=i;else st.bear={open:c.open,s:i,e:i}}
  if(c.close>c.open){if(st.bull&&st.bull.e==i-1)st.bull.e=i;else st.bull={open:c.open,s:i,e:i}}
  if(!ref)continue;
  if(st.rsD<0&&c.low<ref.l)st.rsD=i;
  if(st.rsU<0&&c.high>ref.h)st.rsU=i;
  const raidD=st.lo<ref.l,raidU=st.hi>ref.h;
  if(st.done||raidD==raidU)continue;
  let side=null,en=c.close,sl,tp,lv;
  if(raidD&&p.useBuy&&st.bear&&st.bear.e<i&&st.bear.e>=st.rsD&&c.close>st.bear.open&&c.close>ref.l){side='BUY';sl=p.slMode=='pct'?en*(1-p.slPct/100):st.lo*(1-p.slBuf/100);tp=ref.h;lv=st.bear}
  if(raidU&&p.useSell&&st.bull&&st.bull.e<i&&st.bull.e>=st.rsU&&c.close<st.bull.open&&c.close<ref.h){side='SELL';sl=p.slMode=='pct'?en*(1+p.slPct/100):st.hi*(1+p.slBuf/100);tp=ref.l;lv=st.bull}
  if(!side)continue;
  const b=side=='BUY',rr=(b?tp-en:en-tp)/Math.abs(en-sl);
  if(!(rr>0)||rr<p.minRR)continue;
  const kz=klPick(H,j,ref,b,b?st.lo:st.hi);if(p.needKey!==false&&!kz)continue;
  const rm=(b?(ref.h+ref.l)/2-en:en-(ref.h+ref.l)/2)/Math.abs(en-sl),s=mk(d,i,side,en,sl,p.tp1M=='mid'&&rm>0?Math.min(rm,rr):p.tp1R>0?Math.min(p.tp1R,rr):rr,rr);
  s.st='OPEN';s.txt=(b?'BUY':'SELL')+' | '+lab+' CRT + CISD';
  s.why='Reason: '+lab+' CRT. Price raided the previous '+lab+' candle '+(b?'low':'high')+' and came back inside, then CISD confirmed on '+bs/60+'m. Target: '+lab+' '+(b?'CRH':'CRL')+'.';
  s.meta={ref,lv,tp,rr,cs:H[j].i0,bars:Math.round(hs/bs),kz,soup:(()=>{for(let q=H[j].i0;q<=i;q++)if(b?d[q].close<ref.l:d[q].close>ref.h)return'TBS';return'TWS'})()};st.done=true;live.push(s);S.push(s)}

 return{lines:[],sigs:S,marks:M}}
const CRT={id:'crt',name:'CRT: Range, Raid, Run (CISD)',calc:crtCalc,params:[['htfMin','High timeframe in minutes (60 = 1H, 120 = 2H, 240 = 4H, 1440 = 1D)',180],['needKey','Take a trade only when the raid touched a key level',true],['off','Candle alignment offset in hours (2 = broker day starts 22:00 UTC)',2],['slMode','Stop loss: raid = beyond the raid extreme, pct = % of entry','raid',['raid','pct']],['slBuf','SL buffer beyond the raid extreme (%)',0.03],['slPct','SL % of entry (only if mode = pct)',0.15],['tp1M','TP1 target: mid = 50% of the CRT range, R = fixed R','mid',['mid','R']],['tp1R','TP1 in R (when TP1 target = R)',1],['minRR','Minimum RR to the target',1],['ext','Line extension (bars)',7],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};


const pipSz=(si=SYM)=>{const n=SYMS[si][0];return n.startsWith('XAU')?.1:n.startsWith('XAG')?.01:n.includes('JPY')?.01:SYMS[si][3]=='Forex'?.0001:1};
function sigMsg(s,si,d){si=si==null?SYM:si;d=d||D;const b=s.side=='BUY',m=s.meta||{},pz=pipSz(si),pp=v=>SYMS[si][3]=='Crypto'?(Math.abs(v-s.entry)/s.entry*100).toFixed(2)+'%':(Math.abs(v-s.entry)/pz).toFixed(1)+' pips';
 return (b?'🟢 ':'🔴 ')+'<b>'+s.side+' '+SYMS[si][0].replace('/','')+'</b> · '+crtHl(P.crt.htfMin)+' CRT · '+TFN[TFI]+'\n\nEntry: <b>'+f(s.entry)+'</b>\nSL: '+f(s.sl)+' ('+pp(s.sl)+')\nTP1: '+f(s.tp1)+' ('+pp(s.tp1)+')\nTP2: '+f(s.tp2)+' ('+pp(s.tp2)+')\nRR 1:'+(m.rr||s.r2).toFixed(1)+'\n\n🕒 '+tm(d[s.i].time)}
const KLT={FVG:'FVG: விலை வேகமாகச் சென்று விட்டுச் சென்ற இடைவெளி',IFVG:'IFVG: உடைந்த FVG எதிர்த் திசையில் தடை/ஆதரவாக மாறியது',OB:'Order Block: பெரிய ஆர்டர் இருந்த கேண்டில் பகுதி',BB:'Breaker Block: உடைந்த Order Block எதிர்த் திசை மண்டலமாக மாறியது',RB:'Rejection Block: நீண்ட திரி உள்ள கேண்டில், விலை நிராகரித்த இடம்',OHP:'OHP: பழைய உயர்வு எடுக்கப்பட்ட இடம்',OLP:'OLP: பழைய தாழ்வு எடுக்கப்பட்ட இடம்'};
function whyMsg(s,si,d){si=si==null?SYM:si;const m=s.meta||{},b=s.side=='BUY',lab=crtHl(P.crt.htfMin),r=m.ref||{h:0,l:0},k=m.kz;
 return '📌 <b>ஏன் இந்த ட்ரேட்?</b> ('+SYMS[si][0].replace('/','')+' '+s.side+')\n\n'
 +'1️⃣ '+lab+' CRT கேண்டில் வரம்பு அமைத்தது: உயர்வு '+f(r.h)+', தாழ்வு '+f(r.l)+'.\n'
 +'2️⃣ அடுத்த '+lab+' கேண்டில் வரம்பின் '+(b?'தாழ்வை':'உயர்வை')+' உடைத்து (sweep) liquidity எடுத்தது.\n'
 +'🐢 '+(m.soup=='TBS'?'TBS (Turtle Body Soup): கேண்டில் body வரம்புக்கு வெளியே மூடியது, பின் உள்ளே திரும்பியது.':'TWS (Turtle Wick Soup): திரி (wick) மட்டும் வரம்பை உடைத்தது, body வெளியே மூடவில்லை.')+'\n'+'3️⃣ விலை மீண்டும் வரம்புக்குள் திரும்பி '+TFN[TFI]+'-ல் CISD உறுதியானது → '+(b?'வாங்கலாம் (BUY)':'விற்கலாம் (SELL)')+'.\n'
 +'🎯 இலக்கு: '+lab+' CRT '+(b?'உயர்வு':'தாழ்வு')+' '+f(s.tp2)+'.\n'
 +(k?'🔑 Key level: '+KLT[k.t]+' ('+(k.bot==k.top?f(k.bot):f(k.bot)+' – '+f(k.top))+'). Sweep இந்த key level-ஐ தொட்டதால் ட்ரேட் எடுக்கப்பட்டது.':'🔑 Key level: எதுவும் இல்லை, CRT விதிகள் மட்டும் பூர்த்தியானது.')}
function resMsg(s,si,st){const b=s.side=='BUY',nm=SYMS[si][0].replace('/',''),pz=pipSz(si),cr=SYMS[si][3]=='Crypto',
 mv=v=>cr?(Math.abs(v-s.entry)/s.entry*100).toFixed(2)+'%':(Math.abs(v-s.entry)/pz).toFixed(1)+' pips',h=(b?'🟢 ':'🔴 ')+s.side+' '+nm+' · '+crtHl(P.crt.htfMin)+' CRT';
 return st=='TP2'?'🎯 <b>TP2 hit</b> · '+h+'\n+'+mv(s.tp2)
 :st=='SL'?'❌ <b>SL hit</b> · '+h+'\n−'+mv(s.sl)
 :st=='TP1 hit'?'✅ <b>TP1 hit</b> · '+h+'\n+'+mv(s.tp1)+(BE?'\nStop moved to entry (break-even)':'')
 :st=='TP1 then BE'?'⚖️ <b>Closed at break-even after TP1</b> · '+h
 :'⚠️ <b>TP1 hit, then stopped</b> · '+h}

// ---------- bot ----------
const ENV=process.env,TOKEN=ENV.TELEGRAM_BOT_TOKEN||ENV.TELEGRAM_TOKEN||ENV.BOT_TOKEN||'',CHAT=ENV.TELEGRAM_CHAT_ID||ENV.CHAT_ID||'',TD=ENV.TWELVEDATA_KEY||'',LOOP=!!ENV.LOOP;
const FXE=+(ENV.FX_EVERY||4),FXMS=+(ENV.FX_MINUTES||20)*60000;   // forex: every 4th 5-minute run (about 20 min) keeps the free Twelve Data limit
const CRYPTO=['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TRX','AVAX','LINK'],FX=['XAU/USD','EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CAD','USD/CHF','NZD/USD','EUR/JPY','GBP/JPY'];
const DP={};CRT.params.forEach(a=>{DP[a[0]]=a[2]});
const TDI={'1m':'1min','5m':'5min','15m':'15min','30m':'30min','1h':'1h','4h':'4h','1d':'1day'},TFL={'1m':'M1','5m':'M5','15m':'M15','30m':'M30','1h':'H1','4h':'H4','1d':'D1'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),MEM={};
const readJ=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){return d}};
function config(){const c=readJ('config.json',null);if(c&&Array.isArray(c.watches)&&c.watches.length)return c;
 const mk=(sym,src)=>({name:sym.replace('/','')+'-crt',symbol:sym,source:src,tf:'5m',indicator:'crt',params:{...DP,htfMin:120}});
 return{breakEvenAfterTP1:true,maxAgeCandles:3,watches:[...CRYPTO.map(x=>mk(x+'/USD','binance')),...FX.map(x=>mk(x,'twelvedata'))]}}
const ST=readJ('state.json',{sent:{},err:0});ST.sent=ST.sent||{};
let LAST=fs.existsSync('state.json')?fs.readFileSync('state.json','utf8'):'';
function save(){const ks=Object.keys(ST.sent);if(ks.length>400)ks.sort((a,b)=>ST.sent[a].ts-ST.sent[b].ts).slice(0,ks.length-400).forEach(k=>{delete ST.sent[k]});
 const s=JSON.stringify(ST,null,1);if(s!==LAST){fs.writeFileSync('state.json',s);LAST=s}}
async function tg(text){if(!TOKEN||!CHAT){console.log('Telegram is not configured (token or chat id missing)');return false}
 try{const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text,parse_mode:'HTML',disable_web_page_preview:true})}),j=await r.json();if(!j.ok)throw new Error(j.description);return true}
 catch(e){console.log('Telegram error:',e.message);return false}}
async function candles(w){let d;
 if(w.source=='binance'){const r=await fetch('https://data-api.binance.vision/api/v3/klines?symbol='+w.symbol.split('/')[0]+'USDT&interval='+w.tf+'&limit=1000'),a=await r.json();if(!Array.isArray(a))throw new Error('Binance: '+(a.msg||r.status));
  d=a.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4]}))}
 else{if(!TD)throw new Error('TWELVEDATA_KEY secret is missing');
  const r=await fetch('https://api.twelvedata.com/time_series?symbol='+encodeURIComponent(w.symbol)+'&interval='+(TDI[w.tf]||w.tf)+'&outputsize=1500&timezone=UTC&apikey='+TD),j=await r.json();if(j.status=='error'||!j.values)throw new Error('Twelve Data: '+(j.message||'no data'));
  d=j.values.slice().reverse().map(x=>({time:Math.floor(tdT(x.datetime)),open:+x.open,high:+x.high,low:+x.low,close:+x.close}))}
 d.pop();return d}   // the last candle is still forming
// what to send for one pair: a new signal (signal message, then the Tamil reason) and TP1 / TP2 / SL / break-even updates
function analyse(w,si,d,cfg){const pr={...DP,...(w.params||{})};P={crt:pr};TFN=[TFL[w.tf]||w.tf];TFI=0;BE=cfg.breakEvenAfterTP1!==false;SYMS[si]=SYMS[si]||[w.symbol,0,0,w.source=='binance'?'Crypto':'Forex'];
 const sg=CRT.calc(d,pr,H).sigs||[],key=s=>'crt:'+w.symbol+':'+w.tf+':'+d[s.i].time,age=w.source=='binance'?(cfg.maxAgeCandles||3):6,L=sg[sg.length-1],out=[];
 const fresh=L&&d.length-1-L.i<age&&(L.st=='OPEN'||L.st=='TP1 hit')&&!ST.sent[key(L)]?key(L):null;
 if(fresh)out.push({k:fresh,kind:'sig',m:sigMsg(L,si,d)},{k:fresh,kind:'why',m:whyMsg(L,si,d)});
 sg.forEach(s=>{const k=key(s),n=ST.sent[k];if((n||k==fresh)&&s.st!='OPEN'&&(n?n.st:'OPEN')!=s.st)out.push({k,kind:'res',st:s.st,m:resMsg(s,si,s.st)})});
 return out}
async function pass(){const cfg=config(),W=(cfg.watches||[]).filter(w=>!w.indicator||w.indicator=='crt'),errs=[];
 SYMS=W.map(w=>[w.symbol,0,0,w.source=='binance'?'Crypto':'Forex']);
 const slot=Math.floor(Date.now()/300000);let lastTD=0,k=0;
 for(let i=0;i<W.length;i++){const w=W[i];
  if(w.source!='binance'){const due=LOOP?Date.now()-(MEM[w.name]||0)>=FXMS:(slot+k)%FXE==0;k++;if(!due)continue;MEM[w.name]=Date.now();const gap=9000-(Date.now()-lastTD);if(gap>0)await sleep(gap);lastTD=Date.now()}
  try{const d=await candles(w);let skip=null;
   for(const o of analyse(w,i,d,cfg)){if(o.k===skip)continue;const ok=await tg(o.m);
    if(o.kind=='sig'){if(ok)ST.sent[o.k]={st:'OPEN',ts:Date.now()};else skip=o.k}
    else if(o.kind=='res'&&ok)ST.sent[o.k]={st:o.st,ts:Date.now()}}}
  catch(e){errs.push(w.name+': '+e.message)}}
 save();
 if(errs.length&&Date.now()-(ST.err||0)>36e5){ST.err=Date.now();save();await tg('⚠️ Signal bot problem:\n'+errs.slice(0,6).join('\n'))}
 console.log(new Date().toISOString(),'pass done,',W.length,'pairs,',errs.length,'errors')}
module.exports={pass,analyse,ST};
if(require.main===module){(async()=>{if(LOOP){for(;;){try{await pass()}catch(e){console.log(e)}await sleep(6e4)}}else await pass()})()}
