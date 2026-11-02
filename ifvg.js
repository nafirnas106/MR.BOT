// New indicator file: 8AM range + KL sweep + IFVG. It uses the helpers from indicators.js and is added to the bot in bot.js.
const {atr,mk,step}=require('./indicators.js').H;
// 8AM range + KL sweep + 1m IFVG: range = high/low of the 1H candle at rangeH (chosen timezone) -> KL near it -> one end swept inside the window
// -> FVG forms -> a candle closes through it (IFVG) -> entry, SL beyond the sweep, TP2 = opposite end of the range. Sell side runs on mirrored prices.
function nyInfo(d,tz){let f;try{f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){f=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
 return d.map(x=>{const o={};f.formatToParts(new Date(x.time*1000)).forEach(q=>{o[q.type]=q.value});return{h:+o.hour%24,k:o.year+'-'+o.month+'-'+o.day}})}
function ifvg8(d,p){
 const n=d.length,S=[],M=[],bs=n>1?d[1].time-d[0].time:60;
 if(n<30||bs>300)return{lines:[],sigs:S,marks:M,note:'This indicator needs a chart of 5m or lower'};
 const A=atr(d,14),T=nyInfo(d,p.tz),need=Math.floor(3600/bs*.9),pre0=Math.max(0,p.rangeH-p.klHrs),
  E=[d,d.map(x=>({open:-x.open,high:-x.low,low:-x.high,close:-x.close}))],
  lab=(p.rangeH%12||12)+(p.rangeH<12?'am':'pm');
 let act=0,cur=null,old=[],D=null,pl=[Infinity,Infinity];
 for(let i=0;i<n;i++){
  const h=T[i].h,a=A[i],inPre=h>=pre0&&h<p.rangeH,wasPre=i>0&&T[i-1].h>=pre0&&T[i-1].h<p.rangeH;
  old=old.filter(s=>!step(s,d[i],i));
  const was=act;if(act&&cur&&cur.i<i&&step(cur,d[i],i))act=0;
  if(inPre){if(!wasPre)pl=[Infinity,Infinity];for(let k=0;k<2;k++)pl[k]=Math.min(pl[k],E[k][i].low)}
  if(h==p.rangeH&&(i==0||T[i-1].h!=p.rangeH)){
   if(act&&cur){old.push(cur);act=0}
   D={k:T[i].k,rs:i,re:-1,cnt:0,fin:false,ready:false,side:-1,tr:0,pl:pl.slice(),R:[0,1].map(()=>({hi:-Infinity,lo:Infinity,kl:NaN})),
    X:[0,1].map(()=>({ext:NaN,gT:NaN,gB:NaN,gI:-1})),hiR:-Infinity,loR:Infinity}}
  if(!D)continue;
  if(h==p.rangeH&&!D.fin){D.cnt++;D.hiR=Math.max(D.hiR,d[i].high);D.loR=Math.min(D.loR,d[i].low);for(let k=0;k<2;k++){D.R[k].hi=Math.max(D.R[k].hi,E[k][i].high);D.R[k].lo=Math.min(D.R[k].lo,E[k][i].low)}}
  else if(!D.fin){
   D.fin=true;D.re=i;D.ready=D.cnt>=need&&D.hiR>D.loR;
   if(D.ready){const tol=(D.R[0].hi-D.R[0].lo)*p.klTol/100;
    for(let k=0;k<2;k++){const r=D.R[k],q=D.pl[k];r.kl=(q<r.lo&&r.lo-q<=tol)?q:r.lo}}}
  if(!D.ready||T[i].k!=D.k||h<p.startH||h>=p.endH)continue;
  if(D.side<0){const sw=[0,1].map(k=>E[k][i].low<(p.needKL?D.R[k].kl:D.R[k].lo));
   if(sw[0]!=sw[1]){const k=sw[0]?0:1;if(k?p.useSell:p.useBuy){D.side=k;D.X[k].ext=E[k][i].low}}}
  const k=D.side;if(k<0)continue;
  const x=D.X[k],e=E[k],c=e[i],g=k?-1:1;
  x.ext=Math.min(x.ext,c.low);
  const sl=x.ext-p.buf*a,en=c.close,r=en-sl,rew=D.R[k].hi-en;
  const sg=!was&&D.tr<p.maxTr&&!isNaN(x.gT)&&i-x.gI<=p.fvgAge&&c.close>x.gT&&(!p.needBody||c.close>c.open)&&r>0&&rew>=p.minRR*r;
  if(sg){const r2=rew/r,r1=Math.min(p.rr1,r2);
   cur=mk(d,i,k?'SELL':'BUY',g*en,g*sl,r1,r2);cur.st='OPEN';cur.txt=(k?'SELL':'BUY')+' | '+lab+' sweep + IFVG';
   cur.why='Reason: '+lab+' range '+(k?'high':'low')+' + KL swept, then '+bs/60+'m IFVG confirmed. Target: '+lab+' '+(k?'low':'high')+'.';
   const kl=g*D.R[k].kl,yS=g*D.R[k].lo,yT=g*D.R[k].hi,fg=x.gI-2;
   cur.dr=[{t:'L',i1:D.rs,e:1,y1:D.hiR,y2:D.hiR,c:'mt'},{t:'T',i:D.re,y:D.hiR,x:lab+' high',c:'mt',dx:4},{t:'L',i1:D.rs,e:1,y1:D.loR,y2:D.loR,c:'mt'},{t:'T',i:D.re,y:D.loR,x:lab+' low',c:'mt',dx:4}];
   if(kl!=yS)cur.dr.push({t:'L',i1:D.rs,e:1,y1:kl,y2:kl,c:'fg'},{t:'T',i:D.re,y:kl,x:'KL',c:'fg',dx:4});
   cur.dr.push({t:'B',i1:fg,i2:i,y1:g*x.gT,y2:g*x.gB,c:'rgba(217,167,96,.24)',x:'IFVG'});
   act=1;D.tr++;S.push(cur);x.gT=x.gB=NaN;x.gI=-1;continue}
  if(i>=2&&c.high<e[i-2].low&&e[i-2].low-c.high>=p.fvgMin*a){x.gT=e[i-2].low;x.gB=c.high;x.gI=i}
 }
 return{lines:[],sigs:S,marks:M}}
const IFV={id:'ifv',name:'8AM Range + KL Sweep + IFVG',calc:ifvg8,params:[['tz','Timezone','America/New_York',['America/New_York','Europe/London','Asia/Colombo','UTC']],['rangeH','Range candle hour (1H)',8],['startH','Trade window start hour',9],['endH','Trade window end hour',12],['klHrs','KL lookback hours before range',6],['klTol','KL max distance (% of range candle)',100],['needKL','Sweep must clear KL (if KL found)',true],['fvgMin','Min FVG size x ATR',.05],['fvgAge','Max bars: FVG to entry',60],['needBody','Entry candle must close in trade direction',true],['maxTr','Max trades per day',2],['buf','SL buffer x ATR',.1],['rr1','TP1 (R)',1],['minRR','Min RR to TP2 (opposite range end)',1.5],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};
module.exports={IFV};
