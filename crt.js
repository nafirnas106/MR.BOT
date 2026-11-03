// New indicator file: CRT (Candle Range Theory: Range, Raid, Run). It uses the helpers from indicators.js and is added to the bot in bot.js.
// The previous high-timeframe (HTF) candle is the range (CRH / CRL). When the current HTF candle raids one side of it, the bot waits for CISD on the chart timeframe
// (a close through the open of the last opposite-colour run, back inside the range). Entry = that close, SL = slPct % of the entry price, TP = opposite end of the range.
const {mk,step}=require('./indicators.js').H;
const fmt=v=>v.toFixed(v>=100?2:v>=1?4:6);
const hl=m=>m>=1440?'D':m%60==0?(m/60)+'H':m+'m';
function crt(d,p){
 const n=d.length,S=[],M=[],bs=n>1?d[1].time-d[0].time:300,hs=p.htfMin*60;
 if(n<10||bs*4>hs)return{lines:[],sigs:S,marks:M,note:'The chart timeframe must be at most a quarter of the high timeframe'};
 const H=[],hi=new Array(n),need=Math.floor(hs/bs*.9),lab=hl(p.htfMin);
 for(let i=0;i<n;i++){const k=Math.floor(d[i].time/hs);let h=H[H.length-1];
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
  if(raidD&&p.useBuy&&st.bear&&st.bear.e<i&&st.bear.e>=st.rsD&&c.close>st.bear.open&&c.close>ref.l){side='BUY';sl=en*(1-p.slPct/100);tp=ref.h;lv=st.bear}
  if(raidU&&p.useSell&&st.bull&&st.bull.e<i&&st.bull.e>=st.rsU&&c.close<st.bull.open&&c.close<ref.h){side='SELL';sl=en*(1+p.slPct/100);tp=ref.l;lv=st.bull}
  if(!side)continue;
  const b=side=='BUY',rr=(b?tp-en:en-tp)/Math.abs(en-sl);
  if(!(rr>0)||rr<p.minRR)continue;
  const s=mk(d,i,side,en,sl,p.tp1R>0?Math.min(p.tp1R,rr):rr,rr);
  s.st='OPEN';s.txt=(b?'BUY':'SELL')+' | '+lab+' CRT + CISD';
  s.why='Reason: '+lab+' CRT. Price raided the previous '+lab+' candle '+(b?'low':'high')+' and came back inside, then CISD confirmed on '+bs/60+'m. Target: '+lab+' '+(b?'CRH':'CRL')+'.';
  s.meta={ref,lv,tp,rr};st.done=true;live.push(s);S.push(s)}
 const slp=p.slPct;
 S.forEach(s=>{const m=s.meta,b=s.side=='BUY',e=Math.min(n-1,(s.ei==null?n-1:s.ei)+p.ext),i2=Math.min(n-1,s.i+p.ext),mid=(m.ref.h+m.ref.l)/2,tpp=Math.abs(m.tp-s.entry)/s.entry*100;
  s.dr=[{t:'L',i1:m.ref.i0,e:1,y1:m.ref.h,y2:m.ref.h,c:'fg'},{t:'T',i:e,y:m.ref.h,x:lab+' CRH',c:'fg',dx:4},
   {t:'L',i1:m.ref.i0,e:1,y1:m.ref.l,y2:m.ref.l,c:'fg'},{t:'T',i:e,y:m.ref.l,x:lab+' CRL',c:'fg',dx:4},
   {t:'L',i1:m.ref.i0,e:1,y1:mid,y2:mid,c:'mt'},
   {t:'L',i1:m.lv.s,i2:i2,y1:m.lv.open,y2:m.lv.open,c:'fg'},{t:'T',i:i2,y:m.lv.open,x:b?'BUY':'SELL',c:'fg',dx:4},
   {t:'B',i1:s.i,i2:e,y1:s.entry,y2:m.tp,c:'rgba(207,207,219,.5)',x:'TP '+fmt(m.tp)+' ('+tpp.toFixed(2)+'%)'},
   {t:'B',i1:s.i,i2:e,y1:s.entry,y2:s.sl,c:'rgba(254,199,219,.65)',x:'SL '+fmt(s.sl)+' ('+slp+'%)'},
   {t:'T',i:e,y:s.entry,x:(b?'LONG':'SHORT')+' R:R 1:'+m.rr.toFixed(1),c:'fg',dx:4}]});
 return{lines:[],sigs:S,marks:M}}
const CRT={id:'crt',name:'CRT: Range, Raid, Run (CISD)',calc:crt,params:[['htfMin','High timeframe (minutes: 60, 120, 180, 240...)',120],['slPct','Stop loss / risk (%)',0.15],['tp1R','TP1 in R (0 = no TP1)',1],['minRR','Minimum RR to the target',1],['ext','Line extension (bars)',7],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};
module.exports={CRT};
