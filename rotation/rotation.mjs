import {day,dateOK,clean,measure,Q,flowMap,parseCSV} from './model.mjs';
import {US} from './universe.mjs';
const $=s=>document.querySelector(s), byID=s=>document.getElementById(s);
const els=Object.fromEntries(['rankdate','shown','axisname','from','to','market','sector','mode','search','twload','netload','usload','csv','tdkey','usscope','cancel','status','chart','chart-empty','chart-sub','readout','legend','quad','body','earlier','later','last','alllabels'].map(k=>[k,byID(k)]));
const X={proxy:'價量壓力（估計）',institutions:'台股三大法人淨買超／成交量',foreign:'台股外資淨買超／成交量'};
const quadrant={'1':['#dcefe4','#218355'],'2':['#fff0d6','#a4611a'],'3':['#f7e2e3','#b53b4b'],'4':['#e8e8fa','#5f4fb2'],N:['#edf1f2','#486876']};
let start='2020-11-27',end='2026-11-27',TW=[],sort='rank',reverse=false,focus=null,source=null;
const prices=new Map(), flows=new Map(), loaded=new Set();
const important=new Set(['2330','2454','2317','2308','2881','5274','AAPL','MSFT','NVDA','GOOGL','TSLA','MU','SNDK','AMAT','ASML','XLE','XLF','XLP','XLV','XLU']);
const marked=s=>s.market==='US'?'US':s.market;
const selected=()=>[...TW,...US].filter(s=>(els.market.value==='ALL'||(s.market==='US'?'US':'TW')===els.market.value)&&(els.sector.value==='ALL'||s.sector===els.sector.value)&&(!els.search.value.trim()||[s.symbol,s.name,s.sector,s.group].some(x=>x?.toLowerCase().includes(els.search.value.trim().toLowerCase()))));
const fmt=n=>Number.isFinite(n)?(n>0?'+':'')+(Math.abs(n)<.005?'0.00':n.toFixed(2))+'%':'—';
const msg=s=>{els.status.textContent=s};
function addPrices(s,rows){prices.set(s.symbol,clean([...(prices.get(s.symbol)||[]),...rows],s.listed));}
function option(s,txt=s){const o=document.createElement('option');o.value=s;o.textContent=txt;return o}
function rebuildSector(){
 const selected=els.sector.value;
 const pool=els.market.value==='TW'?TW:els.market.value==='US'?US:[...TW,...US];
 els.sector.replaceChildren(option('ALL','全部板塊'),...Array.from(new Set(pool.map(x=>x.sector))).sort().map(x=>option(x)));
 if(Array.from(els.sector.options).some(x=>x.value===selected))els.sector.value=selected;
}
function refresh(){
 const [a,b]=[els.from.value,els.to.value];
 const mode=els.mode.value;
 els.axisname.textContent='X：'+X[mode];els['chart-sub'].textContent='X：'+X[mode]+' · Y：區間漲跌幅。點選或聚焦查值；往下可看完整標的。';
 if(!dateOK(a)||!dateOK(b)||a>b||a<start||b>end){
  els.shown.textContent='日期無效';draw([]);table([]);els['chart-empty'].textContent='請選擇有效日期（'+start+' 至 '+end+'），且起始日不晚於結束日。';return;
 }
 const all=selected().map(s=>({...s,...measure(prices.get(s.symbol)||[],a,b,mode,flows.get(s.symbol),s.market,s.listed)}));
 const points=all.filter(s=>!s.missing);
 els.shown.textContent='已繪 '+points.length+' ／ '+all.length+' 檔';
 const current=points.find(s=>s.symbol===focus);
 if(!current){focus=null;els.readout.textContent='點選個股查看漲跌幅、X 值及樣本日期。';}else read(current);
 draw(points);table(all);
 els['chart-empty'].textContent='此篩選及日期沒有可畫標的。可載入台股／美股資料，或切回最新單日查看快照。';
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
function draw(points){
 els.chart.replaceChildren();
 const empty=!points.length;
 els['chart-empty'].hidden=!empty;els.chart.hidden=empty;
 const counts=Object.fromEntries(Q.map(q=>[q[0],0]));for(const s of points)if(counts[s.q]!=null)counts[s.q]++;
 const cards=Q.map(([q,l,d])=>{const el=document.createElement('div'),h=document.createElement('strong'),p=document.createElement('span');el.style.background=quadrant[q][0];h.textContent=l+' · '+counts[q]+' 檔';p.textContent=d;el.append(h,p);return el});
 els.quad.replaceChildren(...cards);
 els.legend.replaceChildren(...['● 上市','■ 上櫃','◆ 美股','顏色＝象限・色深＝同區標的密度'].map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 if(empty)return;
 const mobile=els.chart.parentElement.clientWidth<550;
 const w=mobile?420:880,h=mobile?440:500,L=mobile?56:67,R=w-22,T=34,B=h-56,cx=(L+R)/2,cy=(T+B)/2;
 els.chart.setAttribute('viewBox','0 0 '+w+' '+h);
 const xmax=extent(points.map(s=>s.x),1),ymax=extent(points.map(s=>s.y),1);
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
 label('Y · 區間漲跌幅',L,19,'start',mobile?12:14);
 label('X · '+X[els.mode.value],cx,h-13,'middle',mobile?12:14);
 const recorded=[];
 for(const s of [...points].sort((a,b)=>Number(important.has(b.symbol))-Number(important.has(a.symbol)))){
  const x=px(s.x),y=py(s.y), ink=quadrant[s.q][1],r=(s.rank&&s.rank<=10)?5:4.4;
  const g=svg('g',{tabindex:0,role:'button','aria-label':s.symbol+' '+s.name+'，X '+fmt(s.x)+'，Y '+fmt(s.y),class:'plot-dot','data-symbol':s.symbol});
  svg('title',{},s.symbol+' '+s.name+'｜X '+fmt(s.x)+'，Y '+fmt(s.y),g);
  svg('circle',{cx:x,cy:y,r:11,fill:'transparent'},null,g);
  if(s.market==='US')svg('path',{d:'M '+x+' '+(y-r-1)+' L '+(x+r+1)+' '+y+' L '+x+' '+(y+r+1)+' L '+(x-r-1)+' '+y+' Z',class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  else if(s.market==='TPEx')svg('rect',{x:x-r,y:y-r,width:r*2,height:r*2,rx:1,class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  else svg('circle',{cx:x,cy:y,r,class:'marker',fill:ink,stroke:'#fff','stroke-width':1},null,g);
  g.addEventListener('click',()=>read(s));g.addEventListener('focus',()=>read(s));
  g.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();read(s);}});
  const left=x>R-48, lx=x+(left?-7:7),ly=y-5;
  if(els.alllabels.checked||(important.has(s.symbol)&&!recorded.some(([u,v])=>Math.abs(u-lx)<38&&Math.abs(v-ly)<11))){
   svg('text',{x:lx,y:ly,'text-anchor':left?'end':'start',fill:'#243e48',class:'chart-label','font-weight':'700','font-size':mobile?10.2:12},s.symbol);
   recorded.push([lx,ly]);
  }
 }
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
  const tableVals=[(s.rank?s.rank+'. ':'')+s.symbol+' '+s.name,marked(s)+'／'+s.sector,fmt(s.x),fmt(s.y),s.missing||(s.q==='N'?'零軸':'象限 '+s.q)+' · '+s.used+'/'+s.days+' 日'+(s.partial?' · 上市後':'')];
  tableVals.forEach((t,i)=>{
   const td=document.createElement('td');
   if(i===0&&!s.missing){const b=document.createElement('button');b.textContent=t;b.title='查值 '+s.symbol;b.addEventListener('click',()=>{read(s);els.readout.scrollIntoView({block:'nearest'});});td.append(b);}
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
 document.querySelectorAll('button[data-days]').forEach(e=>e.classList.toggle('active',e.dataset.days===String(n)));
 refresh();
}
function moveRange(direction){
 const a=els.from.value,b=els.to.value;if(!dateOK(a)||!dateOK(b)||b<a)return;
 const delta=Math.min(31,Math.round((Date.parse(b)-Date.parse(a))/864e5)+1);
 let a2=day(a,direction*delta),b2=day(b,direction*delta);
 if(a2<start){b2=day(b2,Math.round((Date.parse(start)-Date.parse(a2))/864e5));a2=start;}
 if(b2>end){a2=day(a2,-Math.round((Date.parse(b2)-Date.parse(end))/864e5));b2=end;}
 if(a2<start)a2=start;
 els.from.value=a2;els.to.value=b2;refresh();
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
const running=on=>{for(const k of ['twload','netload','usload','csv'])els[k].disabled=on;els.cancel.hidden=!on};
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
  source=null;running(false);refresh();
 }
}
const fin='https://api.finmindtrade.com/api/v4/data';
async function loadTw(kind){
 const net=kind==='flow';
 if(!TW.length){msg('仍在讀取台股名單；完成後可載入。');return;}
 const list=TW.filter(s=>!loaded.has(kind+'/'+s.symbol));
 await queue(net?'台股法人歷史':'台股價量歷史',list,async(s,signal)=>{
  const q=new URLSearchParams({dataset:net?'TaiwanStockInstitutionalInvestorsBuySell':'TaiwanStockPrice',data_id:s.symbol,start_date:day(start,-20),end_date:end});
  const j=await json(fin+'?'+q,signal);
  if(!Array.isArray(j.data)||!j.data.length)throw Error('缺資料');
  const data=j.data.filter(x=>(!x.stock_id||String(x.stock_id)===s.symbol)&&dateOK(x.date)&&x.date<=end&&x.date>=day(start,-20));
  if(!data.length)throw Error('日期或代號不符');
  if(net)flows.set(s.symbol,flowMap(data));
  else addPrices(s,data.map(x=>[x.date,x.close,x.max,x.min,x.Trading_Volume,x.spread]));
  loaded.add(kind+'/'+s.symbol);
 },{width:5});
}
async function loadUS(){
 const key=els.tdkey.value.trim();if(!key){msg('請輸入自己的 Twelve Data API 金鑰，或匯入 CSV。');els.tdkey.focus();return;}
 const scope=els.usscope.value;
 const sy=scope==='focus'?new Set(['AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','MU','SNDK','AMAT','ASML']):null;
 const list=US.filter(s=>!loaded.has('US/'+s.symbol)&&(!sy||sy.has(s.symbol))&&(scope!=='filtered'||els.sector.value==='ALL'||s.sector===els.sector.value));
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
els.from.addEventListener('change',refresh);els.to.addEventListener('change',refresh);els.market.addEventListener('change',()=>{rebuildSector();refresh();});els.sector.addEventListener('change',refresh);
els.mode.addEventListener('change',()=>{if(els.mode.value!=='proxy'&&!flows.size)msg('法人模式需另載入台股法人紀錄。美股沒有相同口徑。');refresh();});
els.search.addEventListener('input',refresh);els.alllabels.addEventListener('change',refresh);
els.twload.addEventListener('click',()=>loadTw('price'));els.netload.addEventListener('click',()=>loadTw('flow'));els.usload.addEventListener('click',loadUS);els.cancel.addEventListener('click',()=>source?.abort());
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
window.addEventListener('resize',refresh,{passive:true});
async function boot(){
 try{
  const q=await json('./tw-snapshot.json');
  if(!dateOK(q.date)||q.universe?.length!==50)throw Error('invalid');
  TW=q.universe;end=q.date;const d=new Date(end+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()-6);start=d.toISOString().slice(0,10);
  for(const r of TW)addPrices(r,q.prices[r.symbol]||[]);
  els.rankdate.textContent=q.date+' 台股市值前 50';
  msg('已顯示 '+q.date+' 台股快照。選擇其他歷史區間前，先載入台股或美股日資料。');
 }catch{els.rankdate.textContent='台股快照未連線';msg('未能取得台股快照；仍可匯入美股 CSV。請重新整理再試。');}
 for(const e of [els.from,els.to]){e.min=start;e.max=end;}
 rebuildSector();datePreset('1',end);
}
boot();
