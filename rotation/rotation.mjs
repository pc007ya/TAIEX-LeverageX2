import {day,dateOK,clean,measure,minimumSessions,Q,flowMap,parseCSV,playbackFrames} from './model.mjs?v=smooth-6';
import {US} from './universe.mjs';
const $=s=>document.querySelector(s), byID=s=>document.getElementById(s);
const els=Object.fromEntries(['rankdate','shown','axisname','from','to','market','sector','mode','search','twload','netload','usload','csv','tdkey','usscope','cancel','status','chart','chart-empty','chart-sub','readout','legend','quad','body','earlier','later','last','alllabels','selection-count','range-caption','select-visible','clear-visible','retry-range','trail-on','trail-controls','trail-play','trail-reset','trail-speed','trail-time','trail-date'].map(k=>[k,byID(k)]));
const X={proxy:'價量壓力（估計）',institutions:'台股三大法人淨買超／成交量',foreign:'台股外資淨買超／成交量'};
const quadrant={'1':['#dcefe4','#218355'],'2':['#fff0d6','#a4611a'],'3':['#f7e2e3','#b53b4b'],'4':['#e8e8fa','#5f4fb2'],N:['#edf1f2','#486876']};
let start='2020-11-27',end='2026-11-27',TW=[],sort='rank',reverse=false,focus=null,source=null;
const prices=new Map(), flows=new Map(), loaded=new Set();
const important=new Set(['2330','2454','2317','2308','2881','5274','AAPL','MSFT','NVDA','GOOGL','TSLA','MU','SNDK','AMAT','ASML','XLE','XLF','XLP','XLV','XLU']);
const marked=s=>s.market==='US'?'US':s.market;
const tech=new Set(['半導體','大型科技','資訊科技','電腦週邊','光電','通信網路','通訊服務','電子零組件','電子通路','資訊服務','其他電子','數位雲端']);
const defense=new Set(['必需消費','食品','醫療','生技醫療','公用事業']);
const energy=new Set(['能源','油電燃氣','綠能環保']);
const inSector=(s,v)=>v==='ALL'||v==='TECH'&&tech.has(s.sector)||v==='DEF'&&defense.has(s.sector)||v==='ENERGY'&&energy.has(s.sector)||s.sector===v;
const selectionKey='rotation-hidden-symbols-v1';
const excluded=new Set();
try{const x=JSON.parse(localStorage.getItem(selectionKey)||'[]');if(Array.isArray(x))x.filter(z=>typeof z==='string').forEach(z=>excluded.add(z));}catch{}
const persistSelection=()=>{try{localStorage.setItem(selectionKey,JSON.stringify([...excluded]));}catch{}};
const selected=()=>[...TW,...US].filter(s=>(els.market.value==='ALL'||(s.market==='US'?'US':'TW')===els.market.value)&&inSector(s,els.sector.value)&&(!els.search.value.trim()||[s.symbol,s.name,s.sector,s.group].some(x=>x?.toLowerCase().includes(els.search.value.trim().toLowerCase()))));
const eligible=()=>selected().filter(s=>!excluded.has(s.symbol));
const seen=new Map(), attempted=new Set();
const measureRows=s=>prices.get(s.symbol)||[];
function covered(s,kind,a,b){
 if(kind==='price'&&a===end&&b===end&&measureRows(s).some(r=>r[0]===end))return true;
 return (seen.get(kind+'/'+s.symbol)||[]).some(([x,y])=>x<=a&&y>=b);
}
function remember(s,kind,a,b){
 const k=kind+'/'+s.symbol, values=seen.get(k)||[];
 seen.set(k,[...values.filter(([x,y])=>!(a<=x&&b>=y)),[a,b]]);
}
function activeRange(){
 const [a,b]=[els.from.value,els.to.value];
 return dateOK(a)&&dateOK(b)&&a>=start&&b<=end&&a<=b?[a,b]:null;
}
let autoTimer=null,queued=false;
let playback=null,tick=null,frameIndex=0,playbackKey='',motion=null,playing=false;
function requestVisible(){
 queued=true;clearTimeout(autoTimer);autoTimer=setTimeout(autoVisible,240);
}
const fmt=n=>Number.isFinite(n)?(n>0?'+':'')+(Math.abs(n)<.005?'0.00':n.toFixed(2))+'%':'—';
const msg=s=>{els.status.textContent=s};
function addPrices(s,rows){prices.set(s.symbol,clean([...(prices.get(s.symbol)||[]),...rows],s.listed));}
function option(s,txt=s){const o=document.createElement('option');o.value=s;o.textContent=txt;return o}
function rebuildSector(){
 const selected=els.sector.value;
 const pool=els.market.value==='TW'?TW:els.market.value==='US'?US:[...TW,...US];
 els.sector.replaceChildren(option('ALL','全部板塊'),...(pool.some(s=>tech.has(s.sector))?[option('TECH','科技（全部）')]:[]),...(pool.some(s=>defense.has(s.sector))?[option('DEF','防守板塊（全部）')]:[]),...(pool.some(s=>energy.has(s.sector))?[option('ENERGY','能源（全部）')]:[]),...Array.from(new Set(pool.map(x=>x.sector))).sort((a,b)=>a.localeCompare(b,'zh-Hant')).map(x=>option(x)));
 if(Array.from(els.sector.options).some(x=>x.value===selected))els.sector.value=selected;
}
function stopPlayback(discard=true){
 if(tick!==null)cancelAnimationFrame(tick);
 tick=null;playing=false;
 if(discard)motion=null;
 els['trail-play'].textContent='▶ 播放';
}
function inspectSymbol(symbol){
 focus=symbol;
 const f=playback?.frames[frameIndex];
 const observed=f?.points.find(s=>s.symbol===symbol);
 if(observed)read(observed);
 else if(f)els.readout.textContent=symbol+' ｜ '+f.date+' 無觀測值。';
}
function markFrame(f){
 els['trail-time'].value=frameIndex;
 els['trail-time'].setAttribute('aria-valuetext',f.date);
 els['trail-date'].textContent=f.date+' · '+(frameIndex+1)+' / '+playback.frames.length+' · '+f.points.length+' 檔'+(playback.sampled?'（長區間抽取交易日播放）':'');
 if(focus)inspectSymbol(focus);else els.readout.textContent='點選標的查看該日期的累計 X、Y。';
}
function showFrame(){
 if(!playback?.frames.length){draw([]);return;}
 const f=playback.frames[frameIndex];
 markFrame(f);
 draw(f.points,{...playback,index:frameIndex});
}
function resetTimeline(items,a,b,mode){
 const key=[a,b,mode,...items.map(s=>s.symbol)].join('/');
 const old=key===playbackKey?playback?.frames[frameIndex]?.date:null;
 stopPlayback();playbackKey=key;
 playback=playbackFrames(items,a,b,mode,measureRows,flows);
 const n=playback.frames.length;
 frameIndex=old?Math.max(0,playback.frames.findIndex(f=>f.date>=old)):0;
 els['trail-time'].max=Math.max(0,n-1);els['trail-time'].value=frameIndex;
 els['trail-time'].disabled=n<2;els['trail-play'].disabled=n<2;els['trail-reset'].disabled=n<2;
 if(n)showFrame();
 else{draw([]);els['trail-date'].textContent='這段日期沒有足夠的交易日資料；不補畫缺值。';}
}
function runMotion(now){
 if(!playing){tick=null;return;}
 const next=playback?.frames[frameIndex+1];
 if(!next){stopPlayback();return;}
 const current=playback.frames[frameIndex];
 if(!motion){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer=!reduce?draw(next.points,{...playback,previous:current,index:frameIndex+1,animate:true}):null;
  motion={render:renderer,elapsed:0,last:now,duration:Number(els['trail-speed'].value)};
  if(renderer)renderer(0);
 }
 motion.elapsed+=Math.min(65,Math.max(0,now-motion.last));motion.last=now;
 const p=Math.min(1,motion.elapsed/motion.duration);
 if(motion.render)motion.render(p);
 if(p>=1){
  frameIndex++;motion=null;
  showFrame();
  if(frameIndex>=playback.frames.length-1){stopPlayback();return;}
 }
 tick=requestAnimationFrame(runMotion);
}
function refresh(){
 const [a,b]=[els.from.value,els.to.value];
 const mode=els.mode.value;
 els['range-caption'].textContent=dateOK(a)&&dateOK(b)?'查值區間：'+a+' ～ '+b:'';
 els.axisname.textContent='X：'+X[mode];els['chart-sub'].textContent='X：'+X[mode]+' · Y：區間漲跌幅。點選或聚焦查值；往下可看完整標的。';
 if(!dateOK(a)||!dateOK(b)||a>b||a<start||b>end){
  stopPlayback();playback=null;els.shown.textContent='日期無效';draw([]);table([]);els['chart-empty'].textContent='請選擇有效日期（'+start+' 至 '+end+'），且起始日不晚於結束日。';return;
 }
 const all=selected().map(s=>{
  const rows=measureRows(s);
  if(s.market!=='US'&&a!==b&&!covered(s,'price',a,b)&&!hasInterval(rows,a,b))return {...s,missing:'尚未取得此區間日行情'};
  return {...s,...measure(rows,a,b,mode,flows.get(s.symbol),s.market,s.listed)};
 });
 const included=all.filter(s=>!excluded.has(s.symbol));
 const points=included.filter(s=>!s.missing);
 els['retry-range'].hidden=!included.some(s=>s.market!=='US'&&s.missing&&!(s.listed&&s.listed>b));
 els.shown.textContent='已繪 '+points.length+' ／ 已勾 '+included.length+' 檔';
 els['selection-count'].textContent='篩選 '+all.length+' 檔 · 已勾 '+included.length+' 檔 · 有資料 '+points.length+' 檔';
 els['select-visible'].disabled=!all.length||included.length===all.length;
 els['clear-visible'].disabled=!included.length;
 const current=points.find(s=>s.symbol===focus);
 if(!els['trail-on'].checked){if(!current){focus=null;els.readout.textContent='點選個股查看漲跌幅、X 值及樣本日期。';}else read(current);}
 byID('table-sub').textContent=els['trail-on'].checked?'下表為上方完整區間的統計。點選代號可查目前播放日的數值。':'先選市場與板塊，再勾選要放進四象限圖的標的。';
 if(els['trail-on'].checked)resetTimeline(included,a,b,mode);else{stopPlayback();playback=null;playbackKey='';draw(points);}table(all);
 els['chart-empty'].textContent=!all.length?'沒有符合市場、板塊或搜尋的標的。':!included.length?'目前沒有勾選的標的。請在下方明細勾選。':source?'正在讀取所選區間，取得資料後自動重畫。':included.every(s=>s.market==='US')?'這段日期沒有可繪的美股資料。請匯入 CSV，或展開上方「美股資料」載入。':'此區間沒有可繪的資料。非交易日不補值；可重新讀取台股資料。';
}
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},t=null,p=els.chart){
 const e=document.createElementNS(NS,tag);
 for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);
 if(t!=null)e.textContent=t;
 p.appendChild(e);return e;
}
function read(s){
 focus=s.symbol;
 els.readout.textContent=s.symbol+' · '+s.name+' ｜ '+s.sector+' ｜ X '+fmt(s.x)+'，Y '+fmt(s.y)+' ｜ '+s.first+' 至 '+s.last+'，有效 '+s.used+'／'+s.days+' 日'+(s.partial?'（上市後可用區間）':'')+(s.net==null?'':' ｜ 淨額 '+s.net.toLocaleString('zh-TW')+' 股');
}
function extent(v,floor){
 const n=Math.max(...v.map(Math.abs),floor);
 const unit=10**Math.floor(Math.log10(n));return Math.ceil(n*1.13/unit)*unit;
}
function draw(points,trajectory=null){
 const focused=document.activeElement?.closest?.('.plot-dot')?.dataset.symbol;
 const current=trajectory?.animate?trajectory.previous.points:points;
 const targets=new Map(trajectory?.animate?points.map(s=>[s.symbol,s]):[]);
 els.chart.replaceChildren();
 const empty=!current.length;
 els['chart-empty'].hidden=!empty;els.chart.toggleAttribute('hidden',empty);
 const counts=Object.fromEntries(Q.map(q=>[q[0],0]));for(const s of current)if(counts[s.q]!=null)counts[s.q]++;
 const cards=Q.map(([q,l,d])=>{const el=document.createElement('div'),h=document.createElement('strong'),p=document.createElement('span');el.style.background=quadrant[q][0];h.textContent=l+' · '+counts[q]+' 檔';p.textContent=d;el.append(h,p);return el});
 els.quad.replaceChildren(...cards);
 els.legend.replaceChildren(...['● 上市','■ 上櫃','◆ 美股','顏色＝象限・色深＝同區標的密度',...(trajectory?['灰色＝日期間過渡'] : [])].map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 if(empty)return;
 const mobile=els.chart.parentElement.clientWidth<550;
 const w=mobile?420:880,h=mobile?440:500,L=mobile?56:67,R=w-22,T=34,B=h-56,cx=(L+R)/2,cy=(T+B)/2;
 els.chart.setAttribute('viewBox','0 0 '+w+' '+h);
 const xmax=extent(trajectory?[trajectory.maxima.x]:points.map(s=>s.x),1),ymax=extent(trajectory?[trajectory.maxima.y]:points.map(s=>s.y),1);
 const dims={'1':[cx,T,R-cx,cy-T],'2':[L,T,cx-L,cy-T],'3':[L,cy,cx-L,B-cy],'4':[cx,cy,R-cx,B-cy]};
 for(const [q,[x,y,width,height]] of Object.entries(dims)){
  svg('rect',{x,y,width,height,fill:quadrant[q][0]});
  if(counts[q])svg('rect',{x,y,width,height,opacity:.18*counts[q]/Math.max(...Object.values(counts),1),fill:quadrant[q][1]});
 }
 const px=x=>cx+x/xmax*(R-L)/2,py=y=>cy-y/ymax*(B-T)/2;
 const line=(x1,y1,x2,y2,stroke='#bfd0d3',sw=.65)=>svg('line',{x1,y1,x2,y2,stroke,'stroke-width':sw});
 const label=(t,x,y,anchor='middle',size=12,fill='#3a5964')=>svg('text',{x,y,'text-anchor':anchor,fill,'font-size':size},t);
 for(const v of [-1,-.5,0,.5,1]){
  const x=px(xmax*v),y=py(ymax*v);
  line(x,T,x,B,v===0?'#547087':undefined,v===0?1.7:1);
  line(L,y,R,y,v===0?'#547087':undefined,v===0?1.7:1);
  label((xmax*v).toLocaleString('zh-TW')+'%',x,B+15);
  label((ymax*v).toLocaleString('zh-TW')+'%',L-5,y+4,'end');
 }
 label(trajectory?'Y · 選定起日累計漲跌幅':'Y · 區間漲跌幅',L,19,'start',mobile?12:14);
 label('X · '+X[els.mode.value],cx,h-13,'middle',mobile?12:14);
 const moves=[],tails=new Map();
 if(trajectory&&trajectory.index>0){
  const group=svg('g',{class:'trail-paths','aria-hidden':'true'});
  const history=trajectory.frames.slice(Math.max(0,trajectory.index-7),trajectory.index+1);
  const paths=new Map();
  history.forEach(f=>f.points.forEach(v=>{const a=paths.get(v.symbol)||new Map();a.set(f.date,v);paths.set(v.symbol,a);}));
  for(const s of current){
   const series=paths.get(s.symbol),strong=focus===s.symbol;
   for(let i=1;i<history.length;i++){
    const a=series?.get(history[i-1].date),b=series?.get(history[i].date);
    if(!a||!b)continue;
    const x1=px(a.x),y1=py(a.y),x2=px(b.x),y2=py(b.y);
    const transitioning=trajectory.animate&&i===history.length-1;
    const tone=quadrant[transitioning?'N':b.q][1];
    const alpha=(strong?.92:.25)*i/(history.length-1);
    const tail=svg('line',{x1,y1,x2,y2,stroke:tone,'stroke-width':strong?2.4:1.15,'stroke-opacity':alpha,'stroke-linecap':'round','data-trail-symbol':s.symbol},null,group);
    if(i===history.length-1&&trajectory.animate)tails.set(s.symbol,tail);
    if(!trajectory.animate&&i===history.length-1&&(strong||points.length<=12)&&Math.hypot(x2-x1,y2-y1)>7){
     const a=Math.atan2(y2-y1,x2-x1),len=5;
     svg('path',{d:'M '+(x2-len*Math.cos(a-.5))+' '+(y2-len*Math.sin(a-.5))+' L '+x2+' '+y2+' L '+(x2-len*Math.cos(a+.5))+' '+(y2-len*Math.sin(a+.5)),stroke:tone,'stroke-width':1.3,fill:'none','stroke-opacity':strong?.9:.6},null,group);
    }
   }
  }
 }
 const recorded=[];
 for(const s of [...current].sort((a,b)=>Number(important.has(b.symbol))-Number(important.has(a.symbol)))){
  const x=px(s.x),y=py(s.y), ink=quadrant[s.q][1],r=(s.rank&&s.rank<=10)?5:4.4;
  const next=targets.get(s.symbol);
  const glide=next&&(next.x!==s.x||next.y!==s.y);
  const g=svg('g',{tabindex:0,role:'button','aria-label':s.symbol+' '+s.name+'，X '+fmt(s.x)+'，Y '+fmt(s.y),class:'plot-dot','data-symbol':s.symbol});
  svg('title',{},s.symbol+' '+s.name+'｜X '+fmt(s.x)+'，Y '+fmt(s.y),g);
  svg('circle',{cx:x,cy:y,r:11,fill:'transparent'},null,g);
  if(s.market==='US')svg('path',{d:'M '+x+' '+(y-r-1)+' L '+(x+r+1)+' '+y+' L '+x+' '+(y+r+1)+' L '+(x-r-1)+' '+y+' Z',class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  else if(s.market==='TPEx')svg('rect',{x:x-r,y:y-r,width:r*2,height:r*2,rx:1,class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  else svg('circle',{cx:x,cy:y,r,class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  const inspect=()=>trajectory?inspectSymbol(s.symbol):read(s);
  g.addEventListener('click',inspect);g.addEventListener('focus',inspect);
  g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();inspect();}});
  if(glide)moves.push({g,x,y,dx:px(next.x)-x,dy:py(next.y)-y,tail:tails.get(s.symbol),marker:g.querySelector('.marker'),ink});
  if(s.symbol===focused)g.focus({preventScroll:true});
  const left=x>R-48, lx=x+(left?-7:7),ly=y-5;
  if(els.alllabels.checked||(important.has(s.symbol)&&!recorded.some(([u,v])=>Math.abs(u-lx)<38&&Math.abs(v-ly)<11))){
   svg('text',{x:lx,y:ly,'text-anchor':left?'end':'start',fill:'#243e48',class:'chart-label','font-weight':'700','font-size':mobile?10.2:12},s.symbol,g);
   recorded.push([lx,ly]);
  }
 }
 if(trajectory?.animate)return progress=>{
  for(const m of moves){
   const dx=m.dx*progress,dy=m.dy*progress;
   m.g.setAttribute('transform','translate('+dx+' '+dy+')');
   const ink=progress>0?quadrant.N[1]:m.ink;
   if(m.marker.getAttribute('fill')!==ink)m.marker.setAttribute('fill',ink);
   if(m.tail){m.tail.setAttribute('x2',m.x+dx);m.tail.setAttribute('y2',m.y+dy);}
  }
 };
}
function table(rows){
 const val=s=>sort==='rank'?(s.rank??1000):s[sort];
 const ordered=[...rows].sort((a,b)=>{
  const x=val(a),y=val(b); if(x==null&&y==null)return a.symbol.localeCompare(b.symbol); if(x==null)return 1;if(y==null)return -1;
  return ((sort==='rank'?x-y:y-x)||a.symbol.localeCompare(b.symbol))*(reverse?-1:1);
 });
 const frag=document.createDocumentFragment();
 for(const s of ordered){
  const tr=document.createElement('tr');tr.dataset.available=String(!s.missing);
  const cell=document.createElement('td'),pick=document.createElement('input');
  cell.className='plot-check';pick.type='checkbox';pick.checked=!excluded.has(s.symbol);
  pick.dataset.pick=s.symbol;pick.setAttribute('aria-label','放入圖表 '+s.symbol+' '+s.name);
  pick.addEventListener('change',()=>{
   if(pick.checked)excluded.delete(s.symbol);else excluded.add(s.symbol);
   persistSelection();refresh();requestVisible();
   els.body.querySelector('input[data-pick="'+s.symbol+'"]')?.focus({preventScroll:true});
  });
  cell.append(pick);tr.append(cell);
  const tableVals=[(s.rank?s.rank+'. ':'')+s.symbol+' '+s.name,marked(s)+'／'+s.sector,fmt(s.x),fmt(s.y),s.missing||(s.q==='N'?'零軸':'象限 '+s.q)+' · '+s.used+'/'+s.days+' 日'+(s.partial?' · 上市後':'')];
  tableVals.forEach((t,i)=>{
   const td=document.createElement('td');
   if(i===0&&!s.missing){const b=document.createElement('button');b.textContent=t;b.title='查值 '+s.symbol;b.addEventListener('click',()=>{if(els['trail-on'].checked&&playback)inspectSymbol(s.symbol);else read(s);els.readout.scrollIntoView({block:'nearest'});});td.append(b);}
   else td.textContent=t;
   if(i===2||i===3){const v=i===2?s.x:s.y;if(Number.isFinite(v))td.dataset.sign=v>=0?'up':'down';}
   tr.appendChild(td);
  });frag.append(tr);
 }
 els.body.replaceChildren(frag);
}
function datePreset(n,base=els.to.value||end){
 let v=n==='six'?start:day(base,1-Number(n));
 if(v<start)v=start;
 els.from.value=v;els.to.value=base;
 document.querySelectorAll('button[data-days]').forEach(e=>{const active=e.dataset.days===String(n);e.classList.toggle('active',active);e.setAttribute('aria-pressed',String(active));});
 refresh();requestVisible();
}
function moveRange(direction){
 const a=els.from.value,b=els.to.value;if(!dateOK(a)||!dateOK(b)||b<a)return;
 const delta=Math.min(31,Math.round((Date.parse(b)-Date.parse(a))/864e5)+1);
 let a2=day(a,direction*delta),b2=day(b,direction*delta);
 if(a2<start){b2=day(b2,Math.round((Date.parse(start)-Date.parse(a2))/864e5));a2=start;}
 if(b2>end){a2=day(a2,-Math.round((Date.parse(b2)-Date.parse(end))/864e5));b2=end;}
 if(a2<start)a2=start;
 els.from.value=a2;els.to.value=b2;rangeChanged();
}
async function json(url,signal,init={}){
 const ctrl=new AbortController();
 const relay=()=>ctrl.abort(signal.reason);
 if(signal?.aborted)relay();else signal?.addEventListener('abort',relay,{once:true});
 const alarm=setTimeout(()=>ctrl.abort(),42000);
 try {
  const r=await fetch(url,{...init,signal:ctrl.signal,cache:'no-store'});
  let d=null;try{d=await r.json();}catch{}
  if(!r.ok||!d||d.status==='error'||(d.status!=null&&Number.isFinite(Number(d.status))&&Number(d.status)>=400)){
   const e=Error('來源回應失敗 '+(d?.code||d?.status||r.status));e.status=Number(d?.code)||Number(d?.status)||r.status;throw e;
  }
  return d;
 } finally {clearTimeout(alarm);signal?.removeEventListener('abort',relay);}

}
function wait(ms,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const stop=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});
 });
}
const running=on=>{for(const k of ['twload','netload','usload','csv','retry-range'])els[k].disabled=on;els.cancel.hidden=!on};
async function queue(name,items,job,{width=5,throttle=false}={}){
 if(source)return;
 if(!items.length){msg(name+'已載入或沒有符合標的。');return;}
 source=new AbortController();const signal=source.signal;running(true);let success=0;const fails=[];
 let done=0;
 try {
  for(let i=0;i<items.length;i+=width){
   if(signal.aborted)break;
   const chunk=items.slice(i,i+width);
   msg(name+' · '+done+'／'+items.length+'；已讀入 '+success+' 檔…');
   await Promise.all(chunk.map(async item=>{
    try{await job(item,signal);success++;}
    catch(e){if(!signal.aborted)fails.push(item.symbol+(e.status?' ('+e.status+')':''));}
    finally{done++;}
   }));
   refresh();
   if(throttle&&i+width<items.length){
    msg(name+' · '+done+'／'+items.length+'；配合免費方案每分鐘限額，約 1 分鐘後讀取下一批。');
    await wait(62000,signal);
   }
  }
 }catch(e){if(!signal.aborted)msg(name+'發生錯誤。');}
 finally{
  msg(name+(signal.aborted?'已停止':'完成')+'：'+success+'／'+items.length+' 檔；已載入的資料可直接查閱。'+(fails.length?' 未讀到：'+fails.slice(0,9).join('、')+(fails.length>9?' 等 '+fails.length+' 檔':'')+'。':''));
  source=null;running(false);refresh();if(queued)requestVisible();
 }
}
const fin='https://api.finmindtrade.com/api/v4/data';
function hasInterval(rows,a,b){
 // A snapshot or a previously fetched subrange cannot stand in for the newly chosen window.
 return rows.length>1&&rows[0][0]<=a&&rows.at(-1)[0]>=b;
}
async function loadTw(kind,items=eligible().filter(s=>s.market!=='US'),a=start,b=end,automatic=false,force=false){
 const net=kind==='flow';
 if(!TW.length){if(!automatic)msg('仍在讀取台股名單；完成後可載入。');return;}
 const token=s=>[kind,s.symbol,a,b].join('/');
 const list=items.filter(s=>!(s.listed&&s.listed>b)&&(force||!covered(s,kind,a,b))&&(!automatic||!attempted.has(token(s))));
 if(!list.length){if(!automatic)msg('此篩選已載入，或沒有勾選台股。');return;}
 const cutoff=day(a,-20);
 await queue(net?'台股法人資料':'台股價量資料',list,async(s,signal)=>{
  attempted.add(token(s));
  const q=new URLSearchParams({dataset:net?'TaiwanStockInstitutionalInvestorsBuySell':'TaiwanStockPrice',data_id:s.symbol,start_date:cutoff,end_date:b});
  const j=await json(fin+'?'+q,signal);
  if(!Array.isArray(j.data))throw Error('缺資料');
  const data=j.data.filter(x=>(!x.stock_id||String(x.stock_id)===s.symbol)&&dateOK(x.date)&&x.date<=b&&x.date>=cutoff);
  if(j.data.length&&!data.length)throw Error('日期或代號不符');
  const inRange=data.filter(x=>x.date>=a&&x.date<=b);
  const floor=minimumSessions(s.listed&&s.listed>a?s.listed:a,b);
  if(net){const m=flows.get(s.symbol)||new Map();for(const item of flowMap(data))m.set(...item);flows.set(s.symbol,m);}
  else addPrices(s,data.map(x=>[x.date,x.close,x.max,x.min,x.Trading_Volume,x.spread]));
  if(new Set(inRange.map(x=>x.date)).size<floor)throw Error('所選期間的交易日資料不完整');
  remember(s,kind,a,b);
 },{width:5});
}
async function autoVisible(){
 if(!queued||source)return;
 queued=false;
 const range=activeRange();if(!range)return;
 const [a,b]=range, items=eligible().filter(s=>s.market!=='US'&&!(s.listed&&s.listed>b));
 if(!items.length)return;
 await loadTw('price',items,a,b,true);
 if(source||activeRange()?.join('/')!==range.join('/'))return;
 if(els.mode.value!=='proxy')await loadTw('flow',eligible().filter(s=>s.market!=='US'),a,b,true);
}
function rangeChanged(changed){
 const a=els.from.value,b=els.to.value;
 if(dateOK(a)&&dateOK(b)&&a>b){if(changed==='from')els.to.value=a;if(changed==='to')els.from.value=b;}
 document.querySelectorAll('button[data-days]').forEach(e=>{e.classList.remove('active');e.setAttribute('aria-pressed','false');});
 refresh();requestVisible();
}
async function loadUS(){
 const key=els.tdkey.value.trim();if(!key){msg('請輸入自己的 Twelve Data API 金鑰，或匯入 CSV。');els.tdkey.focus();return;}
 const scope=els.usscope.value;
 const sy=scope==='focus'?new Set(['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','MU','SNDK','AMAT','ASML']):null;
 const list=US.filter(s=>!loaded.has('US/'+s.symbol)&&(!sy||sy.has(s.symbol))&&(scope!=='filtered'||eligible().some(x=>x.symbol===s.symbol)));
 els.tdkey.value='';
 await queue('美股日資料',list,async(s,signal)=>{
  const q=new URLSearchParams({symbol:s.symbol,interval:'1day',outputsize:'1700',start_date:day(start,-20),end_date:end,order:'asc',adjust:'splits',country:'United States',apikey:key});
  const j=await json('https://api.twelvedata.com/time_series?'+q,signal);
  if(j.meta?.symbol!==s.symbol||!Array.isArray(j.values)||!j.values.length)throw Error('缺資料或代號不符');
  const rows=j.values.filter(o=>dateOK(o.datetime)&&o.datetime<=end&&o.datetime>=day(start,-20)).map(o=>[o.datetime,o.close,o.high,o.low,o.volume,null]);
  if(!rows.length)throw Error('沒有有效交易日');
  addPrices(s,rows);loaded.add('US/'+s.symbol);
 },{width:7,throttle:true});
}
document.querySelectorAll('button[data-days]').forEach(e=>e.addEventListener('click',()=>datePreset(e.dataset.days)));
document.querySelectorAll('button[data-sort]').forEach(e=>e.addEventListener('click',()=>{reverse=sort===e.dataset.sort?!reverse:false;sort=e.dataset.sort;refresh();}));
els.earlier.addEventListener('click',()=>moveRange(-1));els.later.addEventListener('click',()=>moveRange(1));els.last.addEventListener('click',()=>datePreset('1',end));
els.from.addEventListener('change',()=>rangeChanged('from'));els.to.addEventListener('change',()=>rangeChanged('to'));
const filterChanged=()=>{refresh();requestVisible();};
els.market.addEventListener('change',()=>{rebuildSector();filterChanged();});els.sector.addEventListener('change',filterChanged);
els.mode.addEventListener('change',filterChanged);
els.search.addEventListener('input',filterChanged);els.alllabels.addEventListener('change',refresh);
for(const [id,exclude] of [['select-visible',false],['clear-visible',true]])els[id].addEventListener('click',()=>{
 for(const s of selected()){if(exclude)excluded.add(s.symbol);else excluded.delete(s.symbol);}
 persistSelection();filterChanged();
});
els.twload.addEventListener('click',()=>loadTw('price'));els.netload.addEventListener('click',()=>loadTw('flow'));els.usload.addEventListener('click',loadUS);els.cancel.addEventListener('click',()=>{queued=false;clearTimeout(autoTimer);source?.abort();});
els['retry-range'].addEventListener('click',async()=>{
 const r=activeRange();if(!r||source)return;
 const [a,b]=r;
 const picks=eligible().filter(s=>s.market!=='US'&&measure(measureRows(s),a,b,els.mode.value,flows.get(s.symbol),s.market,s.listed).missing);
 await loadTw('price',picks,a,b,false,true);
 if(els.mode.value!=='proxy'&&activeRange()?.join('/')===r.join('/'))await loadTw('flow',picks,a,b,false,true);
});
els.csv.addEventListener('change',async()=>{
 const file=els.csv.files[0];if(!file)return;
 if(file.size>20e6){msg('CSV 檔案上限 20 MB。');return;}
 try{
  const p=parseCSV(await file.text());let have=0;
  for(const s of [...TW,...US])if(p.has(s.symbol)&&clean(p.get(s.symbol),s.listed).length){addPrices(s,p.get(s.symbol));have++;}
  msg(have?'已於本頁匯入 '+have+' 檔標的。':'CSV 沒有可辨識的標的和交易日。');
  refresh();
 }catch(e){msg(e.message);}
 els.csv.value='';
});
els['trail-on'].addEventListener('change',()=>{els['trail-controls'].hidden=!els['trail-on'].checked;refresh();});
els['trail-reset'].addEventListener('click',()=>{stopPlayback();frameIndex=0;showFrame();});
els['trail-time'].addEventListener('input',()=>{stopPlayback();frameIndex=Number(els['trail-time'].value);showFrame();});
els['trail-play'].addEventListener('click',()=>{
 if(playing){stopPlayback(false);return;}
 if(!playback||playback.frames.length<2)return;
 if(frameIndex>=playback.frames.length-1){frameIndex=0;showFrame();}
 if(motion)motion.last=performance.now();
 playing=true;els['trail-play'].textContent='⏸ 暫停';
 tick=requestAnimationFrame(runMotion);
});
let viewportWidth=innerWidth;
window.addEventListener('resize',()=>{
 if(innerWidth===viewportWidth)return;
 viewportWidth=innerWidth;
 if(els['trail-on'].checked&&playback?.frames.length){stopPlayback();showFrame();}else refresh();
},{passive:true});
async function boot(){
 try{
  const q=await json('./tw-snapshot.json');
  if(!dateOK(q.date)||q.universe?.length!==50)throw Error('invalid');
  TW=q.universe;end=q.date;const d=new Date(end+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()-6);start=d.toISOString().slice(0,10);
  for(const r of TW)addPrices(r,q.prices[r.symbol]||[]);
  els.rankdate.textContent=q.date+' 台股市值前 50';
  msg('已顯示 '+q.date+' 台股快照。切換日期會自動讀取勾選的台股；美股可匯入或連接資料來源。');
 }catch{els.rankdate.textContent='台股快照未連線';msg('未能取得台股快照；仍可匯入美股 CSV。請重新整理再試。');}
 for(const e of [els.from,els.to]){e.min=start;e.max=end;}
 rebuildSector();datePreset('1',end);
}
boot();
