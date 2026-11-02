// Indicator maths shared with the website (same code). Do not edit by hand.
'use strict';
let BE=true;
const ema=(a,n)=>{const k=2/(n+1);let p=a[0];return a.map((v,i)=>i?(p=v*k+p*(1-k)):v)};
const rsi=(c,n)=>{let g=0,l=0;return c.map((v,i)=>{if(!i)return 50;const d=v-c[i-1],u=Math.max(d,0),w=Math.max(-d,0);if(i<=n){g+=u/n;l+=w/n}else{g=(g*(n-1)+u)/n;l=(l*(n-1)+w)/n}return l?100-100/(1+g/l):100})};
const atr=(d,n)=>{let p=0;return d.map((x,i)=>{const tr=i?Math.max(x.high-x.low,Math.abs(x.high-d[i-1].close),Math.abs(x.low-d[i-1].close)):x.high-x.low;return p=i<n?(p*i+tr)/(i+1):(p*(n-1)+tr)/n})};
const mk=(d,i,side,en,sl,r1,r2)=>{const s=side=='BUY'?1:-1,r=Math.abs(en-sl);return{i,side,entry:en,sl,tp1:en+s*r1*r,tp2:en+s*r2*r,r1,r2,t1:0}};
function step(s,x,j){const b=s.side=='BUY';
 const sv=(s.t1&&BE)?s.entry:s.sl;if(b?x.low<=sv:x.high>=sv){s.st=s.t1?(BE?'TP1 then BE':'TP1 then SL'):'SL';s.R=s.t1?(BE?.5*s.r1:.5*s.r1-.5):-1;s.ei=j;return 1}
 if(b?x.high>=s.tp2:x.low<=s.tp2){s.st='TP2';s.R=.5*s.r1+.5*s.r2;s.ei=j;if(!s.t1)s.t1i=j;return 1}
 if(!s.t1&&(b?x.high>=s.tp1:x.low<=s.tp1)){s.t1=1;s.t1i=j;s.st='TP1 hit'}}
const H={ema,rsi,atr,mk,step};
const fx=v=>v.toFixed(v>=100?2:v>=1?4:v>=.01?6:8);
function trend(d,p){const U=[],N=[],b=[];d.forEach(x=>{const k=Math.floor(x.time/3600);if(b.length&&b[b.length-1].k==k)b[b.length-1].c=x.close;else b.push({k,c:x.close})});
 const f=ema(b.map(x=>x.c),p.emaF),s=ema(b.map(x=>x.c),p.emaS);let j=-1;
 d.forEach(x=>{const k=Math.floor(x.time/3600);while(j+1<b.length&&b[j+1].k<k)j++;U.push(j>=0&&f[j]>s[j]);N.push(j>=0&&f[j]<s[j])});return[U,N]}
// Liquidity sweep > BOS / trendline break > FVG or OB retest. The sell side runs on mirrored prices.
function liq(d,p){
 const n=d.length,A=atr(d,14),sw=Math.max(2,p.sw|0),S=[],M=[],T=trend(d,p),
 E=[d,d.map(x=>({open:-x.open,high:-x.low,low:-x.high,close:-x.close}))],
 X=[0,1].map(()=>({h1:null,h2:null,l1:null,l2:null,hi1:0,hi2:0,li1:0,li2:0,lSw:0,dT:null,dB:null,dI:-1,st:0,swL:0,br:0,m:null,ts:null,ty:0,tx:0,fT:null,fB:null,fF:0,oT:null,oB:null,cf:0}));
 let act=0,cur=null;
 for(let i=0;i<n;i++){
  const a=A[i],s0=[X[0].st,X[1].st],sp=[0,0],nw=[0,0],cand=[null,null];
  for(let k=0;k<2;k++){const x=X[k],e=E[k],c=e[i];
   if(i>=2*sw){const m=i-sw,Hh=e[m].high,L=e[m].low;let ph=1,pl=1;
    for(let q=m-sw;q<=i;q++){if(q==m)continue;if(q<m?e[q].high>Hh:e[q].high>=Hh)ph=0;if(q<m?e[q].low<L:e[q].low<=L)pl=0}
    if(ph){x.h2=x.h1;x.hi2=x.hi1;x.h1=Hh;x.hi1=m}
    if(pl){x.l2=x.l1;x.li2=x.li1;x.l1=L;x.li1=m;x.lSw=0}}
   if(c.close<c.open){x.dT=p.obBody?c.open:c.high;x.dB=p.obBody?c.close:c.low;x.dI=i}}
  for(let k=0;k<2;k++){const x=X[k],c=E[k][i];
   if(!act&&s0[k]==0&&!(k&&sp[0])&&!x.lSw&&x.l1!=null&&x.h1!=null&&c.low<x.l1){sp[k]=1;x.lSw=1;M.push({i,k})}}
  for(let k=0;k<2;k++){const x=X[k],e=E[k],c=e[i],up=c.close>c.open;
   if(sp[k]){x.swL=c.low;x.br=i;x.m=x.h1;x.ssl=x.l1;x.pv=x.li1;x.mx=x.hi1;x.ts=(x.h2!=null&&x.h1<x.h2&&x.hi1!=x.hi2)?(x.h1-x.h2)/(x.hi1-x.hi2):null;x.ty=x.h1;x.tx=x.hi1;x.fT=x.fB=x.oT=x.oB=null}
   else if(s0[k]>=1)x.swL=Math.min(x.swL,c.low);
   const tl=x.ts==null?null:x.ty+x.ts*(i-x.tx),
    bos=s0[k]==1&&i>x.br&&x.m!=null&&c.close>x.m&&up,
    tlb=s0[k]==1&&i>x.br&&tl!=null&&c.close>tl&&up,
    cf=p.cfm=='BOS'?bos:p.cfm=='Trendline'?tlb:(bos||tlb),
    lvl=bos?x.m:tl,
    fr=(lvl!=null&&c.high>lvl&&c.high>c.low)?(c.high-Math.max(lvl,c.low))/(c.high-c.low):0;
   if(cf&&s0[k]==1&&(!p.strong||fr*100>=p.strongPct)){nw[k]=1;const ok=x.dI>=x.br;x.oT=ok?x.dT:null;x.oB=ok?x.dB:null;x.cf=i;x.ck=bos?1:2}
   if(s0[k]>=1&&i>=2&&i-2>=x.br&&c.low>e[i-2].high&&e[i-1].close>e[i-1].open){x.fT=c.low;x.fB=e[i-2].high;x.fF=i}
   const fh=s0[k]==2&&x.fT!=null&&i>x.fF&&c.low<=x.fT&&c.close>x.fB,
    oh=s0[k]==2&&x.oT!=null&&i>x.cf&&c.low<=x.oT&&c.close>x.oB,uF=p.entM!='OB',uO=p.entM!='FVG';
   if(((uF&&fh)||(uO&&oh))&&!act){const en=Math.min((uF&&fh)?x.fT:x.oT,c.close),sl=x.swL-p.buf*a,r=en-sl;
    if(r>.2*a&&r<=p.maxRisk*a&&(!p.trend||T[k][i]))cand[k]={en,sl,F:uF&&fh,zt:(uF&&fh)?x.fT:x.oT,zb:(uF&&fh)?x.fB:x.oB}}}
  const k0=cand[0]?0:cand[1]?1:-1,sg=k0>=0;
  for(let k=0;k<2;k++){const x=X[k],fail=s0[k]>=1&&i-x.br>p.age;
   if(sg||fail)x.st=0;if(sp[k])x.st=1;if(nw[k]&&!fail&&!sg)x.st=2}
  if(act){if(step(cur,d[i],i))act=0}
  else if(sg){const c=cand[k0];cur=mk(d,i,k0?'SELL':'BUY',k0?-c.en:c.en,k0?-c.sl:c.sl,p.rr1,p.rr2);cur.st='OPEN';const x=X[k0],g=k0?-1:1;cur.v={pv:x.pv,br:x.br,ssl:g*x.ssl,mx:x.mx,m:g*x.m,cf:x.cf,ck:x.ck,tx:x.tx,ty:g*x.ty,ts:x.ts==null?null:g*x.ts};cur.txt=(k0?'SELL':'BUY')+' | '+(x.ck==1?'BOS':'TL break')+' | '+(c.F?'FVG':'OB');
   {const zA=g*c.zt,zB=g*c.zb,zn=c.F?'FVG':'order block',bu=!k0,sxl=fx(g*x.ssl),bm=fx(g*x.m),za=fx(Math.min(zA,zB))+' – '+fx(Math.max(zA,zB));
    cur.zone={lo:Math.min(zA,zB),hi:Math.max(zA,zB),lvl:g*c.zt,hit:'touched the edge of the '+zn};
    cur.why={en:[(bu?'Price swept the sell-side liquidity: it went below the swing low '+sxl+'.':'Price swept the buy-side liquidity: it went above the swing high '+sxl+'.'),(x.ck==1?'Then price closed '+(bu?'above ':'below ')+bm+' = Break of Structure (BOS), so the move reversed.':'Then price broke the trend line = confirmation that the move reversed.'),'Price came back and touched the '+zn+' ('+za+') = ENTRY.','Stop loss is beyond the sweep extreme. TP1 = '+p.rr1+'R, TP2 = '+p.rr2+'R.'],
     ta:[(bu?'விலை கீழே இருந்த liquidity-யை (swing low '+sxl+') உடைத்து எடுத்தது (sweep).':'விலை மேலே இருந்த liquidity-யை (swing high '+sxl+') உடைத்து எடுத்தது (sweep).'),(x.ck==1?'பிறகு விலை '+bm+'-க்கு '+(bu?'மேலே':'கீழே')+' மூடியது = BOS (அமைப்பு உடைப்பு), திசை மாறியது.':'பிறகு trend line உடைந்தது = திசை மாறியதற்கான உறுதி.'),'விலை திரும்பி வந்து '+(c.F?'FVG':'order block')+' மண்டலத்தை ('+za+') தொட்டது = ENTRY.','SL: sweep-ன் தீவிர முனைக்கு அப்பால். TP1 = '+p.rr1+'R, TP2 = '+p.rr2+'R.']}}act=1;S.push(cur)}
 }
 return{lines:[],sigs:S,marks:M,x:extra(d,p,A)}}
const LIQ={id:'liq',name:'Liquidity BOS FVG OB',calc:liq,params:[
 ['sw','Swing length',5],['age','Max bars sweep to entry',40],['cfm','Confirmation','Either',['BOS','Trendline','Either']],['entM','Entry zone','FVG or OB',['FVG','OB','FVG or OB']],
 ['obBody','OB body only',false],['strong','Strong BOS candle',true],['strongPct','Strong breakout %',62],['rr1','TP1 (R)',1],['rr2','TP2 (R)',2],['buf','SL buffer x ATR',.1],['maxRisk','Max risk x ATR',3],
 ['trend','Only with 1H trend',false],['emaF','Trend EMA fast',20],['emaS','Trend EMA slow',50],['showZ','Show FVG / OB zones',true],['maxZ','Max zone size x ATR',2],['minZ','Min zone size x ATR',.15],['showLq','Show old liquidity (BSL / SSL)',true],['showTL','Show trend lines',true],['showEP','Show Entry / SL / TP boxes',true]]};

function pivH(e,i,len){const m=i-len;if(m<len)return NaN;const h=e[m].high;for(let q=m-len;q<=i;q++){if(q==m)continue;if(q<m?e[q].high>h:e[q].high>=h)return NaN}return h}
function pivL(e,i,len){const m=i-len;if(m<len)return NaN;const l=e[m].low;for(let q=m-len;q<=i;q++){if(q==m)continue;if(q<m?e[q].low<l:e[q].low<=l)return NaN}return l}
function htf(d,sec){const b=[];d.forEach(x=>{const k=Math.floor(x.time/sec);if(b.length&&b[b.length-1].k==k)b[b.length-1].c=x.close;else b.push({k,c:x.close})});
 const cs=b.map(x=>x.c),e20=ema(cs,20),e50=ema(cs,50);let j=-1;
 return d.map(x=>{const k=Math.floor(x.time/sec);while(j+1<b.length&&b[j+1].k<k)j++;if(j<0)return'N';return cs[j]>e50[j]&&e20[j]>e50[j]?'B':cs[j]<e50[j]&&e20[j]<e50[j]?'R':'N'})}
// BOS + IDM + Order Block. The sell side runs on mirrored prices (same trick as the liquidity model).
function bosidm(d,p){
 const n=d.length,A=atr(d,14),S=[],M=[];
 if(n<30||d[1].time-d[0].time>900)return{lines:[],sigs:S,marks:M,note:'This indicator needs a chart of 15m or lower'};
 const md=p.mode,mD=md=='Strict'?.6:md=='More signals'?.1:.3,mL=md=='Strict'?2:md=='More signals'?.5:1,mR=md=='Strict'?2:md=='More signals'?1:1.2,
  needRej=md=='Strict',allowRs=md!='Strict',idmOpt=md=='More signals',tr=p.trFilter=='Off'?null:[htf(d,14400),htf(d,3600)],
  okT=(k,i)=>{if(!tr)return true;const a=(p.trFilter=='Trend 2'?tr[1]:tr[0])[i];return k?a!='B':a!='R'},
  E=[d,d.map(x=>({open:-x.open,high:-x.low,low:-x.high,close:-x.close}))],
  X=[0,1].map(()=>({sw:NaN,swb:NaN,lpV:NaN,lpB:NaN,lg:NaN,cH:NaN,cL:NaN,cB:NaN,dH:NaN,dL:NaN,dB:NaN,st:0,bLv:NaN,bLb:NaN,bB:NaN,obH:NaN,obL:NaN,obB:NaN,org:NaN,lx:NaN,lxB:NaN,idm:NaN,idmB:NaN,idmT:NaN}));
 let act=0,cur=null;
 for(let i=0;i<n;i++){
  const a=A[i],pv=[],bf=[0,0],s0=[X[0].st,X[1].st],cand=[null,null];
  for(let k=0;k<2;k++){const x=X[k],e=E[k],c=e[i];
   pv[k]={pH:pivH(e,i,p.sl),qL:pivL(e,i,p.il)};
   if(c.close<c.open){x.dH=c.high;x.dL=c.low;x.dB=i}
   if(!isNaN(pv[k].pH)||isNaN(x.lg)||c.low<x.lg){x.lg=c.low;x.cH=x.dH;x.cL=x.dL;x.cB=x.dB}}
  for(const k of [1,0]){const x=X[k],e=E[k],c=e[i],qL=pv[k].qL,s=s0[k],up=c.close>c.open,use=k?p.useSell:p.useBuy;
   const bos=!!use&&!act&&s==0&&!isNaN(x.sw)&&!isNaN(x.lg)&&!isNaN(x.cH)&&c.close>x.sw&&i>0&&e[i-1].close<=x.sw&&i-x.swb<=p.bosAge&&(c.close-c.open)>=mD*a&&(x.sw-x.lg)>=mL*a;
   bf[k]=bos;
   if(bos){x.bLv=x.sw;x.bLb=x.swb;x.bB=i;x.obH=x.cH;x.obL=x.cL;x.obB=x.cB;x.org=x.lg}
   const nh=s>=1&&i>x.bB&&c.high>x.lx,rs=nh&&s==2&&allowRs;
   if(bos||nh){x.lx=c.high;x.lxB=i}
   if(bos){x.idm=NaN;x.idmB=NaN}else if(nh&&(s==1||rs)&&x.lpB>x.bB){x.idm=x.lpV;x.idmB=x.lpB}
   if((s==1||rs)&&!isNaN(qL)&&(i-p.il)>x.bB&&(i-p.il)<x.lxB){x.idm=qL;x.idmB=i-p.il}
   const ok=!isNaN(x.idm)&&x.idm>x.obH,tk=s==1&&ok&&i>x.lxB&&c.low<x.idm;
   if(tk)x.idmT=i;
   const dn=s==2||tk||(idmOpt&&!ok),sh=ok&&(s==2||tk),
    touch=dn&&i>x.bB&&i>x.lxB&&c.low<=x.obH&&c.close>x.obL&&(!needRej||up),
    en=Math.min(x.obH,c.close),sl=Math.min(x.obL,x.org)-p.buf*a,r=en-sl;
   const sg=!act&&touch&&!(k==0&&cand[1])&&okT(k,i)&&en<x.lx&&r>.2*a&&r<=p.maxRisk*a&&(x.lx-en)>=mR*r;
   const fail=s>=1&&(i-x.bB>p.age||c.close<x.obL||c.low<x.org||(s==2&&nh&&!allowRs)||touch||(s==1&&c.low<=x.obH&&!dn));
   if(sg||fail)x.st=0;if(bos)x.st=1;if(tk&&!fail&&!sg)x.st=2;if(rs&&!fail&&!sg)x.st=1;
   if(sg)cand[k]={en,sl,sh,x:{...x}}}
  for(let k=0;k<2;k++){const x=X[k],q=pv[k];
   if(bf[k])x.sw=NaN;if(!isNaN(q.pH)){x.sw=q.pH;x.swb=i-p.sl}if(!isNaN(q.qL)){x.lpV=q.qL;x.lpB=i-p.il}}
  const k0=cand[1]?1:cand[0]?0:-1;
  if(act){if(step(cur,d[i],i))act=0}
  else if(k0>=0){const c=cand[k0],g=k0?-1:1,x=c.x,en=g*c.en,sl=g*c.sl,t2=g*x.lx,r=Math.abs(en-sl),t1=en+(t2-en)*p.tp1Pct;
   cur=mk(d,i,k0?'SELL':'BUY',en,sl,Math.abs(t1-en)/r,Math.abs(t2-en)/r);cur.st='OPEN';cur.txt=(k0?'SELL':'BUY')+' | OB'+(c.sh?' + IDM':'');
   {const bu=!k0,zl=Math.min(g*x.obH,g*x.obL),zh=Math.max(g*x.obH,g*x.obL),za=fx(zl)+' – '+fx(zh);
    cur.zone={lo:zl,hi:zh,lvl:g*x.obH,hit:'touched the order block'};
    cur.why={en:['Price broke '+(bu?'above the swing high ':'below the swing low ')+fx(g*x.bLv)+' with a strong candle = BOS.',(c.sh?'The inducement (IDM) at '+fx(g*x.idm)+' was swept: the small trap was cleared.':'The IDM step was skipped in this signal mode.'),'Price returned to the order block '+za+' and touched it = ENTRY.','Stop loss is beyond the OB. TP2 = '+fx(t2)+' (the liquidity on the other side). TP1 is '+Math.round(p.tp1Pct*100)+'% of the way.'],
     ta:['விலை '+(bu?'swing high ':'swing low ')+fx(g*x.bLv)+'-ஐ '+(bu?'மேலே':'கீழே')+' வலுவான கேண்டிலால் உடைத்தது = BOS.',(c.sh?'Inducement (IDM) '+fx(g*x.idm)+' உடைத்து எடுக்கப்பட்டது (சிறிய பொறி அகன்றது).':'இந்த signal mode-ல் IDM படி தவிர்க்கப்பட்டது.'),'விலை திரும்பி order block ('+za+') மண்டலத்தைத் தொட்டது = ENTRY.','SL: OB-க்கு அப்பால். TP2 = '+fx(t2)+' (மறுபக்க liquidity). TP1 = வழியில் '+Math.round(p.tp1Pct*100)+'%.']}}
   cur.dr=[{t:'B',i1:x.obB,e:1,y1:g*x.obH,y2:g*x.obL,c:k0?'rgba(176,80,80,.22)':'rgba(74,138,90,.22)',x:k0?'Bearish OB':'Bullish OB'},
    {t:'L',i1:x.bLb,i2:x.bB,y1:g*x.bLv,y2:g*x.bLv,c:'mt'},{t:'T',i:Math.round((x.bLb+x.bB)/2),y:g*x.bLv,x:'BOS',c:'mt',dx:0}];
   if(c.sh&&!isNaN(x.idm))cur.dr.push({t:'L',i1:x.idmB,i2:x.idmT,y1:g*x.idm,y2:g*x.idm,c:'mt'},{t:'T',i:Math.round((x.idmB+x.idmT)/2),y:g*x.idm,x:'IDM',c:'mt',dx:0});
   act=1;S.push(cur)}
 }
 return{lines:[],sigs:S,marks:M}}
const BIO={id:'bio',name:'BOS + IDM + Order Block',calc:bosidm,params:[['mode','Signal mode','Balanced',['Strict','Balanced','More signals']],['sl','Structure swing length (BOS)',4],['il','Inducement swing length (IDM)',2],['bosAge','Max age of broken swing (bars)',200],['age','Max bars BOS to entry',120],['buf','SL buffer x ATR',.1],['maxRisk','Max risk x ATR',5],['tp1Pct','TP1 position (fraction of entry to TP2)',.5],['trFilter','Trend filter','Off',['Off','Trend 2','Trend 1']],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};

// SMC model
function smc(d,p){
 const n=d.length,A=atr(d,14),S=[],M=[];
 const md=p.mode,mDisp=md=='Strict'?.6:md=='More signals'?.1:.3,mBos=md=='Strict'?2:md=='More signals'?0:1,mRR=md=='Strict'?2:md=='More signals'?1:1.5,needRej=md=='Strict',needFvg=md!='More signals';
 const E=[d,d.map(x=>({open:-x.open,high:-x.low,low:-x.high,close:-x.close}))];
 const mkX=()=>({PH:[],pl:null,bosN:0,bl:[],bosLast:-1,L:NaN,Lb:-1,st:0,su:null});
 const X=[mkX(),mkX()];let act=0,cur=null;
 for(let i=0;i<n;i++){
  const a=A[i],cand=[null,null];
  for(const k of [1,0]){
   const x=X[k],e=E[k],c=e[i],use=k?p.useSell:p.useBuy,g=k?-1:1;
   const ph=pivH(e,i,p.sw),pl=pivL(e,i,p.sw);
   if(!isNaN(ph)){x.PH.push({v:ph,i:i-p.sw});if(x.PH.length>14)x.PH.shift()}
   if(!isNaN(pl))x.pl={v:pl,i:i-p.sw,brk:false};
   if(x.st==0&&use){
    if(x.bosN>0&&i-x.bosLast>p.bosAge){x.bosN=0;x.bl=[];x.L=NaN}
    if(x.pl&&!x.pl.brk&&c.close<x.pl.v){x.pl.brk=true;x.bosN++;x.bosLast=i;x.bl.push({i1:x.pl.i,i2:i,y:x.pl.v});if(x.bl.length>3)x.bl.shift()}
    if(x.bosN>0&&(isNaN(x.L)||c.low<x.L)){x.L=c.low;x.Lb=i}
    if(x.bosN>=Math.max(1,mBos)||(mBos==0&&x.bosN>0)){
     let H=null;for(let q=x.PH.length-1;q>=0;q--)if(x.PH[q].i<x.Lb){H=x.PH[q];break}
     if(H&&i>x.Lb&&c.close>H.v){
      // CHoCH. The sequence is consumed whether or not the filters below accept it.
      const bl=x.bl.slice(),L=x.L,Lb=x.Lb;x.bosN=0;x.bl=[];x.L=NaN;
      if(i-Lb<=p.maxLeg){
       let body=0,fv=null,tg=-Infinity,tgI=Lb;
       for(let j=Lb;j<=i;j++){const q=e[j];if(q.close>q.open)body=Math.max(body,q.close-q.open);if(q.high>tg){tg=q.high;tgI=j}
        if(!fv&&j>=Lb+1&&j>=2&&q.low>e[j-2].high&&e[j-1].close>e[j-1].open&&q.low-e[j-2].high>=p.minGap*A[j])fv={i0:j-2,j,top:q.low,bot:e[j-2].high}}
       let oi=Lb;while(oi>=Lb-5&&oi>=0&&!(e[oi].close<e[oi].open))oi--;if(oi<Lb-5||oi<0)oi=Lb;
       const top=e[oi].high,bot=L;
       if(body>=mDisp*a&&(fv||!needFvg)&&top-bot>=.1*a&&top-bot<=p.maxOB*a)
        {x.st=2;x.su={H,ch:i,top,bot,fv,tg,tgI,oi,bl,Lb}}}}}
   } else if(x.st==2){
    const u=x.su,lvl=u.top-p.fib*(u.top-u.bot);
    if(i>u.ch){
     const touch=c.low<=lvl,en=Math.min(lvl,c.open),sl=u.bot-p.buf*a,r=en-sl,conf=(!needRej||c.close>c.open)&&c.close>u.bot;
     const sg=touch&&conf&&!act&&u.tg>en&&r>.2*a&&r<=p.maxRisk*a&&(u.tg-en)>=mRR*r;
     const fail=i-u.ch>p.age;
     if(sg)cand[k]={en,sl,u:{...u}};
     if(touch||fail||sg)x.st=0;
     else if(c.high>u.tg){u.tg=c.high;u.tgI=i}}}
  }
  const k0=cand[1]?1:cand[0]?0:-1;
  if(act){if(step(cur,d[i],i))act=0}
  else if(k0>=0){const c=cand[k0],u=c.u,g=k0?-1:1,en=g*c.en,sl=g*c.sl,t2=g*u.tg,r=Math.abs(en-sl),t1=en+(t2-en)*p.tp1Pct;
   cur=mk(d,i,k0?'SELL':'BUY',en,sl,Math.abs(t1-en)/r,Math.abs(t2-en)/r);cur.st='OPEN';cur.txt=(k0?'SELL':'BUY')+' | CHoCH + OB';
   {const bu=!k0,lv=g*(u.top-p.fib*(u.top-u.bot)),zl=Math.min(g*u.top,g*u.bot),zh=Math.max(g*u.top,g*u.bot),za=fx(zl)+' – '+fx(zh),nb=u.bl.length,
     im=u.fv?fx(Math.min(g*u.fv.top,g*u.fv.bot))+' – '+fx(Math.max(g*u.fv.top,g*u.fv.bot)):'';
    cur.zone={lo:zl,hi:zh,lvl:lv,hit:'touched the '+p.fib+' level of the order block'};
    cur.why={en:['Price made '+nb+(bu?' downward':' upward')+' BOS ('+(bu?'breaks of swing lows':'breaks of swing highs')+') = a '+(bu?'down':'up')+'-trend.','Then price broke the last '+(bu?'lower high':'higher low')+' at '+fx(g*u.H.v)+' = CHoCH (change of character): the trend is turning '+(bu?'up':'down')+'.'].concat(u.fv?['The move left an imbalance (IMB) at '+im+'.']:[],['Order block '+za+'. Price returned and touched the '+p.fib+' level ('+fx(lv)+') = ENTRY.','Stop loss is beyond the OB '+(bu?'low':'high')+'. TARGET '+fx(g*u.tg)+' = the '+(bu?'high':'low')+' of the move.']),
     ta:['விலை '+nb+' முறை '+(bu?'கீழ்நோக்கி':'மேல்நோக்கி')+' BOS ('+(bu?'swing low உடைப்பு':'swing high உடைப்பு')+') செய்தது = '+(bu?'இறங்கு':'ஏறு')+' போக்கு.','பிறகு கடைசி '+(bu?'lower high':'higher low')+' '+fx(g*u.H.v)+'-ஐ உடைத்தது = CHoCH (குணம் மாற்றம்): போக்கு '+(bu?'மேலே':'கீழே')+' திரும்புகிறது.'].concat(u.fv?['அந்த நகர்வில் imbalance (IMB) '+im+' உருவானது.']:[],['Order Block '+za+'. விலை திரும்பி வந்து OB-ன் '+p.fib+' நிலையை ('+fx(lv)+') தொட்டது = ENTRY.','SL: OB-ன் '+(bu?'அடிக்குக் கீழே':'உச்சிக்கு மேலே')+'. TARGET '+fx(g*u.tg)+' = நகர்வின் '+(bu?'உச்சம்':'அடி')+'.'])}}
   const top=g*u.top,bot=g*u.bot,F=[0,.25,.5,.75,1],tx=['0','0.25','0.5','0.75','1'],dr=[];
   u.bl.forEach(b=>{dr.push({t:'L',i1:b.i1,i2:b.i2,y1:g*b.y,y2:g*b.y,c:'mt'},{t:'T',i:Math.round((b.i1+b.i2)/2),y:g*b.y,x:'B',c:'mt',dx:0},{t:'T',i:b.i1,y:g*b.y,x:'●',c:'fg',dx:-4})});
   dr.push({t:'L',i1:u.H.i,i2:u.ch,y1:g*u.H.v,y2:g*u.H.v,c:'mt'},{t:'T',i:Math.round((u.H.i+u.ch)/2),y:g*u.H.v,x:'CH',c:'mt',dx:0},{t:'T',i:u.H.i,y:g*u.H.v,x:'●',c:'fg',dx:-4});
   if(u.fv)dr.push({t:'B',i1:u.fv.i0,i2:u.fv.j,y1:g*u.fv.top,y2:g*u.fv.bot,c:'rgba(59,130,246,.22)',x:'IMB'});
   dr.push({t:'B',i1:u.oi,e:1,y1:top,y2:bot,c:'rgba(128,128,128,.26)'},{t:'T',i:u.Lb,y:bot,x:'●',c:'fg',dx:-4});
   F.forEach((f,q)=>{const y=top+f*(bot-top);dr.push({t:'L',i1:u.oi,e:1,y1:y,y2:y,c:'mt'},{t:'T',i:i,e:1,y:y,x:tx[q]+(q==2?'  OB':''),c:'mt',dx:6})});
   dr.push({t:'L',i1:u.tgI,e:1,y1:g*u.tg,y2:g*u.tg,c:'fg'},{t:'T',i:u.tgI,y:g*u.tg,x:'TARGET',c:'fg',dx:4});
   cur.dr=dr;act=1;S.push(cur)}
 }
 return{lines:[],sigs:S,marks:M}}
const SMC={id:'smc',name:'SMC: BOS + CHoCH + OB',calc:smc,params:[['mode','Signal mode','Balanced',['Strict','Balanced','More signals']],['sw','Swing length',3],['bosAge','Max bars since last BOS',80],['maxLeg','Max bars: low to CHoCH',40],['age','Max bars: CHoCH to entry',60],['fib','Entry level inside OB (0 top, 1 bottom)',.25],['minGap','Min imbalance size x ATR',.1],['maxOB','Max OB size x ATR',3],['buf','SL buffer x ATR',.1],['maxRisk','Max risk x ATR',5],['tp1Pct','TP1 position (fraction of entry to TARGET)',.5],['useSell','Enable SELL',true],['useBuy','Enable BUY',true]]};

function extra(){return null}  // chart-only drawing helper; the bot does not draw
module.exports={H,LIQ,BIO,SMC,byId:{liq:LIQ,bio:BIO,smc:SMC},setBE:v=>{BE=v},defaults:ind=>Object.fromEntries(ind.params.map(([k,,d])=>[k,d]))};
