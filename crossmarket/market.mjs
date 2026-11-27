import {series,day,iso,DAY,yearsBefore,week,weekClose,changes,pearson,parseFred,parseTaiwan,clean,months,zipCsv,completeMonthCloses} from './market-core.mjs';

const $=id=>document.getElementById(id);
const ids=Object.keys(series);
function dateParts(timeZone){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
 const part=k=>p.find(x=>x.type===k).value;
 return [part('year')+'-'+part('month')+'-'+part('day'),60*Number(part('hour'))+Number(part('minute'))];
}
const [today]=dateParts('Asia/Taipei');
const [newYork,nyMinute]=dateParts('America/New_York');
const lastDay=today;
const completedThrough=nyMinute>=16*60+30?newYork:iso(day(newYork)-DAY);
const earliest=yearsBefore(lastDay,6);
const twStart=earliest.slice(0,7)+'-01';
const localUS='cm-fred-import-v1', twKey='cm-twse-v1', rateKey='cm-nyfed-v1';
const rows=Object.fromEntries(ids.map(id=>[id,[]]));
const photo='https://fred.stlouisfed.org/graph/fredgraph.png';
const usDL='https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQCOM,NASDAQSOX,VIXCLS';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const nf=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2});
const fmt=v=>Number.isFinite(v)?nf.format(v):'—';
const read=k=>{try{return JSON.parse(localStorage.getItem(k))||{};}catch{return {};}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
const clear=k=>{try{localStorage.removeItem(k);}catch{}};
const specMonths=months(twStart,lastDay);
const us=['COMP','SOX','VIX'];
const cache=read(twKey);
let seedTAIEX=[];
for(const id of ['TAIEX','TWTECH']) if(!cache[id]||typeof cache[id]!=='object')cache[id]={};
const imported=read(localUS);
for(const id of us){rows[id]=clean(imported[id],series[id].kind);}
rows.FED=clean(read(rateKey).rows,'rate');
const attach=(parent,tag,txt,cls)=>{const el=document.createElement(tag);if(txt!=null)el.textContent=txt;if(cls)el.className=cls;parent.append(el);return el;};
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const end=$('cm-end'),start=$('cm-start');
for(const i of [start,end]){i.max=lastDay;i.min=earliest;}
end.value=lastDay;start.value=earliest;
$('cm-fred-download').href=usDL+'&cosd='+[twStart,twStart,twStart].join(',');
function bounds(){
 let a=Number.isFinite(day(start.value))?start.value:earliest,b=Number.isFinite(day(end.value))?end.value:lastDay;
 a=a<earliest?earliest:a>lastDay?lastDay:a;b=b<a?a:b>lastDay?lastDay:b;
 return [a,b];
}
function updateCacheRows(){
 for(const id of ['TAIEX','TWTECH'])rows[id]=clean([...(id==='TAIEX'?seedTAIEX:[]),...Object.values(cache[id]).flat()],'index').filter(([d])=>d<=lastDay);
}
function coverage(){
 const div=$('cm-coverage');div.replaceChildren();
 for(const id of ids){
  const p=attach(div,'div');attach(p,'strong',series[id].name);
  attach(p,'span',rows[id].length?rows[id][0][0]+' ～ '+rows[id].at(-1)[0]:us.includes(id)?'待匯入官方資料':'等待官方來源');
 }
 $('cm-forget').hidden=!us.some(id=>rows[id].length);
}
async function requested(url){
 const r=await fetch(url,{signal:AbortSignal.timeout(16000),cache:'no-store'});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r.json();
}
const source=id=>id==='TAIEX'?'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST':'https://www.twse.com.tw/rwd/zh/TAIEX/EFTRI_HIST';
const current=lastDay.slice(0,7);
let running=false;
async function seedIndex(){
 try{
  const res=await fetch('../positioning/taiex-ohlc.csv',{signal:AbortSignal.timeout(8000)});
  if(!res.ok)return;
  const [head,...lines]=(await res.text()).trim().split(/\r?\n/);
  const cols=head.replace(/^\uFEFF/,'').split(','),d=cols.indexOf('date'),v=cols.indexOf('close');
  if(d<0||v<0)return;
  seedTAIEX=clean(lines.map(line=>{const arr=line.split(',');return [arr[d],Number(arr[v])];}),'index').filter(([dt])=>dt>=twStart&&dt<=lastDay);
  updateCacheRows();rerender();
 }catch{}
}
async function refresh(){
 if(running)return;running=true;$('cm-refresh').disabled=true;
 const status=$('cm-data-status');
 const available={TAIEX:specMonths.filter(m=>cache.TAIEX[m]?.length).length,TWTECH:specMonths.filter(m=>cache.TWTECH[m]?.length).length};
 status.textContent='讀取 TWSE 六年歷史與 NY Fed；歷史月份僅下載一次，已取得資料先顯示。';
 const rateTask=(async()=>{
  try{
   const j=await requested('https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate='+twStart+'&endDate='+lastDay);
   if(!Array.isArray(j.refRates))throw Error('EFFR 欄位不符');
   const rate=clean(j.refRates.filter(r=>r.type==='EFFR'&&r.percentRate!=null).map(r=>[r.effectiveDate,Number(r.percentRate)]),'rate').filter(([d])=>d<=lastDay);
   if(!rate.length)throw Error('EFFR 無資料');rows.FED=rate;write(rateKey,{rows:rate});rerender();
  }catch{}
 })();
 // Load recent months first, preserve completed months, and avoid creating a request storm.
 // Each cycle schedules no more than one request to each report endpoint.
 const jobs=specMonths.slice().reverse().filter(m=>m===current||!cache.TAIEX[m]?.length||!cache.TWTECH[m]?.length);
 let misses=0;
 for(const [i,m] of jobs.entries()){
  const result=await Promise.allSettled(['TAIEX','TWTECH'].map(async id=>{
   if(m!==current&&cache[id][m]?.length)return;
   const payload=await requested(source(id)+'?date='+m.replace('-','')+'01&response=json');
   cache[id][m]=parseTaiwan(payload,id,m);available[id]=specMonths.filter(x=>cache[id][x]?.length).length;
  }));
  if(result.some(x=>x.status==='rejected'))misses++;else misses=0;
  if(i===0||i%5===4||i===jobs.length-1){
   write(twKey,cache);updateCacheRows();rerender();
   status.textContent='台股載入中：加權 '+available.TAIEX+'／'+specMonths.length+' 月，電子 '+available.TWTECH+'／'+specMonths.length+' 月。';
  }
  if(misses>=4)break; // Click refresh to resume from cache when source throttles or is unavailable.
  if(i<jobs.length-1)await sleep(200);
 }
 await rateTask;write(twKey,cache);updateCacheRows();rerender();
 const ok=available.TAIEX===specMonths.length&&available.TWTECH===specMonths.length&&rows.FED.length;
 status.textContent='台股歷史：加權 '+available.TAIEX+'／'+specMonths.length+' 月，電子 '+available.TWTECH+'／'+specMonths.length+' 月。'+(ok?' 官方資料已就緒。':' 未齊的月份留空；可稍後按「更新」接續讀取。');
 if(!rows.FED.length)status.textContent+=' NY Fed 暫未回傳可用資料。';
 running=false;$('cm-refresh').disabled=false;
}
function monthEvent(){
 const payload=Object.fromEntries(['TAIEX','COMP','SOX'].map(id=>[id,completeMonthCloses(rows[id],today)]));
 window.CrossmarketCloses=payload;
 window.dispatchEvent(new CustomEvent('crossmarket:closes',{detail:payload}));
}
function table(a,b){
 b=b>completedThrough?completedThrough:b;
 const maps=Object.fromEntries(ids.map(id=>[id,changes(rows[id],a,b,series[id].kind)]));
 const t=$('cm-correlation');t.replaceChildren();const h=t.createTHead().insertRow();attach(h,'th','序列');
 ids.forEach(id=>{const th=attach(h,'th',series[id].short);th.scope='col';});
 const body=t.createTBody();for(const i of ids){
  const tr=body.insertRow();attach(tr,'th',series[i].short).scope='row';
  for(const j of ids){
   const td=tr.insertCell(),{r,n,reason}=pearson(maps[i],maps[j]),btn=attach(td,'button',r===null?'—':r.toFixed(2));
   btn.type='button';attach(btn,'small','n='+n);const msg=series[i].name+' × '+series[j].name+'：'+(r===null?reason:'r = '+r.toFixed(3))+'（n = '+n+' 週）';
   btn.title=msg;btn.setAttribute('aria-label',msg);btn.addEventListener('click',()=>$('cm-corr-detail').textContent=msg);
   if(r!==null)td.style.background=r>=0?'rgb(2 104 172 / '+(.08+.24*r)+')':'rgb(202 67 76 / '+(.08-.24*r)+')';
  }
 }
 $('cm-corr-detail').textContent='點選格子可查看配對樣本數。';
}
const SVG='http://www.w3.org/2000/svg';
function se(parent,n,attrs,text){
 const e=document.createElementNS(SVG,n);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,v));if(text!=null)e.textContent=text;parent.append(e);return e;
}
function chart(host,isMacro,bounds,expanded=false){
 const [a,b]=bounds;host.replaceChildren();
 const selected=isMacro?['VIX','FED']:['TAIEX','TWTECH','COMP','SOX'];
 const by=Object.fromEntries(selected.map(id=>{
  const raw=weekClose(rows[id],a,b);const vals=[...raw].map(([t,[d,v]])=>({t,d,v}));
  const base=vals[0]?.v||1;
  return [id,vals.map(o=>({...o,y:isMacro?o.v:100*o.v/base}))];
 }));
 if(!selected.some(id=>by[id].length)){attach(host,'p','這個區間沒有可用資料。請更新官方資料或匯入 FRED。','cm-empty');return;}
 const w=Math.max(248,host.clientWidth-12),h=expanded?Math.min(625,Math.max(365,innerHeight-160)):isMacro?320:300;
 host.style.setProperty('--cm-height',h+'px');
 const left=w<430?41:55,right=w-10, top=16,bottom=h-26;
 const from=week(a),to=Math.max(week(b),from+7*DAY);
 const x=t=>left+(t-from)/(to-from)*(right-left);
 const svg=se(host,'svg',{viewBox:'0 0 '+w+' '+h,role:'img',tabindex:0,'aria-label':'週收盤走勢。以左右方向鍵逐週查值。'});
 const legend=attach(host,'div',null,'cm-chart-legend');
 const datum=attach(host,'div','點圖或用方向鍵查值。','cm-datum');
 const panels=isMacro?[[['VIX'],top,Math.floor(h*.49),'點'],[['FED'],Math.floor(h*.56),bottom,'%']]:[[selected,top,bottom,'']];
 for(const [k,y0,y1,unit] of panels){
  const vs=k.flatMap(id=>by[id].map(o=>o.y));
  if(!vs.length){se(svg,'text',{x:left,y:(y0+y1)/2,fill:'#55677d','font-size':11},series[k[0]].name+'：待載入');continue;}
  const min=Math.min(...vs),max=Math.max(...vs),m=Math.max((max-min)*.11,Math.abs(max)*.005,.02),low=isMacro?Math.max(0,min-m):min-m,high=Math.max(max+m,low+.02);
  const y=v=>y1-(v-low)/(high-low)*(y1-y0);
  for(let i=0;i<4;i++){
   const value=low+(high-low)*i/3,q=y(value);
   se(svg,'line',{x1:left,x2:right,y1:q,y2:q,stroke:'#e1ebf3'});
   se(svg,'text',{x:left-5,y:q+3,'text-anchor':'end',fill:'#52667d','font-size':w<430?8:10},fmt(value)+unit);
  }
  for(const id of k){
   let path='',last=null;const v=by[id];
   for(const o of v){const op=last!==null&&o.t-last===7*DAY?'L':'M';path+=op+x(o.t).toFixed(1)+','+y(o.y).toFixed(1);last=o.t;}
   if(path)se(svg,'path',{d:path,fill:'none',stroke:series[id].color,'stroke-width':2,'vector-effect':'non-scaling-stroke','data-series':id,'stroke-linejoin':'round'});
   if(v.length===1)se(svg,'circle',{cx:x(v[0].t),cy:y(v[0].y),r:3,fill:series[id].color});
  }
 }
 const ticks=w<440?3:6;
 for(let i=0;i<=ticks;i++){const t=from+(to-from)*i/ticks,q=x(t);se(svg,'text',{x:q,y:h-8,fill:'#52667d','font-size':w<430?9:10,'text-anchor':i===0?'start':i===ticks?'end':'middle'},iso(t).slice(0,7));}
 for(const id of selected){if(!by[id].length)continue;const sp=attach(legend,'span');const dot=attach(sp,'i',null,'cm-series-dot');dot.style.background=series[id].color;sp.append(series[id].name);}
 const dates=[...new Set(selected.flatMap(id=>by[id].map(v=>v.t)))].sort((a,b)=>a-b);
 const look=Object.fromEntries(selected.map(id=>[id,new Map(by[id].map(v=>[v.t,v]))]));
 const cursor=se(svg,'line',{x1:left,x2:left,y1:top,y2:bottom,stroke:'#1d5475','stroke-width':1,'stroke-dasharray':'4 3',visibility:'hidden','pointer-events':'none'});
 let j=dates.length-1;
 function show(i){
  j=clamp(i,0,dates.length-1);const t=dates[j];if(!Number.isFinite(t))return;
  cursor.setAttribute('x1',x(t));cursor.setAttribute('x2',x(t));cursor.setAttribute('visibility','visible');datum.replaceChildren();
  attach(datum,'strong',iso(t)+' 週');
  for(const id of selected){const hit=look[id].get(t);if(hit)attach(datum,'span',series[id].short+' '+fmt(hit.v)+(id==='FED'?'%':'')+'（'+hit.d.slice(5)+'）');}
 }
 function pick(e){const box=svg.getBoundingClientRect(),tx=(e.clientX-box.left)*w/box.width,want=from+(tx-left)/(right-left)*(to-from);let best=0;for(let i=1;i<dates.length;i++)if(Math.abs(dates[i]-want)<Math.abs(dates[best]-want))best=i;show(best);}
 svg.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')pick(e);});svg.addEventListener('pointerdown',pick);
 svg.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(j+(e.key==='ArrowLeft'?-1:1));}});
}
let plotFrame;
const dialog=document.createElement('dialog');dialog.className='cm-dialog';
const close=attach(dialog,'button','關閉','cm-dialog-close');close.addEventListener('click',()=>dialog.close());
const modalHost=attach(dialog,'div',null,'cm-plot');document.body.append(dialog);
let modalMacro=false;
function plots(){
 const b=bounds();chart($('cm-indices'),false,b);chart($('cm-macro'),true,b);
 if(dialog.open)chart(modalHost,modalMacro,b,true);
}
function draw(){const b=bounds();plots();table(...b);window.dispatchEvent(new CustomEvent('crossmarket:range',{detail:{start:b[0],end:b[1]}}));}
function rerender(){coverage();draw();monthEvent();}
window.addEventListener('resize',()=>{cancelAnimationFrame(plotFrame);plotFrame=requestAnimationFrame(plots);});
document.querySelectorAll('[data-expand]').forEach(btn=>btn.addEventListener('click',()=>{modalMacro=btn.dataset.expand==='cm-macro';dialog.showModal();chart(modalHost,modalMacro,bounds(),true);}));
document.querySelectorAll('[data-years]').forEach(btn=>btn.addEventListener('click',()=>{const before=yearsBefore(end.value||lastDay,Number(btn.dataset.years));start.value=before<earliest?earliest:before;document.querySelectorAll('[data-years]').forEach(b=>b.setAttribute('aria-pressed',b===btn?'true':'false'));draw();}));
for(const i of [start,end])i.addEventListener('change',()=>{const [a,b]=bounds();start.value=a;end.value=b;document.querySelectorAll('[data-years]').forEach(el=>el.setAttribute('aria-pressed','false'));draw();});
$('cm-refresh').addEventListener('click',()=>refresh());
$('cm-import').addEventListener('change',async e=>{
 const info=$('cm-import-status'), files=[...e.currentTarget.files], input=e.currentTarget;
 if(!files.length)return;
 const incoming={};try{
  for(const file of files){
   if(file.size>5_000_000)throw Error('檔案過大，單檔上限 5 MB');
   const texts=/\.zip$/i.test(file.name)?await zipCsv(await file.arrayBuffer()):[await file.text()];
   for(const csv of texts)for(const [id,v] of Object.entries(parseFred(csv)))if(us.includes(id))incoming[id]=[...(incoming[id]||[]),...v];
  }
  if(!Object.keys(incoming).length)throw Error('找不到 FRED 的 NASDAQCOM、NASDAQSOX 或 VIXCLS 欄位');
  for(const [id,v] of Object.entries(incoming))rows[id]=clean([...rows[id],...v],series[id].kind).filter(([d])=>d>=twStart&&d<=today);
  const saved=write(localUS,Object.fromEntries(us.map(id=>[id,rows[id]])));
  info.textContent='已匯入 '+Object.keys(incoming).map(id=>series[id].name).join('、')+'；'+(saved?'只保留於此瀏覽器。':'瀏覽器拒絕儲存，僅本次開啟有效。');rerender();
 }catch(error){info.textContent='無法匯入：'+error.message;}finally{input.value='';}
});
$('cm-forget').addEventListener('click',()=>{clear(localUS);for(const id of us)rows[id]=[];$('cm-import-status').textContent='已清除本機匯入的美股資料。';rerender();});
$('cm-official').addEventListener('toggle',()=>{
 if(!$('cm-official').open||$('cm-official-plots').children.length)return;
 for(const [id,label] of [['NASDAQCOM','Nasdaq Composite'],['NASDAQSOX','PHLX SOX'],['VIXCLS','Cboe VIX']]){
  const link=attach($('cm-official-plots'),'a');link.href='https://fred.stlouisfed.org/series/'+id;link.target='_blank';link.rel='noopener';
  const img=attach(link,'img');img.alt=label+' 走勢，開啟 FRED 來源';img.src=photo+'?id='+id+'&cosd='+earliest;
 }
});
updateCacheRows();rerender();seedIndex();refresh();
