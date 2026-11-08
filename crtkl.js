// CRT + Key Level + MSS (rules taken from the reference pictures):
// 1) CRT candle = the previous high-timeframe (HTF) candle with a big body (body is larger than its wicks); CRTH = its high, CRTL = its low.
// 2) The current HTF candle raids one side (wick beyond CRTH or CRTL) and the raid must tag a KEY LEVEL: OHP, OLP, RB, OB, FVG or IFVG (taken from older HTF candles).
// 3) Entry on the chart timeframe when price shifts structure (MSS) back inside the range. SL = beyond the raid extreme, TP = the opposite CRT end.
const {mk,step}=require('./indicators.js').H;
const fmt=v=>v.toFixed(v>=100?2:v>=1?4:6);
const hl=m=>m>=1440?'D':m%60==0?(m/60)+'H':m+'m';
// ---- key levels found on the HTF candles before the CRT candle. kind 'S' = resistance (for SELL), 'B' = support (for BUY)
function zones(H,j,p){
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
function crtkl(d,p){
 const n=d.length,S=[],M=[],bs=n>1?d[1].time-d[0].time:60,hs=p.htfMin*60;
 if(n<10||bs*3>hs)return{lines:[],sigs:S,marks:M,note:'The chart timeframe must be at most a third of the high timeframe (example: 1m or 5m chart with a 15m or 1H CRT)'};
 const H=[],hi=new Array(n),need=Math.floor(hs/bs*.9),lab=hl(p.htfMin);
 for(let i=0;i<n;i++){const k=Math.floor(d[i].time/hs);let h=H[H.length-1];
  if(!h||h.k!=k){h={k,i0:i,o:d[i].open,h:d[i].high,l:d[i].low,c:d[i].close,cnt:0};H.push(h)}
  h.h=Math.max(h.h,d[i].high);h.l=Math.min(h.l,d[i].low);h.c=d[i].close;h.cnt++;hi[i]=H.length-1}
 let live=[],cur=-1,st=null;const pl=[],ph=[];
 for(let i=0;i<n;i++){
  const c=d[i],j=hi[i];
  live=live.filter(s=>!step(s,c,i));
  // confirmed LTF swing points (pivot strength p.mss)
  const m=i-p.mss;
  if(m>=p.mss){let isL=true,isH=true;for(let q=m-p.mss;q<=i;q++){if(q==m)continue;if(d[q].low<d[m].low)isL=false;if(d[q].high>d[m].high)isH=false}
   if(isL)pl.push({i:m,v:d[m].low});if(isH)ph.push({i:m,v:d[m].high})}
  if(j!=cur){cur=j;st={i0:H[j].i0,hi:-Infinity,lo:Infinity,hiI:-1,loI:-1,done:false,ref:null,Z:[]};
   const r=j>0?H[j-1]:null;
   st.pr=r&&r.cnt>=need?Math.abs(r.c-r.o)/((r.h-r.l)||1)*100:null;
   if(r&&r.cnt>=need){const rng=r.h-r.l,body=Math.abs(r.c-r.o);
    if(rng>0&&body>=p.bodyPct/100*rng){st.ref=r;st.bull=r.c>r.o;st.Z=j>=3?zones(H,j,p):[]}}}
  if(c.high>st.hi){st.hi=c.high;st.hiI=i}
  if(c.low<st.lo){st.lo=c.low;st.loI=i}
  const ref=st.ref;if(!ref||st.done)continue;
  const rng=ref.h-ref.l,raidU=st.hi>ref.h,raidD=st.lo<ref.l;
  if(raidU==raidD)continue;
  let side=null,sl,tp,kz=null,lvl=null;
  if(raidU&&p.useSell&&(!p.dirMatch||st.bull)&&c.close<ref.h&&i>st.hiI){
   for(const z of st.Z)if(z.kind=='S'&&z.top>=ref.h-.1*rng&&st.hi>=z.bot&&st.hi<=z.top+p.kTol/100*rng&&(!kz||z.bot<kz.bot))kz=z;
   if(kz||!p.needKey){for(let q=pl.length-1;q>=0;q--){if(pl[q].i<st.hiI&&pl[q].i>=st.i0){lvl=pl[q];break}}
    if(lvl&&c.close<lvl.v){side='SELL';sl=st.hi*(1+p.slBuf/100);tp=ref.l}}}
  if(raidD&&p.useBuy&&(!p.dirMatch||!st.bull)&&c.close>ref.l&&i>st.loI){
   for(const z of st.Z)if(z.kind=='B'&&z.bot<=ref.l+.1*rng&&st.lo<=z.top&&st.lo>=z.bot-p.kTol/100*rng&&(!kz||z.top>kz.top))kz=z;
   if(kz||!p.needKey){for(let q=ph.length-1;q>=0;q--){if(ph[q].i<st.loI&&ph[q].i>=st.i0){lvl=ph[q];break}}
    if(lvl&&c.close>lvl.v){side='BUY';sl=st.lo*(1-p.slBuf/100);tp=ref.h}}}
  if(!side)continue;
  const en=c.close,b=side=='BUY',risk=Math.abs(en-sl);if(!(risk>0))continue;
  const rr=(b?tp-en:en-tp)/risk;if(!(rr>0)||rr<p.minRR)continue;
  const s=mk(d,i,side,en,sl,p.tp1R>0?Math.min(p.tp1R,rr):rr,rr);
  s.st='OPEN';s.txt=(b?'BUY':'SELL')+' | '+lab+' CRT + '+(kz?kz.t:'MSS');
  s.why='Reason: '+lab+' CRT. Price raided the CRT candle '+(b?'low':'high')+(kz?' at a '+kz.t+' key level':'')+', then MSS confirmed on '+bs/60+'m. Target: '+lab+' '+(b?'CRTH':'CRTL')+'.';
  s.meta={ref,kz,lvl,tp,rr,hiI:b?st.loI:st.hiI};st.done=true;live.push(s);S.push(s)}
 S.forEach(s=>{const m=s.meta,b=s.side=='BUY',e=Math.min(n-1,(s.ei==null?n-1:s.ei)+p.ext),mid=(m.ref.h+m.ref.l)/2,tpp=Math.abs(m.tp-s.entry)/s.entry*100;
  s.dr=[{t:'L',i1:m.ref.i0,e:1,y1:m.ref.h,y2:m.ref.h,c:'fg'},{t:'T',i:e,y:m.ref.h,x:'CRTH',c:'fg',dx:4},
   {t:'L',i1:m.ref.i0,e:1,y1:m.ref.l,y2:m.ref.l,c:'fg'},{t:'T',i:e,y:m.ref.l,x:'CRTL',c:'fg',dx:4},
   {t:'L',i1:m.ref.i0,e:1,y1:mid,y2:mid,c:'mt',dash:[4,4]}];
  if(m.kz)s.dr.push({t:'B',i1:Math.max(0,m.kz.i),e:1,y1:m.kz.bot,y2:m.kz.top==m.kz.bot?m.kz.top+(m.ref.h-m.ref.l)*.04:m.kz.top,c:KC[m.kz.t],x:m.kz.t});
  s.dr.push({t:'L',i1:m.lvl.i,i2:s.i,y1:m.lvl.v,y2:m.lvl.v,c:'fg'},{t:'T',i:s.i,y:m.lvl.v,x:'Mss',c:'fg',dx:6},
   {t:'B',i1:s.i,i2:e,y1:s.entry,y2:m.tp,c:'rgba(240,160,185,.28)',x:'TP '+fmt(m.tp)+' ('+tpp.toFixed(2)+'%)'},
   {t:'B',i1:s.i,i2:e,y1:s.entry,y2:s.sl,c:'rgba(110,160,125,.30)',x:'SL '+fmt(s.sl)+' ('+(Math.abs(s.sl-s.entry)/s.entry*100).toFixed(2)+'%)'},
   {t:'T',i:e,y:s.entry,x:(b?'LONG':'SHORT')+' R:R 1:'+m.rr.toFixed(1),c:'fg',dx:4})});
 let note='';
 if(st){const u=lab+' CRT';
  if(st.pr==null)note=u+': not enough candles for the previous '+lab+' candle';
  else if(!st.ref)note=u+': previous candle body is only '+st.pr.toFixed(0)+'% (need '+p.bodyPct+'%), waiting for a stronger CRT candle';
  else{const rU=st.hi>st.ref.h,rD=st.lo<st.ref.l;
   note=u+' ready ('+(st.bull?'bullish':'bearish')+' candle, body '+st.pr.toFixed(0)+'%) | CRTH '+fmt(st.ref.h)+' CRTL '+fmt(st.ref.l)+' | raid: '+(rU&&rD?'both sides, ignored':rU?'high':rD?'low':'not yet')+' | key levels: '+st.Z.length+(st.done?' | signal taken':'')}}
 return{lines:[],sigs:S,marks:M,note}}
const KC={OHP:'rgba(150,110,120,.20)',OLP:'rgba(150,110,120,.20)',OB:'rgba(130,185,140,.32)',FVG:'rgba(110,200,215,.30)',IFVG:'rgba(250,190,120,.30)',RB:'rgba(150,190,240,.28)'};
const CRTKL={id:'crtkl',name:'CRT + Key Level + MSS',calc:crtkl,params:[['htfMin','High timeframe (minutes: 15, 60, 120...)',15],['bodyPct','CRT candle: minimum body % of its range',60],['dirMatch','CRT candle colour must match the raid side',true],['needKey','Require a key level at the raid',true],['kOHP','Key level: OHP (old high purge)',true],['kOLP','Key level: OLP (old low purge)',true],['kRB','Key level: RB (rejection block)',true],['kOB','Key level: OB (order block)',true],['kFVG','Key level: FVG',true],['kIFVG','Key level: IFVG',true],['klLook','Key level look-back (HTF candles)',30],['kTol','Raid may go beyond the key level by (% of CRT range)',30],['mss','MSS swing strength (bars)',2],['slBuf','SL buffer beyond the raid extreme (%)',0.03],['tp1R','TP1 in R (0 = no TP1)',1],['minRR','Minimum RR to the target',1],['ext','Line extension (bars)',7],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};
module.exports={CRTKL};
